// noinspection JSUnusedGlobalSymbols
/**
 *
 */
export class Constant {
    static defaultTimeout = new Constant('Default Timeout', 'Default timeout.', 60);
    static defaultMaxNumberOfRetries = new Constant('Default Max Number of Retries', 'Default max number of retries.', 3);
    static defaultDelayDelayBetweenRetries = new Constant('Default Delay Between Retries', 'Default delay between retries.', 5);
    static defaultBatchSize = new Constant('Default Batch Size', 'Default batch size.', 100);
    static defaultDelayBetweenBatches = new Constant('Default Delay Between Batches', 'Default delay between batches.', 5);

    title: string;

    description: string;

    value: any;

    /**
     *
     * @param title
     * @param description
     * @param value
     */
    constructor(title: string, description: string, value: any) {
        this.title = title;
        this.description = description;
        this.value = value;
    }

    getValueAs<T>(): T {
        return this.value as T;
    }
}


/**
 *
 * @param value
 * @param errorMessage
 */
export const getNotNullOrThrowError = <R>(
    value?: any,
    errorMessage: string = 'Value is null or undefined'
): R => {
    if (value === undefined || value === null)
        throw new Error(errorMessage);

    return value as R;
};

/**
 *
 * @param value
 * @param defaultValue
 */
export const getOrDefault = <R>(value: any, defaultValue: R): R => {
    if (value === undefined || value === null) return defaultValue;

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
    batchSize: number = Constant.defaultBatchSize.getValueAs<number>(),
    delayBetweenBatches: number = Constant.defaultDelayBetweenBatches.getValueAs<number>()
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
    maxNumberOfRetries: number = Constant.defaultMaxNumberOfRetries.getValueAs<number>(),
    delayBetweenRetries: number = Constant.defaultDelayDelayBetweenRetries.getValueAs<number>(),
    timeout: number = Constant.defaultTimeout.getValueAs<number>(),
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

export function* splitInChunks<T>(
    target: T[],
    quantity: number
): Generator<T[], void> {
    for (let i = 0; i < target.length; i += quantity) {
        yield target.slice(i, i + quantity);
    }
}

// /**
//  * Decorator that wraps a method with retry and timeout logic.
//  *
//  * @param options.maxRetries         Maximum number of retries (default: 3)
//  * @param options.delayBetweenRetries Delay (in ms) between retries (default: 1000)
//  * @param options.timeout            Total allowed time (in ms) for the operation (default: 5000)
//  * @param options.timeoutMessage     Error message in case of timeout (default: 'Timeout exceeded.')
//  */
// function runWithRetryAndTimeout(
//     options?: {
//         maxRetries?: number;
//         delayBetweenRetries?: number;
//         timeout?: number;
//         timeoutMessage?: string;
//     }
// ) {
//     const {
//       maxRetries = 3,
//       delayBetweenRetries = 1000,
//       timeout = 5000,
//       timeoutMessage = 'Timeout exceeded.'
//     } = options || {};
  
//     return function (
//       target: any,
//       propertyKey: string,
//       descriptor: PropertyDescriptor
//     ) {
//       const originalMethod = descriptor.value;
  
//       descriptor.value = async function (...args: any[]) {
//         // Helper to delay execution.
//         const sleep = (ms: number) =>
//           new Promise<void>((resolve) => setTimeout(resolve, ms));
  
//         // Function that performs the retries.
//         const callWithRetries = async (): Promise<any> => {
//           const errors: Error[] = [];
  
//           for (let attempt = 0; attempt < maxRetries; attempt++) {
//             try {
//               // Execute the original method with proper binding.
//               const result = await originalMethod.apply(this, args);
//               return result;
//             } catch (error: any) {
//               errors.push(error);
//               console.debug(
//                 `${target.constructor.name}.${propertyKey} => attempt ${attempt + 1} of ${maxRetries} failed`
//               );
  
//               // If more retries remain, wait before retrying.
//               if (attempt < maxRetries - 1 && delayBetweenRetries > 0) {
//                 await sleep(delayBetweenRetries);
//               }
//             }
//           }
//           // Aggregate all error messages for clarity.
//           const aggregatedErrors = errors.map(err => err.message).join(';\n');
//           throw new Error(
//             `Failed to execute "${propertyKey}" after ${maxRetries} retries. Errors:\n${aggregatedErrors}`
//           );
//         };
  
//         // If timeout is set, race retry logic against a timeout promise.
//         if (timeout > 0) {
//           return await Promise.race([
//             callWithRetries(),
//             new Promise((_, reject) =>
//               setTimeout(() => reject(new Error(timeoutMessage)), timeout)
//             )
//           ]);
//         } else {
//           return await callWithRetries();
//         }
//       };
  
//       return descriptor;
//     };
// }
