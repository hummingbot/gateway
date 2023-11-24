import pThrottle from './pThrottle';
import promiseRetry from 'promise-retry';

export const ThrottleRate = 60;

export const ThrottleIntervalMilliseconds = 1000; // one second

export const ThrottleWrapper = pThrottle({
  limit: ThrottleRate, // maximum number of calls within an interval
  interval: ThrottleIntervalMilliseconds, // the length of the interval, it will stop running after this time has passed
  strict: false,
});

// the rule of thumb is that you should only use this on functions that are
// are not using this internally. For example if function 'f' uses
// throttleRetryWrapper, when you call 'f', do not wrap it in 'f'.
export function throttleRetryWrapper<T>(f: () => Promise<T>): Promise<T> {
  const wrappedFunc: () => Promise<T> = ThrottleWrapper(f);
  return promiseRetry(
    async (retry: (error: any) => never, _: number): Promise<T> => {
      try {
        return await wrappedFunc();
      } catch (e) {
        retry(e);
      }
    },
    { retries: 10, maxTimeout: 1000 }
  );
}
