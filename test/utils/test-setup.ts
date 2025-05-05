// Set test environment variables before imports
process.env.GATEWAY_TEST_MODE = 'dev'; // Force dev mode to avoid HTTPS requirements
process.env.NODE_ENV = 'test';

import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../src/connectors/uniswap/uniswap';
import { patch } from '../services/patch';
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

// Test constants for Base network
export const TEST_BASE_NETWORK = 'base';
export const TEST_WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
export const TEST_BASE_TOKENS = {
  ETH: {
    chainId: 8453,
    name: 'Ether',
    symbol: 'ETH',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH representation
    decimals: 18,
  },
  WETH: {
    chainId: 8453,
    name: 'Wrapped Ether',
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
  },
  USDC: {
    chainId: 8453,
    name: 'USD Coin',
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
  },
  DAI: {
    chainId: 8453,
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
  },
};

// Test AMM and CLMM pools
export const TEST_POOLS = {
  AMM: {
    'ETH-USDC': '0x4c36388be6f416a29c8d8eee81c771ce6be14b18',
  },
  CLMM: {
    'ETH-USDC-0.05': '0x4c36388be6f416a29c8d8eee81c771ce6be14b18',
    'ETH-USDC-0.3': '0x17c14d2c404d167802b16c450d3c99f88f2c4fd4',
  },
};

// Create a test Fastify instance
export function createTestFastifyApp() {
  const app = Fastify({
    logger: false
  });
  
  // Enable TypeBox for request validation
  app.withTypeProvider<TypeBoxTypeProvider>();
  
  return app;
}

// Helper to initialize test instances
export async function setupTestInstances(useMocks = true) {
  // Create ETH and Uniswap instances
  const eth = await Ethereum.getInstance(TEST_BASE_NETWORK);
  const uniswap = await Uniswap.getInstance('ethereum', TEST_BASE_NETWORK);
  
  // Create a test fastify app
  const app = createTestFastifyApp();

  if (useMocks) {
    // Mock token list
    patch(eth, 'tokenList', () => [
      TEST_BASE_TOKENS.ETH,
      TEST_BASE_TOKENS.WETH,
      TEST_BASE_TOKENS.USDC,
      TEST_BASE_TOKENS.DAI,
    ]);

    // Mock getTokenBySymbol
    patch(eth, 'getTokenBySymbol', (symbol: string) => {
      return TEST_BASE_TOKENS[symbol] || null;
    });

    // Mock wallet
    patch(eth, 'getWallet', () => ({
      address: TEST_WALLET_ADDRESS,
    }));

    // Mock gas price
    patch(eth, 'estimateGasPrice', async () => 1000000000); // 1 Gwei
  }

  return { eth, uniswap, app };
}

// Helper to tear down test instances
export async function teardownTestInstances(instances: { eth: Ethereum, app: any }) {
  await instances.eth.close();
  await instances.app.close();
}

// Helper to create mock pool data
export function createMockPoolData(isV3 = true) {
  if (isV3) {
    // CLMM (V3) pool data
    return {
      address: TEST_POOLS.CLMM['ETH-USDC-0.05'],
      baseTokenAddress: TEST_BASE_TOKENS.ETH.address,
      quoteTokenAddress: TEST_BASE_TOKENS.USDC.address,
      binStep: 60, // Tick spacing
      feePct: 0.05,
      price: 3000.0,
      baseTokenAmount: 10.5,
      quoteTokenAmount: 31500.0,
      activeBinId: 205800,
      liquidity: '1500000000000000000',
      sqrtRatioX96: '1825224308714432500000000',
      tickCurrent: 205800,
      tickSpacing: 60,
      fee: 500,
    };
  } else {
    // AMM (V2) pool data
    return {
      address: TEST_POOLS.AMM['ETH-USDC'],
      baseTokenAddress: TEST_BASE_TOKENS.ETH.address,
      quoteTokenAddress: TEST_BASE_TOKENS.USDC.address,
      feePct: 0.3,
      price: 3000.0,
      baseTokenAmount: 50.0,
      quoteTokenAmount: 150000.0,
      reserveBase: '50000000000000000000',
      reserveQuote: '150000000000',
    };
  }
}

// Mock response builder for Fastify tests
export function createInjectOptions(endpoint: string, payload: any = {}) {
  return {
    method: 'POST',
    url: endpoint,
    payload: {
      network: TEST_BASE_NETWORK,
      ...payload,
    },
  };
}
