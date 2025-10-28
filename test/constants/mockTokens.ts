/**
 * Mock token addresses and metadata for tests
 * These constants should be used instead of hardcoding addresses in test files
 */

export const MOCK_TOKENS = {
  ETHEREUM: {
    WETH: {
      symbol: 'WETH',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
    },
    USDC: {
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    DAI: {
      symbol: 'DAI',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
    },
  },
  SOLANA: {
    SOL: {
      symbol: 'SOL',
      address: 'So11111111111111111111111111111111111111112',
      decimals: 9,
    },
    USDC: {
      symbol: 'USDC',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
    },
    USDT: {
      symbol: 'USDT',
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
    },
  },
};

export const MOCK_POOL_ADDRESSES = {
  RAYDIUM_AMM: '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj',
  RAYDIUM_CLMM: 'D8jBr4W4x1qy3eVhL6JtS2NVwDd2qbL9qJ4K9p3a6xYK',
  METEORA_CLMM: 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq',
  PANCAKESWAP_SOL_CLMM: '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv',
  UNISWAP_V2_POOL: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
  UNISWAP_V3_POOL: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8',
  PANCAKESWAP_POOL: '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0',
};

export const MOCK_WALLET_ADDRESSES = {
  ETHEREUM: '0x1234567890123456789012345678901234567890',
  SOLANA: 'SolWalletAddress123456789012345678901234567',
};

export const MOCK_TRANSACTION_SIGNATURES = {
  ETHEREUM: '0xabc123def456789',
  SOLANA: '5ZxW8vK2yGJhyqjE9XwK3pN2rL4sT1mV7uQ6fR8dC9bA',
};
