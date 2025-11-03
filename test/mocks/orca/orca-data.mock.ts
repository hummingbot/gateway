/**
 * Mock data for Orca connector tests
 */

import { PublicKey } from '@solana/web3.js';

// Mock wallet addresses
export const MOCK_WALLET_ADDRESS = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
export const MOCK_POOL_ADDRESS = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
export const MOCK_POSITION_ADDRESS = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';

// Mock token info
export const MOCK_SOL_TOKEN = {
  symbol: 'SOL',
  address: 'So11111111111111111111111111111111111111112',
  decimals: 9,
  name: 'Wrapped SOL',
};

export const MOCK_USDC_TOKEN = {
  symbol: 'USDC',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
  name: 'USD Coin',
};

// Mock pool info from Orca API
export const MOCK_ORCA_POOL_INFO = {
  address: MOCK_POOL_ADDRESS,
  baseTokenAddress: MOCK_SOL_TOKEN.address,
  quoteTokenAddress: MOCK_USDC_TOKEN.address,
  binStep: 64,
  feePct: 0.04,
  price: 200.5,
  baseTokenAmount: 1000,
  quoteTokenAmount: 200500,
  activeBinId: -28800,
  liquidity: '1000000000',
  sqrtPrice: '7469508197693302272',
  tvlUsdc: 50000,
  protocolFeeRate: 0.01,
  yieldOverTvl: 0.05,
};

// Mock Orca API response for pools search
export const MOCK_ORCA_API_POOL_RESPONSE = {
  data: [
    {
      address: MOCK_POOL_ADDRESS,
      tokenMintA: MOCK_SOL_TOKEN.address,
      tokenMintB: MOCK_USDC_TOKEN.address,
      feeRate: 400, // 0.04% in hundredths of basis points
      protocolFeeRate: 100,
      price: 200.5,
      tokenBalanceA: '1000000000000', // 1000 SOL
      tokenBalanceB: '200500000000', // 200500 USDC
      tokenA: { decimals: 9 },
      tokenB: { decimals: 6 },
      tickSpacing: 64,
      tickCurrentIndex: -28800,
      liquidity: '1000000000',
      sqrtPrice: '7469508197693302272',
      tvlUsdc: 50000,
      yieldOverTvl: 0.05,
    },
  ],
};

// Mock whirlpool data
export const MOCK_WHIRLPOOL_DATA = {
  tokenMintA: new PublicKey(MOCK_SOL_TOKEN.address),
  tokenMintB: new PublicKey(MOCK_USDC_TOKEN.address),
  tokenVaultA: new PublicKey('11111111111111111111111111111111'),
  tokenVaultB: new PublicKey('11111111111111111111111111111112'),
  tickSpacing: 64,
  sqrtPrice: BigInt('7469508197693302272'),
  tickCurrentIndex: -28800,
  liquidity: BigInt('1000000000'),
  feeRate: 400,
  protocolFeeRate: 100,
};

// Mock mint info
export const MOCK_MINT_INFO = {
  decimals: 9,
  tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  supply: BigInt('1000000000000000'),
  isInitialized: true,
};

// Mock position info
export const MOCK_POSITION_INFO = {
  address: MOCK_POSITION_ADDRESS,
  poolAddress: MOCK_POOL_ADDRESS,
  baseTokenAddress: MOCK_SOL_TOKEN.address,
  quoteTokenAddress: MOCK_USDC_TOKEN.address,
  baseTokenAmount: 0.5,
  quoteTokenAmount: 100,
  baseFeeAmount: 0.001,
  quoteFeeAmount: 0.2,
  lowerBinId: -29440,
  upperBinId: -27200,
  lowerPrice: 150,
  upperPrice: 250,
  price: 200,
};

// Mock positions array
export const MOCK_POSITIONS = [
  {
    address: 'position1address',
    poolAddress: MOCK_POOL_ADDRESS,
    baseTokenAddress: MOCK_SOL_TOKEN.address,
    quoteTokenAddress: MOCK_USDC_TOKEN.address,
    baseTokenAmount: 0.5,
    quoteTokenAmount: 100,
    baseFeeAmount: 0.001,
    quoteFeeAmount: 0.2,
    lowerBinId: -29440,
    upperBinId: -27200,
    lowerPrice: 150,
    upperPrice: 250,
    price: 200,
  },
  {
    address: 'position2address',
    poolAddress: 'anotherPoolAddress',
    baseTokenAddress: MOCK_SOL_TOKEN.address,
    quoteTokenAddress: MOCK_USDC_TOKEN.address,
    baseTokenAmount: 1.0,
    quoteTokenAmount: 200,
    baseFeeAmount: 0.002,
    quoteFeeAmount: 0.4,
    lowerBinId: -28800,
    upperBinId: -26400,
    lowerPrice: 180,
    upperPrice: 220,
    price: 200,
  },
];

// Mock swap quote
export const MOCK_SWAP_QUOTE = {
  inputToken: MOCK_SOL_TOKEN.address,
  outputToken: MOCK_USDC_TOKEN.address,
  inputAmount: 1.0,
  outputAmount: 200,
  minOutputAmount: 198,
  maxInputAmount: 1.01,
  priceImpactPct: 0.5,
  price: 200,
  estimatedAmountIn: BigInt(1000000000),
  estimatedAmountOut: BigInt(200000000),
};

// Mock position quote
export const MOCK_POSITION_QUOTE = {
  baseLimited: true,
  baseTokenAmount: 1.0,
  quoteTokenAmount: 200,
  baseTokenAmountMax: 1.01,
  quoteTokenAmountMax: 202,
  liquidity: 1000000,
};

// Mock transaction response
export const MOCK_TRANSACTION_RESPONSE = {
  signature: 'test-signature-123',
  fee: 0.000005,
};

// Mock Orca SDK instances
export const createMockWhirlpoolContext = (wallet: any) => ({
  wallet,
  connection: {
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getEpochInfo: jest.fn().mockResolvedValue({ epoch: 100 }),
  },
  fetcher: {
    getPool: jest.fn().mockResolvedValue(MOCK_WHIRLPOOL_DATA),
    getMintInfo: jest.fn().mockResolvedValue(MOCK_MINT_INFO),
    getTickArray: jest.fn().mockResolvedValue(null),
    getPosition: jest.fn(),
    getTokenInfo: jest.fn(),
  },
  program: {},
});

export const createMockWhirlpoolClient = () => ({
  getPool: jest.fn().mockResolvedValue({
    getData: jest.fn().mockReturnValue(MOCK_WHIRLPOOL_DATA),
  }),
  refreshData: jest.fn(),
});

// Mock Orca connector
export const createMockOrca = () => ({
  solanaKitRpc: {},
  config: {
    slippagePct: 1,
  },
  getWhirlpoolContextForWallet: jest.fn(),
  getWhirlpoolClientForWallet: jest.fn(),
  getPools: jest.fn().mockResolvedValue([MOCK_ORCA_POOL_INFO]),
  getPoolInfo: jest.fn().mockResolvedValue(MOCK_ORCA_POOL_INFO),
  getWhirlpool: jest.fn().mockResolvedValue(MOCK_WHIRLPOOL_DATA),
  getPositionsForWalletAddress: jest.fn().mockResolvedValue(MOCK_POSITIONS),
  getPositionInfo: jest.fn().mockResolvedValue(MOCK_POSITION_INFO),
  getRawPosition: jest.fn(),
});
