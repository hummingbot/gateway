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
