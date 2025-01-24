import { getNotNullOrThrowError, getOrDefault, promiseAllInBatches, runWithRetryAndTimeout, sleep, splitInChunks } from "../../../src/chains/ton/ton.utils";

describe('ton.utils', () => {
    describe('getNotNullOrThrowError', () => {
        it('should return the value if it is not null or undefined', () => {
            expect(getNotNullOrThrowError('test')).toBe('test');
        });

        it('should throw an error if the value is null', () => {
            expect(() => getNotNullOrThrowError(null)).toThrow('Value is null or undefined');
        });

        it('should throw an error if the value is undefined', () => {
            expect(() => getNotNullOrThrowError(undefined)).toThrow('Value is null or undefined');
        });
    });

    describe('getOrDefault', () => {
        it('should return the value if it is not null or undefined', () => {
            expect(getOrDefault('test', 'default')).toBe('test');
        });

        it('should return the default value if the value is null', () => {
            expect(getOrDefault(null, 'default')).toBe('default');
        });

        it('should return the default value if the value is undefined', () => {
            expect(getOrDefault(undefined, 'default')).toBe('default');
        });
    });

    describe('sleep', () => {
        it('should resolve after the specified time', async () => {
            const start = Date.now();
            await sleep(100);
            const end = Date.now();
            expect(end - start).toBeGreaterThanOrEqual(50);
        });
    });

    describe('promiseAllInBatches', () => {
        it('should process items in batches', async () => {
            const task = jest.fn(async (item) => item * 2);
            const items = [1, 2, 3, 4, 5];
            const result = await promiseAllInBatches(task, items, 2, 50);
            expect(result).toEqual([2, 4, 6, 8, 10]);
            expect(task).toHaveBeenCalledTimes(5);
        });
    });

    describe('runWithRetryAndTimeout', () => {
        it('should retry the function if it fails', async () => {
            const targetFunction = jest.fn()
                .mockRejectedValueOnce(new Error('fail'))
                .mockResolvedValue('success');
            const result = await runWithRetryAndTimeout({}, targetFunction, [], 2, 50, 0);
            expect(result).toBe('success');
            expect(targetFunction).toHaveBeenCalledTimes(2);
        });

        it('should throw an error after max retries', async () => {
            const targetFunction = jest.fn().mockRejectedValue(new Error('fail'));
            await expect(runWithRetryAndTimeout({}, targetFunction, [], 2, 50, 0))
                .rejects.toThrow('Failed to execute');
            expect(targetFunction).toHaveBeenCalledTimes(2);
        });
    });

    describe('splitInChunks', () => {
        it('should split array into chunks', () => {
            const array = [1, 2, 3, 4, 5];
            const chunks = Array.from(splitInChunks(array, 2));
            expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
        });
    });
});
