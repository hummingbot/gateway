type ThrottleOptions = {
  limit: number;
  interval: number;
  strict: boolean;
};

export class AbortError extends Error {
  constructor() {
    super('Throttled function aborted');
    this.name = 'AbortError';
  }
}

export default function pThrottle({
  limit,
  interval,
  strict,
}: ThrottleOptions) {
  if (!Number.isFinite(limit)) {
    throw new TypeError('Expected `limit` to be a finite number');
  }

  if (!Number.isFinite(interval)) {
    throw new TypeError('Expected `interval` to be a finite number');
  }

  const queue = new Map<number, (reason: AbortError) => void>();

  let currentTick = 0;
  let activeCount = 0;

  function windowedDelay(): number {
    const now = Date.now();

    if (now - currentTick > interval) {
      activeCount = 1;
      currentTick = now;
      return 0;
    }

    if (activeCount < limit) {
      activeCount++;
    } else {
      currentTick += interval;
      activeCount = 1;
    }

    return currentTick - now;
  }

  const strictTicks: number[] = [];

  function strictDelay(): number {
    const now = Date.now();

    if (strictTicks.length < limit) {
      strictTicks.push(now);
      return 0;
    }

    const earliestTime = strictTicks.shift()! + interval;

    if (now >= earliestTime) {
      strictTicks.push(now);
      return 0;
    }

    strictTicks.push(earliestTime);
    return earliestTime - now;
  }

  const getDelay = strict ? strictDelay : windowedDelay;

  return <T extends (...args: any[]) => any>(function_: T) => {
    const throttled = function (
      this: ThisParameterType<T>,
      ...args: Parameters<T>
    ) {
      if (!throttled.isEnabled) {
        return (async () => function_.apply(this, args))();
      }

      let timeout: any;
      return new Promise((resolve, reject) => {
        const execute = () => {
          resolve(function_.apply(this, args));
          queue.delete(timeout);
        };

        timeout = setTimeout(execute, getDelay());

        queue.set(timeout, reject);
      }) as ReturnType<T>;
    };

    throttled.abort = () => {
      for (const timeout of queue.keys()) {
        clearTimeout(timeout);
        queue.get(timeout)!(new AbortError());
      }

      queue.clear();
      strictTicks.splice(0, strictTicks.length);
    };

    throttled.isEnabled = true;

    return throttled;
  };
}
