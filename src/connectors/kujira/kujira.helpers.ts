import { KujiraConfig } from './kujira.config';

/**
 *
 * @param value
 * @param errorMessage
 */
export const getNotNullOrThrowError = <R>(
  value?: any,
  errorMessage: string = 'Value is null or undefined'
): R => {
  if (value === undefined || value === null) throw new Error(errorMessage);

  return value as R;
};

/**
 *
 * @param milliseconds
 */
export const sleep = (milliseconds: number) =>
  new Promise((callback) => setTimeout(callback, milliseconds));

/**
 * Same as Promise.all(items.map(item => task(item))), but it waits for
 * the first {batchSize} promises to finish before starting the next batch.
 *
 * @template A
 * @template B
 * @param {function(A): B} task The task to run for each item.
 * @param {A[]} items Arguments to pass to the task for each call.
 * @param {int} batchSize The number of items to process at a time.
 * @param {int} delayBetweenBatches Delay between each batch (milliseconds).
 * @returns {B[]}
 */
export const promiseAllInBatches = async <I, O>(
  task: (item: I) => Promise<O>,
  items: any[],
  batchSize: number = KujiraConfig.config.parallel.all.batchSize,
  delayBetweenBatches: number = KujiraConfig.config.parallel.all
    .delayBetweenBatches
): Promise<O[]> => {
  let position = 0;
  let results: any[] = [];

  if (!batchSize) {
    batchSize = items.length;
  }

  while (position < items.length) {
    const itemsForBatch = items.slice(position, position + batchSize);
    results = [
      ...results,
      ...(await Promise.all(itemsForBatch.map((item) => task(item)))),
    ];
    position += batchSize;

    if (position < items.length) {
      if (delayBetweenBatches > 0) {
        await sleep(delayBetweenBatches);
      }
    }
  }

  return results;
};

/**
 * @param targetObject
 * @param targetFunction
 * @param targetParameters
 * @param maxNumberOfRetries 0 means no retries
 * @param delayBetweenRetries 0 means no delay (milliseconds)
 * @param timeout 0 means no timeout (milliseconds)
 * @param timeoutMessage
 */
export const runWithRetryAndTimeout = async <R>(
  targetObject: any,
  targetFunction: (...args: any[]) => R,
  targetParameters: any,
  maxNumberOfRetries: number = KujiraConfig.config.retry.all.maxNumberOfRetries,
  delayBetweenRetries: number = KujiraConfig.config.retry.all
    .delayBetweenRetries,
  timeout: number = KujiraConfig.config.timeout.all,
  timeoutMessage: string = 'Timeout exceeded.'
): Promise<R> => {
  const errors = [];
  let retryCount = 0;
  let timer: any;

  if (timeout > 0) {
    timer = setTimeout(() => new Error(timeoutMessage), timeout);
  }

  do {
    try {
      const result = await targetFunction.apply(targetObject, targetParameters);

      if (timeout > 0) {
        clearTimeout(timer);
      }

      return result as R;
    } catch (error: any) {
      errors.push(error);

      retryCount++;

      console.debug(
        `${targetObject?.constructor.name || targetObject}:${
          targetFunction.name
        } => retry ${retryCount} of ${maxNumberOfRetries}`
      );

      if (retryCount < maxNumberOfRetries) {
        if (delayBetweenRetries > 0) {
          await sleep(delayBetweenRetries);
        }
      } else {
        const allErrors = Error(
          `Failed to execute "${
            targetFunction.name
          }" with ${maxNumberOfRetries} retries. All error messages were:\n${errors
            .map((error: any) => error.message)
            .join(';\n')}\n`
        );

        allErrors.stack = error.stack;

        console.error(allErrors);

        throw allErrors;
      }
    }
  } while (retryCount < maxNumberOfRetries);

  throw Error('Unknown error.');
};

export const isValidKujiraPublicKey = (publicKey: string): boolean => {
  return /^kujira([a-z0-9]){39}$/.test(publicKey);
};

export const isKujiraPrivateKey = (privateKey: string): boolean => {
  return /^(?:\b[a-z]+\b(?:\s|$)){12}(?:(?:\b[a-z]+\b(?:\s|$)){12})?$/.test(
    privateKey
  );
};
