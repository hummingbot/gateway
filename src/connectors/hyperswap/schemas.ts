import { Type } from '@sinclair/typebox';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';

import { HyperswapConfig } from './hyperswap.config';

// Get chain config for defaults
const ethereumChainConfig = getEthereumChainConfig();

// Constants for examples
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 10;
const AMM_POOL_ADDRESS_EXAMPLE = '0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C'; // Hyperswap V2 WETH-USDC pool on HyperEVM

// ========================================
// AMM Request Schemas
// ========================================

export const HyperswapAmmGetPoolInfoRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...HyperswapConfig.networks],
    }),
  ),
  poolAddress: Type.String({
    description: 'Hyperswap V2 pool address',
    examples: [AMM_POOL_ADDRESS_EXAMPLE],
  }),
});

// ========================================
// Router Request Schemas
// ========================================

// Hyperswap-specific quote-swap request
export const HyperswapQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...HyperswapConfig.networks],
    }),
  ),
  baseToken: Type.String({
    description: 'First token in the trading pair',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'Second token in the trading pair',
    examples: [QUOTE_TOKEN],
  }),
  amount: Type.Number({
    description: 'Amount of base token to trade',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    description:
      'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
    enum: ['BUY', 'SELL'],
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: HyperswapConfig.config.slippagePct,
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address for more accurate quotes (optional)',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
});

// Hyperswap-specific quote-swap response
export const HyperswapQuoteSwapResponse = Type.Object({
  quoteId: Type.String({
    description: 'Unique identifier for this quote',
  }),
  tokenIn: Type.String({
    description: 'Address of the token being swapped from',
  }),
  tokenOut: Type.String({
    description: 'Address of the token being swapped to',
  }),
  amountIn: Type.Number({
    description: 'Amount of tokenIn to be swapped',
  }),
  amountOut: Type.Number({
    description: 'Expected amount of tokenOut to receive',
  }),
  price: Type.Number({
    description: 'Exchange rate between tokenIn and tokenOut',
  }),
  priceImpactPct: Type.Number({
    description: 'Estimated price impact percentage (0-100)',
  }),
  minAmountOut: Type.Number({
    description: 'Minimum amount of tokenOut that will be accepted',
  }),
  maxAmountIn: Type.Number({
    description: 'Maximum amount of tokenIn that will be spent',
  }),
  routePath: Type.Optional(
    Type.String({
      description: 'Human-readable route path',
    }),
  ),
});

// Hyperswap AMM Add Liquidity Request
export const HyperswapAmmAddLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...HyperswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will add liquidity',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Address of the Hyperswap V2 pool',
  }),
  baseTokenAmount: Type.Number({
    description: 'Amount of base token to add',
  }),
  quoteTokenAmount: Type.Number({
    description: 'Amount of quote token to add',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: HyperswapConfig.config.slippagePct,
    }),
  ),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Hyperswap AMM Remove Liquidity Request
export const HyperswapAmmRemoveLiquidityRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...HyperswapConfig.networks],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will remove liquidity',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  poolAddress: Type.String({
    description: 'Address of the Hyperswap V2 pool',
  }),
  percentageToRemove: Type.Number({
    minimum: 0,
    maximum: 100,
    description: 'Percentage of liquidity to remove',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: HyperswapConfig.config.slippagePct,
    }),
  ),
  gasPrice: Type.Optional(
    Type.String({
      description: 'Gas price in wei for the transaction',
    }),
  ),
  maxGas: Type.Optional(
    Type.Number({
      description: 'Maximum gas limit for the transaction',
      examples: [300000],
    }),
  ),
});

// Hyperswap AMM Execute Swap Request
export const HyperswapAmmExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address that will execute the swap',
      default: ethereumChainConfig.defaultWallet,
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'The EVM network to use',
      default: ethereumChainConfig.defaultNetwork,
      enum: [...HyperswapConfig.networks],
    }),
  ),
  poolAddress: Type.Optional(
    Type.String({
      description: 'Pool address (optional - can be looked up from tokens)',
      default: '',
    }),
  ),
  baseToken: Type.String({
    description: 'Base token symbol or address',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'Quote token symbol or address',
    examples: [QUOTE_TOKEN],
  }),
  amount: Type.Number({
    description: 'Amount to swap',
    examples: [SWAP_AMOUNT],
  }),
  side: Type.String({
    enum: ['BUY', 'SELL'],
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: HyperswapConfig.config.slippagePct,
    }),
  ),
});
