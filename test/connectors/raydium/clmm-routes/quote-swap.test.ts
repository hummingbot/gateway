import { PoolUtils } from '@raydium-io/raydium-sdk-v2';

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/chains/solana/routes/estimate-gas', () => ({
  estimateGasSolana: jest.fn().mockResolvedValue({}),
}));

// Keep the real Raydium SDK (raydium.utils imports program-ID constants from it
// at load time) but override only the static PoolUtils helpers the route calls.
jest.mock('@raydium-io/raydium-sdk-v2', () => {
  const actual = jest.requireActual('@raydium-io/raydium-sdk-v2');
  return {
    ...actual,
    PoolUtils: {
      ...actual.PoolUtils,
      fetchComputeClmmInfo: jest.fn(),
      fetchMultiplePoolTickArrays: jest.fn(),
      computeAmountIn: jest.fn(),
      computeAmountOutFormat: jest.fn(),
    },
  };
});

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import('../../../../src/connectors/raydium/clmm-routes/quoteSwap');
  await server.register(quoteSwapRoute);
  return server;
};

const mockSOL = {
  symbol: 'SOL',
  address: 'So11111111111111111111111111111111111111112',
  decimals: 9,
};

const mockUSDC = {
  symbol: 'USDC',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
};

const mockPoolAddress = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';

// SOL is mintA (base), USDC is mintB (quote).
const mockApiPoolInfo = {
  id: mockPoolAddress,
  mintA: { address: mockSOL.address, decimals: 9 },
  mintB: { address: mockUSDC.address, decimals: 6 },
};

// Minimal BN/token stand-ins matching the shape the route reads.
const bn = (n: number) => ({ toNumber: () => n });
const token = (t: typeof mockSOL) => ({ symbol: t.symbol, mint: t.address, decimals: t.decimals });
const percent = (significant: string) => ({ toSignificant: () => significant });

const setupMocks = () => {
  const mockSolanaInstance = {
    connection: {},
    getToken: jest.fn((t: string) => {
      if (t === 'SOL' || t === mockSOL.address) return Promise.resolve(mockSOL);
      if (t === 'USDC' || t === mockUSDC.address) return Promise.resolve(mockUSDC);
      return Promise.resolve(null);
    }),
  };
  (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

  const mockRaydiumInstance = {
    getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
    raydiumSDK: {
      fetchEpochInfo: jest.fn().mockResolvedValue({}),
    },
  };
  (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

  (PoolUtils.fetchComputeClmmInfo as jest.Mock).mockResolvedValue({ observationId: 'obs' });
  (PoolUtils.fetchMultiplePoolTickArrays as jest.Mock).mockResolvedValue({ [mockPoolAddress]: {} });
};

describe('GET /quote-swap (Raydium CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('returns a SELL quote with correct price, minAmountOut and price impact', async () => {
    // Sell 0.2 SOL -> 13 USDC. input=SOL(9), output=USDC(6).
    (PoolUtils.computeAmountOutFormat as jest.Mock).mockResolvedValue({
      realAmountIn: { amount: { raw: bn(200_000_000), token: token(mockSOL) } },
      amountOut: { amount: { raw: bn(13_000_000), token: token(mockUSDC) } },
      minAmountOut: { amount: { raw: bn(12_870_000), token: token(mockUSDC) } },
      priceImpact: percent('0.09'),
      remainingAccounts: [],
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.2',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('tokenIn', mockSOL.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
    expect(body).toHaveProperty('amountIn', 0.2);
    expect(body).toHaveProperty('amountOut', 13);
    expect(body).toHaveProperty('price', 65);
    expect(body).toHaveProperty('maxAmountIn', 0.2);
    // minAmountOut = amountOut * (1 - slippage) = 13 * 0.99
    expect(body.minAmountOut).toBeCloseTo(12.87, 6);
    // priceImpact Percent.toSignificant() is already a percentage (no x100).
    expect(body).toHaveProperty('priceImpactPct', 0.09);
    expect(body).toHaveProperty('slippagePct', 1);

    // Slippage must reach the SDK as a fraction (1% -> 0.01), not truncated to 0.
    expect(PoolUtils.computeAmountOutFormat).toHaveBeenCalledWith(expect.objectContaining({ slippage: 0.01 }));
  });

  it('returns a BUY quote where maxAmountIn exceeds amountIn by the slippage', async () => {
    // Buy 0.2 SOL for ~13 USDC. input=USDC(6), output=SOL(9).
    (PoolUtils.computeAmountIn as jest.Mock).mockResolvedValue({
      realAmountOut: { amount: bn(200_000_000) }, // 0.2 SOL
      amountIn: { amount: bn(13_000_000) }, // 13 USDC
      maxAmountIn: { amount: bn(13_130_000) }, // 13 * 1.01 USDC (slippage included)
      priceImpact: percent('0.09'),
      remainingAccounts: [],
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.2',
        side: 'BUY',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockSOL.address);
    expect(body).toHaveProperty('amountIn', 13);
    expect(body).toHaveProperty('amountOut', 0.2);
    expect(body).toHaveProperty('price', 65);
    // The core regression: maxAmountIn must be GREATER than amountIn (was inverted before).
    expect(body.maxAmountIn).toBeGreaterThan(body.amountIn);
    expect(body.maxAmountIn).toBeCloseTo(13.13, 6);
    expect(body).toHaveProperty('priceImpactPct', 0.09);
    expect(body).toHaveProperty('slippagePct', 1);

    // baseMint must be the OUTPUT token (SOL), so amountIn comes back in the input token's units.
    const callArgs = (PoolUtils.computeAmountIn as jest.Mock).mock.calls[0][0];
    expect(callArgs.baseMint.toBase58()).toBe(mockSOL.address);
    // Slippage reaches the SDK as a fraction (1% -> 0.01).
    expect(callArgs.slippage).toBe(0.01);
  });

  it('returns 404 when the pool is not found', async () => {
    const mockRaydiumInstance = {
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([null, null]),
      raydiumSDK: { fetchEpochInfo: jest.fn().mockResolvedValue({}) },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet-beta',
        poolAddress: 'invalid-pool-address',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.2',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});
