import { TonController } from '../../../src/chains/ton/ton.controller';
import { Ton } from '../../../src/chains/ton/ton';
import { Stonfi } from '../../../src/connectors/ston_fi/ston_fi'
import { patch, unpatch } from '../../../test/services/patch';
import {
    AssetsRequest,
    PollRequest,
} from '../../../src/chains/ton/ton.requests';
import {
    getNotNullOrThrowError,
    getOrDefault,
    promiseAllInBatches,
    runWithRetryAndTimeout,
    sleep,
} from '../../../src/chains/ton/ton.utils';
import { getHttpEndpoint } from '@orbs-network/ton-access';

export interface BalanceRequest {
    chain: string;
    network: string;
    address: string;
    tokenSymbols: string[];
}

let ton: Ton;
let stonfi: Stonfi;

const payload = {
    walletAddress: 'EQBSevYG7uExE6wJnWC2adG2SqcjUUqNlmeTRMFhHT3kToY',
    queryId: 100000000374351,
};
const mockBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');

const EXPECTED_CURRENT_BLOCK_NUMBER = 100;
const NETWORK = 'mainnet';
const MOCK_TX_HASH = `hb-ton-stonfi-${mockBase64}`;
console.log(MOCK_TX_HASH);
const MOCK_ADDRESS = 'mock-address';
const MOCK_ASSET_SYMBOL = 'TON';

beforeAll(async () => {
    ton = Ton.getInstance(NETWORK);
    stonfi = Stonfi.getInstance(NETWORK);

    patch(ton, 'getTransaction', async (txHash) => {
        expect(txHash).toBe(MOCK_TX_HASH);
        return {
            transaction: {
                block: '(1,2,3)',
                hash: MOCK_TX_HASH,
                totalFees: '50000',
            },
        };
    });
    patch(ton, 'getCurrentBlockNumber', async () => ({
        seqno: EXPECTED_CURRENT_BLOCK_NUMBER,
    }));
    patch(stonfi, 'waitForConfirmation', jest.fn(async () => ({
        '@type': 'Found',
        logicalTime: '200',
        txHash: MOCK_TX_HASH,
        coins: '1000000000',
    })));
    patch(stonfi, 'getSwapStatus', jest.fn(async () => ({
        '@type': 'Found',
        address: 'mock-address',
        balanceDeltas: 'mock-balance-deltas',
        coins: '1000000000',
        exitCode: '0',
        logicalTime: '200',
        queryId: 'mock-query-id',
        txHash: MOCK_TX_HASH,
    })));
    patch(ton, 'getAccountFromAddress', async () => ({
        publicKey: 'mock-public-key',
        secretKey: 'mock-secret-key',
    }));
    patch(ton, 'getAssetBalance', async () => ({
        TON: '1000',
        USDC: '500',
    }));
    patch(ton, 'getAssetForSymbol', (symbol: string) => {
        console.log(`Mocked getAssetForSymbol called with symbol: ${symbol}`);
        if (symbol === MOCK_ASSET_SYMBOL) {
            return { assetId: { address: 'mock-asset-address' }, decimals: 9 };
        }
        return null;
    });
    patch(ton, 'storedAssetList', () => [
        {
            assetId: { address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c', blockchain: 607 },
            symbol: 'TON',
            decimals: 9,
        },
        {
            assetId: { address: 'kQAiboDEv_qRrcEdrYdwbVLNOXBHwShFbtKGbQVJ2OKxY_Di', blockchain: 607 },
            symbol: 'AIOTX',
            decimals: 9,
        },
    ]);
    patch(ton, 'optIn', async () => ({ txnID: 'mock-txn-id' }));

    await ton.init();
    await stonfi.init();
});

afterAll(() => {
    unpatch();
});

describe('TonController - poll', () => {
    it('Should return poll response with valid transaction data', async () => {
        const req: PollRequest = {
            txHash: MOCK_TX_HASH,
            network: NETWORK,
        };

        const response = await TonController.poll(ton, req);

        expect(response).toEqual({
            currentBlock: EXPECTED_CURRENT_BLOCK_NUMBER,
            txBlock: 3,
            txHash: MOCK_TX_HASH,
            fee: 0.00005,
        });
    });

    it('Should throw an error if transaction is not found', async () => {
        patch(ton, 'getTransaction', async () => null);

        const req: PollRequest = {
            txHash: MOCK_TX_HASH,
            network: NETWORK,
        };

        await expect(TonController.poll(ton, req)).rejects.toThrow('No transaction');
    });
});

describe('TonController - balances', () => {
    it('Should return balances for a valid address', async () => {
        const req: BalanceRequest = {
            chain: 'ton',
            network: NETWORK,
            address: MOCK_ADDRESS,
            tokenSymbols: ['TON', 'USDC'],
        };

        const response = await TonController.balances(ton, req);
        expect(response).toHaveProperty('balances');
        expect(response.balances).toEqual({ TON: '1000', USDC: '500' });
    });
});

describe('TonController - getTokens', () => {
    it('Should return all tokens when no symbols are specified', async () => {
        const req: AssetsRequest = {
            network: NETWORK,
        };
        const response = await TonController.getTokens(ton, req);
        expect(response).toHaveProperty('assets');
        expect(response.assets).toEqual([
            {
                assetId: {
                    address: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
                    blockchain: 607,
                },
                symbol: 'TON',
                decimals: 9,
            },
            {
                assetId: {
                    address: 'kQAiboDEv_qRrcEdrYdwbVLNOXBHwShFbtKGbQVJ2OKxY_Di',
                    blockchain: 607,
                },
                symbol: 'AIOTX',
                decimals: 9,
            },
        ]);
    });

    it('Should return specific tokens when symbols are specified', async () => {
        const req: AssetsRequest = {
            network: NETWORK,
            assetSymbols: ['TON'],
        };

        const response = await TonController.getTokens(ton, req);
        expect(response).toHaveProperty('assets');
        expect(response.assets).toEqual([
            { assetId: { address: 'mock-asset-address' }, decimals: 9 },
        ]);
    });

    it('Should throw an error for unsupported symbols', async () => {
        patch(ton, 'getAssetForSymbol', () => {
            return null;
        });

        const req: AssetsRequest = {
            network: NETWORK,
            assetSymbols: ['INVALID'],
        };

        await expect(TonController.getTokens(ton, req)).rejects.toThrow(
            'Unsupported symbol: INVALID'
        );
    });
});

describe('TonController - approve', () => {
    it('Should throw an error because the method is not implemented', async () => {
        const mockRequest = {
            network: 'mainnet',
            address: 'mock-address',
            assetSymbol: 'TON',
        };

        await expect(TonController.approve(mockRequest)).rejects.toThrow(
            'Method not implemented.',
        );
    });
});

describe('Ton Utils - Unit Tests', () => {
    it('getNotNullOrThrowError should return value if not null or undefined', () => {
        const result = getNotNullOrThrowError('test', 'Error message');
        expect(result).toBe('test');
    });

    it('getNotNullOrThrowError should throw error if value is null or undefined', () => {
        expect(() => getNotNullOrThrowError(null, 'Custom error')).toThrow(
            'Custom error'
        );
        expect(() => getNotNullOrThrowError(undefined)).toThrow(
            'Value is null or undefined'
        );
    });

    it('getOrDefault should return the value if not null or undefined', () => {
        const result = getOrDefault('value', 'default');
        expect(result).toBe('value');
    });

    it('getOrDefault should return the default value if value is null or undefined', () => {
        expect(getOrDefault(null, 'default')).toBe('default');
        expect(getOrDefault(undefined, 'default')).toBe('default');
    });

    it('sleep should delay execution for specified milliseconds', async () => {
        const start = Date.now();
        await sleep(100);
        const end = Date.now();
        expect(end - start).toBeGreaterThanOrEqual(99);
    });

    it('promiseAllInBatches should process items in batches with delay', async () => {
        const mockTask = jest.fn(async (item) => {
            return item;
        });
        const items = [1, 2, 3, 4, 5];
        const batchSize = 2;
        const delayBetweenBatches = 100;

        const startTime = Date.now();
        const result = await promiseAllInBatches(mockTask, items, batchSize, delayBetweenBatches);

        expect(result).not.toContain(undefined);
        expect(result.length).toBe(items.length);

        expect(mockTask).toHaveBeenCalledTimes(5);
        expect(result).toEqual(items);

        const endTime = Date.now();
        expect(endTime - startTime).toBeGreaterThanOrEqual(delayBetweenBatches);
    });

    it('runWithRetryAndTimeout should retry on failure and succeed if a retry works', async () => {
        let attempt = 0;
        const mockFunction = jest.fn(async () => {
            if (attempt < 2) {
                attempt++;
                throw new Error('Fail');
            }
            return 'success';
        });

        const result = await runWithRetryAndTimeout(null, mockFunction, [], 3, 100, 0);
        expect(result).toBe('success');
        expect(mockFunction).toHaveBeenCalledTimes(3);
    });

    it('runWithRetryAndTimeout should throw error if all retries fail', async () => {
        const mockFunction = jest.fn(async () => {
            throw new Error('Fail');
        });

        await expect(
            runWithRetryAndTimeout(null, mockFunction, [], 2, 50, 0)
        ).rejects.toThrow();
        expect(mockFunction).toHaveBeenCalledTimes(2);
    });
});

describe('Ton - init', () => {
    it('should initialize TonWeb and TonClient correctly', async () => {
        const mockLoadAssets = jest.spyOn(ton as any, 'loadAssets').mockResolvedValue(undefined);
        const mockRpcUrl = 'mock-rpc-url';

        patch(ton.config, 'rpcType', 'orbs');
        patch(ton.config, 'apiKey', 'mock-api-key');
        patch(getHttpEndpoint, 'mockImplementation', async () => mockRpcUrl);

        await ton.init();

        expect(ton.tonweb).toBeDefined();
        expect(ton.tonClient).toBeDefined();
        expect(mockLoadAssets).toHaveBeenCalled();
    });
});

describe('Ton - encrypt and decrypt', () => {
    it('should correctly encrypt and decrypt mnemonic', () => {
        const password = 'test-password';
        const mnemonic = 'test-mnemonic';

        const encrypted = ton.encrypt(mnemonic, password);
        const decrypted = ton.decrypt(encrypted, password);

        expect(decrypted).toBe(mnemonic);
    });

    it('should throw an error when decrypting with the wrong password', () => {
        const password = 'test-password';
        const wrongPassword = 'wrong-password';
        const mnemonic = 'test-mnemonic';

        const encrypted = ton.encrypt(mnemonic, password);

        expect(() => ton.decrypt(encrypted, wrongPassword)).toThrow();
    });
});