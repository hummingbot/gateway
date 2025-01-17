import { Stonfi } from '../../../src/connectors/ston_fi/ston_fi';
import { PriceRequest } from '../../../src/amm/amm.requests';
import { HttpException, TOKEN_NOT_SUPPORTED_ERROR_CODE, TOKEN_NOT_SUPPORTED_ERROR_MESSAGE } from '../../../src/services/error-handler';
import { createHash } from 'crypto';

jest.mock('@ston-fi/api', () => ({
    StonApiClient: jest.fn().mockImplementation(() => ({
        simulateSwap: jest.fn(() =>
            Promise.resolve({
                askAddress: 'mock-ask-address',
                askUnits: '500',
                offerAddress: 'mock-offer-address',
                offerUnits: '1000',
                swapRate: '0.5',
                slippageTolerance: '0.01',
            }),
        ),
        getWalletOperations: jest.fn(() =>
            Promise.resolve([
                {
                    operation: {
                        routerAddress: 'mock-router-address',
                    },
                },
            ]),
        ),
        getSwapStatus: jest.fn(() =>
            Promise.resolve({
                '@type': 'Found',
                txHash: 'mock-tx-hash',
            }),
        ),
    })),
}));

describe('Stonfi Class', () => {
    let stonfiInstance: Stonfi;

    beforeEach(() => {
        jest.clearAllMocks();

        stonfiInstance = Stonfi.getInstance('testnet');

        const mockContract = {
            getSeqno: jest.fn(() => Promise.resolve(1)),
            sendTransfer: jest.fn(() => Promise.resolve()),
        };

        const mockTonClient = {
            open: jest.fn(() => mockContract),
        };

        stonfiInstance['chain'] = {
            ready: jest.fn(() => true),
            init: jest.fn(() => Promise.resolve()),
            getAssetForSymbol: jest.fn((symbol: string) => {
                if (symbol === 'TON') return { assetId: { address: 'ton-address' }, decimals: 9 };
                if (symbol === 'AIOTX') return { assetId: { address: 'aiotx-address' }, decimals: 9 };
                return null;
            }),
            getAccountFromAddress: jest.fn(() =>
                Promise.resolve({
                    secretKey: 'mock-secret-key',
                    publicKey: 'mock-public-key',
                })
            ),
            tonClient: mockTonClient,
            wallet: {
                address: {
                    toString: jest.fn(() => 'mock-wallet-address'),
                },
            },
        } as any;
    });

    describe('Static Methods', () => {
        it('getInstance should return a singleton instance', () => {
            const instance1 = Stonfi.getInstance('testnet');
            const instance2 = Stonfi.getInstance('testnet');
            expect(instance1).toBe(instance2);
        });

        it('generateUniqueHash should return a unique hash', () => {
            const input = 'test-input';
            const hash = Stonfi.generateUniqueHash(input);
            const expectedHash = createHash('sha256').update(input).digest('hex');
            expect(hash).toBe(expectedHash);
        });

        it('generateQueryId should return a valid query ID', () => {
            const hash = '12345abcde';
            const queryId = Stonfi.generateQueryId(10, hash);
            expect(queryId).toBeGreaterThanOrEqual(1000000000);
            expect(queryId).toBeLessThanOrEqual(9999999999);
        });
    });

    describe('Instance Methods', () => {
        it('init should initialize the chain and set ready state', async () => {
            stonfiInstance['chain'].ready = jest.fn(() => false);
            await stonfiInstance.init();
            expect(stonfiInstance['chain'].init).toHaveBeenCalled();
            expect(stonfiInstance.ready()).toBe(true);
        });

        it('getSlippage should return the correct slippage percentage', () => {
            stonfiInstance['_config'] = { allowedSlippage: '1/100' } as any;
            expect(stonfiInstance.getSlippage()).toBeCloseTo(0.01);
        });

        it('estimateTrade should throw an error for unsupported tokens', async () => {
            const priceRequest: PriceRequest = { base: 'INVALID', quote: 'AIOTX', amount: '100', side: 'BUY', chain: 'ton', network: 'testnet' };
            await expect(stonfiInstance.estimateTrade(priceRequest)).rejects.toThrow(new HttpException(500, TOKEN_NOT_SUPPORTED_ERROR_MESSAGE, TOKEN_NOT_SUPPORTED_ERROR_CODE));
        });

        it('estimateTrade should calculate correct price and amount for a valid trade', async () => {
            const priceRequest: PriceRequest = { base: 'TON', quote: 'AIOTX', amount: '100', side: 'BUY', chain: 'ton', network: 'testnet' };
            const result = await stonfiInstance.estimateTrade(priceRequest);
            expect(result.expectedPrice).toBe(2);
            expect(result.expectedAmount).toBe(100);
        });

        it('waitForConfirmation should return a confirmation result', async () => {
            const result = await stonfiInstance.waitForConfirmation('mock-wallet-address', 'mock-query-id');
            expect(result.txHash).toBe('mock-tx-hash');
        });

        it('waitForTransactionHash should return transaction hash', async () => {
            const result = await stonfiInstance.waitForTransactionHash('mock-wallet-address', 'mock-query-id');
            if (result["@type"] === "Found")
                expect(result.txHash).toBe('mock-tx-hash');
        });
    });
});
