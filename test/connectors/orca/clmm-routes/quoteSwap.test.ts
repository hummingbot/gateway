import { Solana } from '../../../../src/chains/solana/solana';
import { Orca } from '../../../../src/connectors/orca/orca';
import { PoolService } from '../../../../src/services/pool-service';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/services/pool-service');
jest.mock('../../../../src/connectors/orca/orca.utils', () => ({
  getOrcaSwapQuote: jest.fn(),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { makeQuoteSwapRoute } = await import('../../../../src/trading/pool-swap-routes');
  await server.register(makeQuoteSwapRoute('clmm'));
  return server;
};

const mockPoolAddress = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const mockBaseTokenInfo = {
  symbol: 'SOL',
  address: 'So11111111111111111111111111111111111111112',
  decimals: 9,
};
const mockQuoteTokenInfo = {
  symbol: 'USDC',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
};

const mockSwapQuote = {
  inputToken: mockBaseTokenInfo.address,
  outputToken: mockQuoteTokenInfo.address,
  inputAmount: 1.0,
  outputAmount: 200,
  minOutputAmount: 198,
  maxInputAmount: 1.01,
  priceImpactPct: 0.5,
  price: 200,
  estimatedAmountIn: BigInt(1000000000),
  estimatedAmountOut: BigInt(200000000),
};

describe('GET /quote-swap', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();

    // Mock Solana.getInstance
    const mockSolana = {
      getToken: jest.fn().mockImplementation((symbol: string) => {
        if (symbol === 'SOL' || symbol === mockBaseTokenInfo.address) return mockBaseTokenInfo;
        if (symbol === 'USDC' || symbol === mockQuoteTokenInfo.address) return mockQuoteTokenInfo;
        return null;
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    // Mock Orca.getInstance
    const mockOrca = {
      solanaKitRpc: {},
      // The unified route enters through quoteSwap(), which derives the counter token
      // from the pool's mints instead of taking quoteToken from the caller.
      getWhirlpool: jest.fn().mockResolvedValue({
        tokenMintA: { toString: () => mockBaseTokenInfo.address },
        tokenMintB: { toString: () => mockQuoteTokenInfo.address },
      }),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    // Mock getOrcaSwapQuote
    const { getOrcaSwapQuote } = require('../../../../src/connectors/orca/orca.utils');
    (getOrcaSwapQuote as jest.Mock).mockResolvedValue(mockSwapQuote);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('with poolAddress provided', () => {
    it('should return swap quote for SELL side', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('poolAddress', mockPoolAddress);
      expect(body).toHaveProperty('tokenIn');
      expect(body).toHaveProperty('tokenOut');
      expect(body).toHaveProperty('amountIn');
      expect(body).toHaveProperty('amountOut');
      expect(body).toHaveProperty('price');
      expect(body).toHaveProperty('priceImpactPct');
    });

    it('should return swap quote for BUY side', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 200,
          side: 'BUY',
          poolAddress: mockPoolAddress,
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    });

    it('should use default slippage if not provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('slippagePct');
    });
  });

  describe('without poolAddress (pool lookup)', () => {
    beforeEach(() => {
      // Mock PoolService
      const mockPoolService = {
        getPool: jest.fn().mockResolvedValue({
          address: mockPoolAddress,
          type: 'clmm',
          network: 'mainnet-beta',
          baseSymbol: 'SOL',
          quoteSymbol: 'USDC',
        }),
      };
      (PoolService.getInstance as jest.Mock).mockReturnValue(mockPoolService);
    });

    it('should look up pool by token pair and return quote', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    });

    it('should return 404 when pool not found', async () => {
      const mockSolana = {
        getToken: jest.fn().mockImplementation((symbol: string) => {
          if (symbol === 'SOL') return mockBaseTokenInfo;
          if (symbol === 'UNKNOWN') return { symbol: 'UNKNOWN', address: 'unknown-address', decimals: 6 };
          return null;
        }),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const mockPoolService = {
        getPool: jest.fn().mockResolvedValue(null),
      };
      (PoolService.getInstance as jest.Mock).mockReturnValue(mockPoolService);

      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'UNKNOWN',
          amount: 1.0,
          side: 'SELL',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('validation', () => {
    // The unified schema carries defaults for baseToken/quoteToken/amount/side (the
    // convention the unified trading routes already used), so an omitted field is
    // filled rather than rejected. What still fails is a token that cannot resolve.
    it('rejects a base token that is not one of the pool mints', async () => {
      // Re-seeded rather than inherited: the pool-lookup case above swapped the Solana
      // mock, and this assertion should not depend on which test ran before it.
      (Solana.getInstance as jest.Mock).mockResolvedValue({
        getToken: jest.fn().mockImplementation((symbol: string) => {
          if (symbol === 'SOL') return mockBaseTokenInfo;
          if (symbol === 'USDC') return mockQuoteTokenInfo;
          return null;
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'INVALID',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      // The pool's mints are SOL/USDC, so INVALID belongs to neither side of it.
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('not part of pool');
    });

    it('rejects a side outside the enum', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SIDEWAYS',
          poolAddress: mockPoolAddress,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const { getOrcaSwapQuote } = require('../../../../src/connectors/orca/orca.utils');
      (getOrcaSwapQuote as jest.Mock).mockRejectedValueOnce(new Error('Quote failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/quote-swap',
        query: {
          chainNetwork: 'solana-mainnet-beta',
          connector: 'orca',
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      // Should return error status
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
