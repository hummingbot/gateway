import { price, trade, estimateGas } from '../../../src/connectors/ston_fi/ston_fi.controllers';
import { HttpException } from '../../../src/services/error-handler';
import { PriceRequest, TradeRequest } from '../../../src/amm/amm.requests';

jest.mock('../../../src/chains/ton/ton');
jest.mock('../../../src/connectors/ston_fi/ston_fi');
const mockTon = {
    network: 'test-network',
    gasPrice: 100,
    nativeTokenSymbol: 'TON',
    gasLimit: 21000,
    gasCost: 0.01,
    getAccountFromAddress: jest.fn(),
};

const mockStonfi = {
    estimateTrade: jest.fn(),
    executeTrade: jest.fn(),
};

describe('StonFi Controllers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('price', () => {
        it('should return a valid PriceResponse', async () => {
            const req: PriceRequest = {
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                chain: 'ton',
                network: 'testnet',
                side: 'BUY'
            };

            const mockTrade = {
                expectedAmount: '150',
                expectedPrice: '1.5',
            };

            mockStonfi.estimateTrade.mockResolvedValue(mockTrade);

            const result = await price(mockTon as any, mockStonfi as any, req);

            expect(result).toEqual({
                network: 'test-network',
                timestamp: expect.any(Number),
                latency: expect.any(Number),
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                rawAmount: '100',
                expectedAmount: '150',
                price: '1.5',
                gasPrice: 100,
                gasPriceToken: 'TON',
                gasLimit: 21000,
                gasCost: '0.01',
            });

            expect(mockStonfi.estimateTrade).toHaveBeenCalledWith(req);
        });

        it('should throw HttpException when estimateTrade fails', async () => {
            const req: PriceRequest = {
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                chain: 'ton',
                network: 'testnet',
                side: 'BUY'
            };

            mockStonfi.estimateTrade.mockRejectedValue(new Error('Mock Error'));

            await expect(price(mockTon as any, mockStonfi as any, req)).rejects.toThrow(HttpException);
            expect(mockStonfi.estimateTrade).toHaveBeenCalledWith(req);
        });
    });

    describe('trade', () => {
        it('should execute a trade successfully and return TradeResponse', async () => {
            const req: TradeRequest = {
                address: 'mock-address',
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                side: 'BUY',
                limitPrice: '1.5',
                chain: 'ton',
                network: 'testnet',
            };

            const mockAccount = { publicKey: 'mock-public-key' };
            const mockTrade = {
                expectedAmount: '150',
                expectedPrice: '1.5',
                trade: 'mock-trade-data',
            };

            mockTon.getAccountFromAddress.mockResolvedValue(mockAccount);
            mockStonfi.estimateTrade.mockResolvedValue(mockTrade);
            mockStonfi.executeTrade.mockResolvedValue('mock-tx-hash');

            const result = await trade(mockTon as any, mockStonfi as any, req);

            expect(result).toEqual({
                network: 'test-network',
                timestamp: expect.any(Number),
                latency: expect.any(Number),
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                rawAmount: '100',
                expectedIn: '150',
                price: '1.5',
                gasPrice: 100,
                gasPriceToken: 'TON',
                gasLimit: 21000,
                gasCost: '0.01',
                txHash: 'mock-tx-hash',
            });

            expect(mockTon.getAccountFromAddress).toHaveBeenCalledWith(req.address);
            expect(mockStonfi.estimateTrade).toHaveBeenCalledWith(req);
            expect(mockStonfi.executeTrade).toHaveBeenCalledWith(
                'mock-public-key',
                'mock-trade-data',
                'TON',
                'AIOTX',
                true,
            );
        });

        it('should throw HttpException when limit price is exceeded for BUY', async () => {
            const req: TradeRequest = {
                address: 'mock-address',
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                side: 'BUY',
                limitPrice: '1.2',
                chain: 'ton',
                network: 'testnet',
            };

            const mockAccount = { publicKey: 'mock-public-key' };
            const mockTrade = {
                expectedAmount: '150',
                expectedPrice: '1.5',
            };

            mockTon.getAccountFromAddress.mockResolvedValue(mockAccount);
            mockStonfi.estimateTrade.mockResolvedValue(mockTrade);

            await expect(trade(mockTon as any, mockStonfi as any, req)).rejects.toThrow(HttpException);
            expect(mockStonfi.estimateTrade).toHaveBeenCalledWith(req);
        });

        it('should throw HttpException when limit price is lower for SELL', async () => {
            const req: TradeRequest = {
                address: 'mock-address',
                base: 'TON',
                quote: 'AIOTX',
                amount: '100',
                side: 'SELL',
                limitPrice: '2.0',
                chain: 'ton',
                network: 'testnet',
            };

            const mockAccount = { publicKey: 'mock-public-key' };
            const mockTrade = {
                expectedAmount: '150',
                expectedPrice: '1.5',
            };

            mockTon.getAccountFromAddress.mockResolvedValue(mockAccount);
            mockStonfi.estimateTrade.mockResolvedValue(mockTrade);

            await expect(trade(mockTon as any, mockStonfi as any, req)).rejects.toThrow(HttpException);
            expect(mockStonfi.estimateTrade).toHaveBeenCalledWith(req);
        });
    });

    describe('estimateGas', () => {
        it('should return a valid EstimateGasResponse', async () => {
            const result = await estimateGas(mockTon as any, mockStonfi as any);

            expect(result).toEqual({
                network: 'test-network',
                timestamp: expect.any(Number),
                gasPrice: 100,
                gasPriceToken: 'TON',
                gasLimit: 21000,
                gasCost: '0.01',
            });
        });
    });
});
