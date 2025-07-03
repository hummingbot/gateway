import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import(
    '../../../../src/connectors/raydium/amm-routes/quoteSwap'
  );
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

const mockPoolAddress = '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj';

const mockPoolInfo = {
  id: mockPoolAddress,
  baseMint: new PublicKey(mockSOL.address),
  quoteMint: new PublicKey(mockUSDC.address),
  baseDecimals: 9,
  quoteDecimals: 6,
  lpDecimals: 9,
  baseReserve: '1000000000000', // 1000 SOL
  quoteReserve: '150000000000', // 150000 USDC
  lpSupply: '100000000000',
  status: 1,
  programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  authority: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  openOrders: '11111111111111111111111111111111',
  targetOrders: '11111111111111111111111111111111',
  withdrawQueue: '11111111111111111111111111111111',
  lpVault: '11111111111111111111111111111111',
  marketVersion: 3,
  marketProgramId: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
  marketId: '11111111111111111111111111111111',
  marketAuthority: '11111111111111111111111111111111',
  marketBaseVault: '11111111111111111111111111111111',
  marketQuoteVault: '11111111111111111111111111111111',
  marketBids: '11111111111111111111111111111111',
  marketAsks: '11111111111111111111111111111111',
  marketEventQueue: '11111111111111111111111111111111',
  lookupTableAddress: '11111111111111111111111111111111',
  mintA: {
    address: mockSOL.address,
    decimals: 9,
  },
  mintB: {
    address: mockUSDC.address,
    decimals: 6,
  },
};

const mockSwapResponse = {
  allTrade: true,
  swapInDirection: 'base2quote',
  amountIn: 100000000,
  amountOut: 14850000,
  minAmountOut: 14700000,
  fee: 250000, // 0.25 SOL fee
  priceImpact: 0.01,
  remainingAccounts: [],
  routeType: 'amm',
  poolKey: [],
  poolType: 'STANDARD',
  poolInfo: mockPoolInfo,
  rawAmountIn: 100000000,
  rawAmountOut: 14850000,
};

describe('GET /quote-swap', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a quote for AMM swap SELL side', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address)
          return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address)
          return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    (Solana.getWalletAddressExample as jest.Mock).mockResolvedValue(
      '11111111111111111111111111111111',
    );

    const mockRaydiumInstance = {
      getAmmPoolInfo: jest.fn().mockResolvedValue({
        address: mockPoolAddress,
        baseTokenAddress: mockSOL.address,
        quoteTokenAddress: mockUSDC.address,
        feePct: 0.0025, // 0.25%
        price: 150,
        baseTokenAmount: 1000,
        quoteTokenAmount: 150000,
        poolType: 'amm',
        lpMint: {
          address: '11111111111111111111111111111111',
          decimals: 9,
        },
      }),
      getSlippagePct: jest.fn().mockReturnValue(1),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, {}]),
      raydiumSDK: {
        liquidity: {
          computeAmountOut: jest.fn().mockReturnValue(mockSwapResponse),
          getRpcPoolInfo: jest.fn().mockResolvedValue({
            baseReserve: '1000000000000',
            quoteReserve: '150000000000',
            status: { toNumber: () => 1 },
          }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('estimatedAmountIn', 0.1);
    expect(body).toHaveProperty('estimatedAmountOut', 14.85);
    expect(body).toHaveProperty('minAmountOut', 14.7);
    expect(body).toHaveProperty('price', 148.5);
    expect(body).toHaveProperty('priceImpactPct', 1);
    expect(body).toHaveProperty('fee', 0.00025);
    expect(body).toHaveProperty('tokenIn', mockSOL.address);
    expect(body).toHaveProperty('tokenOut', mockUSDC.address);
  });

  it('should return a quote for AMM swap BUY side', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address)
          return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address)
          return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockBuyResponse = {
      ...mockSwapResponse,
      swapInDirection: 'quote2base',
      amountIn: 15000000,
      amountOut: 100000000,
      maxAmountIn: 15150000,
    };

    const mockRaydiumInstance = {
      getAmmPoolInfo: jest.fn().mockResolvedValue({
        address: mockPoolAddress,
        baseTokenAddress: mockSOL.address,
        quoteTokenAddress: mockUSDC.address,
        feePct: 0.0025, // 0.25%
        price: 150,
        baseTokenAmount: 1000,
        quoteTokenAmount: 150000,
        poolType: 'amm',
        lpMint: {
          address: '11111111111111111111111111111111',
          decimals: 9,
        },
      }),
      getSlippagePct: jest.fn().mockReturnValue(1),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, {}]),
      raydiumSDK: {
        liquidity: {
          computeAmountIn: jest.fn().mockReturnValue(mockBuyResponse),
          getRpcPoolInfo: jest.fn().mockResolvedValue({
            baseReserve: '1000000000000',
            quoteReserve: '150000000000',
            status: { toNumber: () => 1 },
          }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'mainnet-beta',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: '0.1',
        side: 'BUY',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('estimatedAmountIn', 15);
    expect(body).toHaveProperty('estimatedAmountOut', 0.1);
    expect(body).toHaveProperty('maxAmountIn', 15.15);
    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockSOL.address);
  });

  it('should return 404 if pool not found', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address)
          return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address)
          return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      getAmmPoolInfo: jest.fn().mockResolvedValue(null),
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
        amount: '0.1',
        side: 'SELL',
        slippagePct: '1',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});
