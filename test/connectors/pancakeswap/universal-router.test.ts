import { Token, CurrencyAmount, TradeType, Percent } from '@pancakeswap/sdk';
import { PoolType } from '@pancakeswap/smart-router';
import { BigNumber, Contract } from 'ethers';

import { UniversalRouterService } from '../../../src/connectors/pancakeswap/universal-router';

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: jest.fn(),
  };
});

describe('UniversalRouterService', () => {
  let universalRouter: UniversalRouterService;
  let mockProvider: any;

  const WBNB = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WBNB', 'Wrapped Ether');

  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin');

  beforeEach(() => {
    mockProvider = {
      getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
      getGasPrice: jest.fn().mockResolvedValue(BigNumber.from('20000000000')),
      estimateGas: jest.fn().mockResolvedValue(BigNumber.from('300000')),
      call: jest.fn(),
      getCode: jest.fn().mockResolvedValue('0x1234'),
    };

    universalRouter = new UniversalRouterService(mockProvider, 1, 'mainnet');
  });

  describe('constructor', () => {
    it('should initialize with correct parameters', () => {
      expect(universalRouter).toBeDefined();
      expect(universalRouter).toBeInstanceOf(UniversalRouterService);
    });
  });

  describe('getQuote', () => {
    it('should throw error when no routes are found', async () => {
      // Mock provider to simulate no liquidity
      mockProvider.call = jest.fn().mockImplementation(() => {
        throw new Error('Pool does not exist');
      });

      const amount = CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000');
      const options = {
        slippageTolerance: new Percent(1, 100),
        deadline: Math.floor(Date.now() / 1000) + 1800,
        recipient: '0x0000000000000000000000000000000000000001',
        protocols: [PoolType.V2, PoolType.V3],
      };

      await expect(universalRouter.getQuote(WBNB, USDC, amount, TradeType.EXACT_INPUT, options)).rejects.toThrow(
        'No routes found for WBNB -> USDC',
      );
    });

    it('should skip gas estimation during quote phase', async () => {
      // Gas estimation is skipped during quote phase (returns 0)
      // Actual estimation happens during execution phase
      const mockContract = {
        // V2 Pair methods
        getReserves: jest.fn().mockResolvedValue([
          BigNumber.from('1000000000000000000000'), // 1000 WBNB
          BigNumber.from('3000000000000'), // 3M USDC
          BigNumber.from('1234567890'),
        ]),
        token0: jest.fn().mockResolvedValue(WBNB.address),
        token1: jest.fn().mockResolvedValue(USDC.address),
        // V3 Pool methods
        liquidity: jest.fn().mockResolvedValue(BigNumber.from('1000000000000000000')),
        slot0: jest
          .fn()
          .mockResolvedValue([BigNumber.from('1771595571142789777276510917681'), 200000, 0, 1, 1, 0, true]),
        fee: jest.fn().mockResolvedValue(3000),
        tickSpacing: jest.fn().mockResolvedValue(60),
      };

      // Mock Contract constructor
      (Contract as any).mockImplementation(() => mockContract);

      const amount = CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000');
      const options = {
        slippageTolerance: new Percent(1, 100),
        deadline: Math.floor(Date.now() / 1000) + 1800,
        recipient: '0x0000000000000000000000000000000000000001',
        protocols: [PoolType.V2],
      };

      const quote = await universalRouter.getQuote(WBNB, USDC, amount, TradeType.EXACT_INPUT, options);

      expect(quote).toBeDefined();
      expect(quote.estimatedGasUsed.toString()).toBe('0'); // Gas estimation skipped during quote
    });
  });

  describe('quote result structure', () => {
    it('should return properly structured quote result', async () => {
      const amount = CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000');
      const options = {
        slippageTolerance: new Percent(1, 100),
        deadline: Math.floor(Date.now() / 1000) + 1800,
        recipient: '0x0000000000000000000000000000000000000001',
        protocols: [PoolType.V2],
      };

      // Mock a simple V2 pair
      const mockContract = {
        getReserves: jest
          .fn()
          .mockResolvedValue([
            BigNumber.from('1000000000000000000000'),
            BigNumber.from('3000000000000'),
            BigNumber.from('1234567890'),
          ]),
        token0: jest.fn().mockResolvedValue(WBNB.address),
        token1: jest.fn().mockResolvedValue(USDC.address),
      };

      (Contract as any).mockImplementation(() => mockContract);

      const quote = await universalRouter.getQuote(WBNB, USDC, amount, TradeType.EXACT_INPUT, options);

      // Verify quote structure
      expect(quote).toHaveProperty('trade');
      expect(quote).toHaveProperty('route');
      expect(quote).toHaveProperty('routePath');
      expect(quote).toHaveProperty('priceImpact');
      expect(quote).toHaveProperty('estimatedGasUsed');
      expect(quote).toHaveProperty('estimatedGasUsedQuoteToken');
      expect(quote).toHaveProperty('quote');
      expect(quote).toHaveProperty('quoteGasAdjusted');
      expect(quote).toHaveProperty('methodParameters');

      // Verify method parameters
      expect(quote.methodParameters).toHaveProperty('calldata');
      expect(quote.methodParameters).toHaveProperty('value');
      expect(quote.methodParameters).toHaveProperty('to');
      expect(quote.methodParameters.to).toBe('0x13f4EA83D0bd40E75C8222255bc855a974568Dd4');
    });

    it('should format routePath with percentage and token symbols', async () => {
      const amount = CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000');
      const options = {
        slippageTolerance: new Percent(1, 100),
        deadline: Math.floor(Date.now() / 1000) + 1800,
        recipient: '0x0000000000000000000000000000000000000001',
        protocols: [PoolType.V2],
      };

      // Mock a simple V2 pair
      const mockContract = {
        getReserves: jest
          .fn()
          .mockResolvedValue([
            BigNumber.from('1000000000000000000000'),
            BigNumber.from('3000000000000'),
            BigNumber.from('1234567890'),
          ]),
        token0: jest.fn().mockResolvedValue(WBNB.address),
        token1: jest.fn().mockResolvedValue(USDC.address),
      };

      (Contract as any).mockImplementation(() => mockContract);

      const quote = await universalRouter.getQuote(WBNB, USDC, amount, TradeType.EXACT_INPUT, options);

      // Verify routePath format includes percentage and "via"
      // Format should be like "100% via WBNB -> USDC" or for multi-hop "100% via LINK -> WBNB -> DAI"
      expect(quote.routePath).toMatch(/^\d+% via .+$/);
      expect(quote.routePath).toContain('% via');
      expect(quote.routePath).toContain('->');
    });
  });
});
