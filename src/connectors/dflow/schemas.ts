import { Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

import { DFlowConfig } from './dflow.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.1;

// DFlow-specific quote-swap request (superset of base QuoteSwapRequest)
export const DFlowQuoteSwapRequest = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...DFlowConfig.networks],
    }),
  ),
  baseToken: Type.String({
    description: 'Solana token symbol or address to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'The other Solana token symbol or address in the pair',
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
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: DFlowConfig.config.slippagePct,
    }),
  ),
  approximateIfNoExactOut: Type.Optional(
    Type.Boolean({
      description:
        'For BUY orders when the router has no ExactOut route: approximate via a sell-leg ExactIn quote instead of failing',
      default: true,
    }),
  ),
});

// DFlow-specific quote-swap response (superset of base QuoteSwapResponse)
export const DFlowQuoteSwapResponse = Type.Object({
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
  approximation: Type.Optional(
    Type.Boolean({
      description:
        'True when a BUY was approximated via a sell-leg ExactIn quote (DFlow is ExactIn-only); amountOut is an estimate',
    }),
  ),
  quoteResponse: Type.Any({
    description: "DFlow's native quote response, used to build the swap transaction at execution time",
  }),
});

// DFlow-specific execute-quote request (superset of base ExecuteQuoteRequest)
export const DFlowExecuteQuoteRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will execute the swap',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...DFlowConfig.networks],
    }),
  ),
  quoteId: Type.String({
    description: 'ID of the DFlow quote to execute',
    examples: ['123e4567-e89b-12d3-a456-426614174000'],
  }),
});

// DFlow-specific execute-swap request (superset of base ExecuteSwapRequest)
export const DFlowExecuteSwapRequest = Type.Object({
  walletAddress: Type.Optional(
    Type.String({
      description: 'Solana wallet address that will execute the swap',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
  network: Type.Optional(
    Type.String({
      description: 'Solana network to use',
      default: solanaChainConfig.defaultNetwork,
      enum: [...DFlowConfig.networks],
    }),
  ),
  baseToken: Type.String({
    description: 'Solana token symbol or address to determine swap direction',
    examples: [BASE_TOKEN],
  }),
  quoteToken: Type.String({
    description: 'The other Solana token symbol or address in the pair',
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
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: DFlowConfig.config.slippagePct,
    }),
  ),
  approximateIfNoExactOut: Type.Optional(
    Type.Boolean({
      description:
        'For BUY orders when the router has no ExactOut route: approximate via a sell-leg ExactIn quote instead of failing',
      default: true,
    }),
  ),
});
