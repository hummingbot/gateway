import * as fs from 'fs';
import * as path from 'path';
import { COMMON_TEST_CONSTANTS, createStandardTestParams, createStandardMockResponse } from './schema-test-utils';

// Constants for test generation
const TEST_PARAMS_DIR = path.join(__dirname, '..', 'test-params');
const MOCK_RESPONSES_DIR = path.join(__dirname, '..', 'mock-responses');

// Generate common balance test parameters for all chains
function generateBalanceTestParams() {
  // Ethereum balance test params
  const ethereumBalanceParams = [
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.ETHEREUM.NETWORK,
        address: COMMON_TEST_CONSTANTS.ETHEREUM.TEST_WALLET_ADDRESS
      },
      [
        { field: 'address', value: null },
        { field: 'network', value: 123 }
      ],
      'Basic Ethereum balance request'
    ),
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.ETHEREUM.NETWORK,
        address: COMMON_TEST_CONSTANTS.ETHEREUM.TEST_WALLET_ADDRESS,
        tokenSymbols: ['ETH', 'USDC', 'DAI']
      },
      [
        { field: 'tokenSymbols', value: 'ETH' },
        { field: 'address', value: 123 }
      ],
      'Ethereum balance request with token symbols'
    )
  ];

  // Solana balance test params
  const solanaBalanceParams = [
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.SOLANA.NETWORK,
        address: COMMON_TEST_CONSTANTS.SOLANA.TEST_WALLET_ADDRESS
      },
      [
        { field: 'address', value: null },
        { field: 'network', value: 123 }
      ],
      'Basic Solana balance request'
    ),
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.SOLANA.NETWORK,
        address: COMMON_TEST_CONSTANTS.SOLANA.TEST_WALLET_ADDRESS,
        tokenSymbols: ['SOL', 'USDC', 'USDT']
      },
      [
        { field: 'tokenSymbols', value: 'SOL' },
        { field: 'address', value: 123 }
      ],
      'Solana balance request with token symbols'
    )
  ];

  // Ethereum balance mock responses
  const ethereumBalanceResponses = [
    createStandardMockResponse(
      {
        balances: {
          ETH: 1.5,
          USDC: 3000.0,
          DAI: 1500.0
        }
      },
      [
        { field: 'balances', value: [] },
        { field: 'balances', value: { ETH: "1.5", USDC: 3000.0 } }
      ]
    ),
    createStandardMockResponse(
      {
        balances: {
          ETH: 1.5,
          USDC: 3000.0,
          DAI: 1500.0
        }
      },
      [
        { field: 'balances', value: [{ symbol: 'ETH', amount: 1.5 }] }
      ]
    )
  ];

  // Solana balance mock responses
  const solanaBalanceResponses = [
    createStandardMockResponse(
      {
        balances: {
          SOL: 2.5,
          USDC: 1000.0,
          USDT: 500.0
        }
      },
      [
        { field: 'balances', value: [] },
        { field: 'balances', value: { SOL: "2.5", USDC: 1000.0 } }
      ]
    ),
    createStandardMockResponse(
      {
        balances: {
          SOL: 2.5,
          USDC: 1000.0,
          USDT: 500.0
        }
      },
      [
        { field: 'balances', value: [{ symbol: 'SOL', amount: 2.5 }] }
      ]
    )
  ];

  // Save generated test parameters
  saveTestParams('ethereum', 'balance', ethereumBalanceParams);
  saveTestParams('solana', 'balance', solanaBalanceParams);
  
  // Save generated mock responses
  saveMockResponses('ethereum', 'balance', ethereumBalanceResponses);
  saveMockResponses('solana', 'balance', solanaBalanceResponses);
}

// Generate common swap quote test parameters
function generateSwapQuoteTestParams() {
  // Uniswap swap quote parameters
  const uniswapSwapParams = [
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.ETHEREUM.NETWORK,
        baseToken: 'ETH',
        quoteToken: 'USDC',
        amount: 1.0,
        side: 'SELL',
        slippagePct: 0.5
      },
      [
        { field: 'amount', value: '1.0' },
        { field: 'side', value: 'INVALID_SIDE' },
        { field: 'slippagePct', value: 101 }
      ],
      'Basic Uniswap swap quote request'
    ),
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.ETHEREUM.NETWORK,
        baseToken: 'ETH',
        quoteToken: 'USDC',
        amount: 1.0,
        side: 'BUY',
        poolAddress: COMMON_TEST_CONSTANTS.ETHEREUM.POOLS['ETH-USDC']
      },
      [
        { field: 'side', value: null },
        { field: 'poolAddress', value: 123 }
      ],
      'Uniswap swap quote with pool address'
    )
  ];

  // Jupiter swap quote parameters
  const jupiterSwapParams = [
    createStandardTestParams(
      {
        network: COMMON_TEST_CONSTANTS.SOLANA.NETWORK,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1.0,
        side: 'SELL',
        slippagePct: 0.5
      },
      [
        { field: 'amount', value: '1.0' },
        { field: 'side', value: 'INVALID_SIDE' },
        { field: 'slippagePct', value: 101 }
      ],
      'Basic Jupiter swap quote request'
    ),
    createStandardTestParams(
      {
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1.0,
        side: 'BUY'
      },
      [
        { field: 'baseToken', value: 123 },
        { field: 'side', value: null }
      ],
      'Jupiter swap quote with only required fields'
    )
  ];

  // Uniswap mock responses
  const uniswapSwapResponses = [
    createStandardMockResponse(
      {
        poolAddress: COMMON_TEST_CONSTANTS.ETHEREUM.POOLS['ETH-USDC'],
        estimatedAmountIn: 1.0,
        estimatedAmountOut: 3000.0,
        minAmountOut: 2970.0,
        maxAmountIn: 1.05,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 3000.0,
        price: 3000.0,
        gasPrice: 1000000000,
        gasLimit: 200000,
        gasCost: 0.0002
      },
      [
        { field: 'gasPrice', value: '1000000000' },
        { field: 'estimatedAmountIn', value: '1.0' }
      ]
    ),
    createStandardMockResponse(
      {
        poolAddress: COMMON_TEST_CONSTANTS.ETHEREUM.POOLS['ETH-USDC'],
        estimatedAmountIn: 0.33,
        estimatedAmountOut: 1000.0,
        minAmountOut: 995.0,
        maxAmountIn: 0.335,
        baseTokenBalanceChange: -0.33,
        quoteTokenBalanceChange: 1000.0,
        price: 3030.3,
        gasPrice: 1000000000,
        gasLimit: 200000,
        gasCost: 0.0002
      },
      [
        { field: 'minAmountOut', value: '995.0' },
        { field: 'maxAmountIn', value: null }
      ]
    )
  ];

  // Jupiter mock responses
  const jupiterSwapResponses = [
    createStandardMockResponse(
      {
        poolAddress: COMMON_TEST_CONSTANTS.SOLANA.POOLS['SOL-USDC'],
        estimatedAmountIn: 1.0,
        estimatedAmountOut: 30.0,
        minAmountOut: 29.85,
        maxAmountIn: 1.005,
        baseTokenBalanceChange: -1.0,
        quoteTokenBalanceChange: 30.0,
        price: 30.0,
        gasPrice: 5000,
        gasLimit: 200000,
        gasCost: 0.001
      },
      [
        { field: 'gasPrice', value: '5000' },
        { field: 'baseTokenBalanceChange', value: '-1' }
      ]
    ),
    createStandardMockResponse(
      {
        poolAddress: COMMON_TEST_CONSTANTS.SOLANA.POOLS['SOL-USDT'],
        estimatedAmountIn: 0.33,
        estimatedAmountOut: 10.0,
        minAmountOut: 9.95,
        maxAmountIn: 0.335,
        baseTokenBalanceChange: -0.33,
        quoteTokenBalanceChange: 10.0,
        price: 30.303,
        gasPrice: 5000,
        gasLimit: 200000,
        gasCost: 0.001
      },
      [
        { field: 'maxAmountIn', value: null },
        { field: 'minAmountOut', value: null }
      ]
    )
  ];

  // Save generated test parameters
  saveTestParams('uniswap', 'swap-quote', uniswapSwapParams);
  saveTestParams('jupiter', 'swap-quote', jupiterSwapParams);
  
  // Save generated mock responses
  saveMockResponses('uniswap', 'swap-quote', uniswapSwapResponses);
  saveMockResponses('jupiter', 'swap-quote', jupiterSwapResponses);
}

// Utility functions to save parameters and responses
function saveTestParams(connector: string, schemaType: string, params: any[]) {
  const dirPath = path.join(TEST_PARAMS_DIR, connector);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  const filePath = path.join(dirPath, `${schemaType}.json`);
  fs.writeFileSync(filePath, JSON.stringify(params, null, 2));
}

function saveMockResponses(connector: string, schemaType: string, responses: any[]) {
  const dirPath = path.join(MOCK_RESPONSES_DIR, connector);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  const filePath = path.join(dirPath, `${schemaType}.json`);
  fs.writeFileSync(filePath, JSON.stringify(responses, null, 2));
}

// Export the generator functions
export const generateTestData = {
  balance: generateBalanceTestParams,
  swapQuote: generateSwapQuoteTestParams,
  // Add more generators as needed
  all: () => {
    generateBalanceTestParams();
    generateSwapQuoteTestParams();
    // Add more generators as needed
  }
};