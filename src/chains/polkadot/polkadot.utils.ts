import {BN} from 'bn.js';

/**
 * Converts an amount from base units to human-readable form
 * @param amount Amount in base units (as string to handle large numbers)
 * @param decimals Number of decimals for the token
 * @returns The human-readable decimal value
 */
export function fromBaseUnits(amount: string, decimals: number): number {
  const divisor = new BN(10).pow(new BN(decimals));
  const amountBN = new BN(amount);
  const wholePart = amountBN.div(divisor).toString();

  const fractionalBN = amountBN.mod(divisor);
  let fractionalPart = fractionalBN.toString().padStart(decimals, '0');

  // Trim trailing zeros
  while (fractionalPart.endsWith('0') && fractionalPart.length > 0) {
    fractionalPart = fractionalPart.slice(0, -1);
  }

  // Format for JS number conversion
  const result = `${wholePart}${fractionalPart.length > 0 ? '.' + fractionalPart : ''}`;
  return parseFloat(result);
}

/**
 * Converts from a human-readable decimal to base units
 * @param amount Amount in human-readable form
 * @param decimals Number of decimals for the token
 * @returns The amount in base units as a string
 */
export function toBaseUnits(amount: number, decimals: number): string {
  // Convert to string for precision
  const amountStr = amount.toString();

  // Split by decimal point
  const parts = amountStr.split('.');
  const wholePart = parts[0];
  const fractionalPart =
    parts.length > 1
      ? parts[1].padEnd(decimals, '0').slice(0, decimals)
      : '0'.repeat(decimals);

  // Combine and convert to BN
  const result = wholePart + fractionalPart;

  // Remove leading zeros
  return new BN(result).toString();
}

// noinspection JSUnusedGlobalSymbols
/**
 *
 */
export class Constant {
    // TODO: revert to 60s!!!
    static defaultTimeout = new Constant('Default Timeout', 'Default timeout.', 999);
    static defaultMaxNumberOfRetries = new Constant('Default Max Number of Retries', 'Default max number of retries.', 3);
    static defaultDelayBetweenRetries = new Constant('Default Delay Between Retries', 'Default delay between retries.', 5);
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

// noinspection JSUnusedGlobalSymbols
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
// noinspection JSUnusedGlobalSymbols
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
// noinspection JSUnusedGlobalSymbols
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

// noinspection JSUnusedGlobalSymbols
export function* splitInChunks<T>(
    target: T[],
    quantity: number
): Generator<T[], void> {
    for (let i = 0; i < target.length; i += quantity) {
        yield target.slice(i, i + quantity);
    }
}

/**
 * Decorator that wraps a method with retry and timeout logic.
 *
 * @param options.maxRetries         Maximum number of retries (default: 3)
 * @param options.delayBetweenRetries Delay (in seconds) between retries (default: 1)
 * @param options.timeout            Total allowed time (in seconds) for the operation (default: 60)
 * @param options.timeoutMessage     Error message in case of timeout (default: 'Timeout exceeded.')
 */
export function runWithRetryAndTimeout(
    options?: {
        maxRetries?: number;
        delayBetweenRetries?: number;
        timeout?: number;
        timeoutMessage?: string;
    }
): MethodDecorator {
    const {
        maxRetries = Constant.defaultMaxNumberOfRetries.getValueAs<number>(),
        delayBetweenRetries = Constant.defaultDelayBetweenRetries.getValueAs<number>(),
        timeout = Constant.defaultTimeout.getValueAs<number>(),
        timeoutMessage = 'Timeout exceeded.'
    } = options || {};
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor {
        const originalMethod = descriptor.value;
        if (typeof originalMethod !== 'function') {
            throw new Error('Decorator can only be applied to methods');
        }

        // Replace the original method with one that incorporates retry and timeout logic.
        descriptor.value = async function (...args: any[]): Promise<any> {
            const sleep = (ms: number): Promise<void> =>
                new Promise<void>((resolve) => setTimeout(resolve, Math.floor(ms)));

            // Function that performs the retries.
            const callWithRetries = async (): Promise<any> => {
                const errors: Error[] = [];

                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        // Execute the original method with correct binding.
                        const result = await originalMethod.apply(this, args);
                        return result;
                    } catch (error: any) {
                        errors.push(error);
                        console.debug(
                            `${(target as any).constructor.name}.${String(propertyKey)} => attempt ${attempt + 1} of ${maxRetries} failed`
                        );

                        // Wait before retrying if there are remaining attempts.
                        if (attempt < maxRetries - 1 && delayBetweenRetries > 0) {
                            await sleep(delayBetweenRetries * 1000);
                        }
                    }
                }
                // Aggregate all error messages.
                const aggregatedErrors = errors.map(err => err.message).join(';\n');
                throw new Error(
                    `Failed to execute "${String(propertyKey)}" after ${maxRetries} retries. Errors:\n${aggregatedErrors}`
                );
            };

            // Race the retry logic against a timeout promise if timeout is set.
            if (timeout > 0) {
                return await Promise.race([
                    callWithRetries(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(timeoutMessage)), Math.floor(timeout * 1000))
                    )
                ]);
            } else {
                return await callWithRetries();
            }
        };

        return descriptor;
    };
}