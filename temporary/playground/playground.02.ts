/**
 * Decorator that wraps a method with retry and timeout logic.
 *
 * @param options.maxRetries         Maximum number of retries (default: 3)
 * @param options.delayBetweenRetries Delay (in seconds) between retries (default: 1)
 * @param options.timeout            Total allowed time (in seconds) for the operation (default: 60)
 * @param options.timeoutMessage     Error message in case of timeout (default: 'Timeout exceeded.')
 */
function runWithRetryAndTimeout(
    options?: {
        maxRetries?: number;
        delayBetweenRetries?: number;
        timeout?: number;
        timeoutMessage?: string;
    }
): MethodDecorator {
    const {
        maxRetries = 3,
        delayBetweenRetries = 1,
        timeout = 60,
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

// Example usage in a service class.
class ExampleService {
    private callCount = 0;

    /**
     * A simulated unstable operation that only succeeds on the third call.
     */
    @runWithRetryAndTimeout({
        maxRetries: 5,
        delayBetweenRetries: 1,
        timeout: 60,
        timeoutMessage: 'Operation timed out.'
    })
    async unstableOperation(): Promise<string> {
        this.callCount++;
        console.log(`Attempt ${this.callCount}`);

        // Fail the first two times to simulate instability.
        if (this.callCount < 3) {
            throw new Error('Temporary failure. Please try again.');
        }
        return 'Operation succeeded!';
    }
}

// Test runner to demonstrate the decorator in action.
(async (): Promise<void> => {
    const service = new ExampleService();
    try {
        const result = await service.unstableOperation();
        console.log('Result:', result);
    } catch (error: any) {
        console.error('Operation failed:', error.message);
    }
})();
