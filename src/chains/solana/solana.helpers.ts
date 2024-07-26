import { default as constants } from './../../chains/solana/solana.constants';

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
  maxNumberOfRetries: number = constants.retry.all.maxNumberOfRetries,
  delayBetweenRetries: number = constants.retry.all.delayBetweenRetries,
  timeout: number = constants.timeout.all,
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

        throw allErrors;
      }
    }
  } while (retryCount < maxNumberOfRetries);

  throw Error('Unknown error.');
};

export function* splitInChunks<T>(
  target: T[],
  quantity: number
): Generator<T[], void> {
  for (let i = 0; i < target.length; i += quantity) {
    yield target.slice(i, i + quantity);
  }
}
