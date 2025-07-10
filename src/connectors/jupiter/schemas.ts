import { Type } from '@sinclair/typebox';

import { JupiterConfig } from './jupiter.config';

// Constants for examples
const BASE_TOKEN = 'SOL';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 0.1;

// Jupiter-specific quote-swap request (superset of base QuoteSwapRequest)
export const JupiterQuoteSwapRequest = Type.Object({
  network: Type.String({
    description: 'Solana network to use',
    default: JupiterConfig.config.defaultNetwork,
    examples: JupiterConfig.networks,
  }),
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
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      examples: [JupiterConfig.config.slippagePct],
    }),
  ),
  restrictIntermediateTokens: Type.Optional(
    Type.Boolean({
      description:
        'Restrict routing through highly liquid intermediate tokens only for better price and stability',
      default: JupiterConfig.config.restrictIntermediateTokens,
      examples: [JupiterConfig.config.restrictIntermediateTokens],
    }),
  ),
  onlyDirectRoutes: Type.Optional(
    Type.Boolean({
      description: 'Restrict routing to only go through 1 market',
      default: JupiterConfig.config.onlyDirectRoutes,
      examples: [JupiterConfig.config.onlyDirectRoutes],
    }),
  ),
});

// Jupiter-specific quote-swap response (superset of base QuoteSwapResponse)
export const JupiterQuoteSwapResponse = Type.Object({
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
  slippagePct: Type.Number({
    description: 'Slippage percentage used for this quote',
  }),
  priceWithSlippage: Type.Number({
    description: 'Price including slippage (worst acceptable price)',
  }),
  minAmountOut: Type.Number({
    description: 'Minimum amount of tokenOut that will be accepted',
  }),
  maxAmountIn: Type.Number({
    description: 'Maximum amount of tokenIn that will be spent',
  }),
  quoteResponse: Type.Object({
    inputMint: Type.String({
      description: 'Solana mint address of input token',
    }),
    inAmount: Type.String({
      description: 'Input amount in token decimals',
    }),
    outputMint: Type.String({
      description: 'Solana mint address of output token',
    }),
    outAmount: Type.String({
      description: 'Expected output amount in token decimals',
    }),
    otherAmountThreshold: Type.String({
      description: 'Minimum output amount based on slippage',
    }),
    swapMode: Type.String({
      description: 'Swap mode used (ExactIn or ExactOut)',
    }),
    slippageBps: Type.Number({
      description: 'Slippage in basis points',
    }),
    platformFee: Type.Optional(
      Type.Any({
        description: 'Platform fee information if applicable',
      }),
    ),
    priceImpactPct: Type.String({
      description: 'Estimated price impact percentage',
    }),
    routePlan: Type.Array(Type.Any(), {
      description: 'Detailed routing plan through various markets',
    }),
    contextSlot: Type.Optional(
      Type.Number({
        description: 'Solana slot used for quote calculation',
      }),
    ),
    timeTaken: Type.Optional(
      Type.Number({
        description: 'Time taken to generate quote in milliseconds',
      }),
    ),
  }),
});

// Jupiter-specific execute-quote request (superset of base ExecuteQuoteRequest)
// Note: We can't dynamically add wallet address example, so it's hardcoded
export const JupiterExecuteQuoteRequest = Type.Object({
  walletAddress: Type.String({
    description: 'Solana wallet address that will execute the swap',
    examples: [
      '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
    ], // Example wallet
  }),
  network: Type.String({
    description: 'Solana network to use',
    default: JupiterConfig.config.defaultNetwork,
    examples: JupiterConfig.networks,
  }),
  quoteId: Type.String({
    description: 'ID of the Jupiter quote to execute',
    examples: ['123e4567-e89b-12d3-a456-426614174000'],
  }),
  priorityLevel: Type.Optional(
    Type.String({
      description: 'Priority level for Solana transaction processing',
      enum: ['medium', 'high', 'veryHigh'],
    }),
  ),
  maxLamports: Type.Optional(
    Type.Number({
      description: 'Maximum priority fee in lamports for Solana transaction',
      examples: [JupiterConfig.config.maxLamports],
    }),
  ),
});

// Jupiter-specific execute-swap request (superset of base ExecuteSwapRequest)
export const JupiterExecuteSwapRequest = Type.Object({
  walletAddress: Type.String({
    description: 'Solana wallet address that will execute the swap',
    examples: [
      '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
    ], // Example wallet
  }),
  network: Type.String({
    description: 'Solana network to use',
    default: JupiterConfig.config.defaultNetwork,
    examples: JupiterConfig.networks,
  }),
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
  }),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      examples: [JupiterConfig.config.slippagePct],
    }),
  ),
  restrictIntermediateTokens: Type.Optional(
    Type.Boolean({
      description:
        'Restrict routing through highly liquid intermediate tokens only for better price and stability',
      default: JupiterConfig.config.restrictIntermediateTokens,
      examples: [JupiterConfig.config.restrictIntermediateTokens],
    }),
  ),
  onlyDirectRoutes: Type.Optional(
    Type.Boolean({
      description: 'Restrict routing to only go through 1 market',
      default: JupiterConfig.config.onlyDirectRoutes,
      examples: [JupiterConfig.config.onlyDirectRoutes],
    }),
  ),
  priorityLevel: Type.Optional(
    Type.String({
      description: 'Priority level for Solana transaction processing',
      enum: ['medium', 'high', 'veryHigh'],
    }),
  ),
  maxLamports: Type.Optional(
    Type.Number({
      description: 'Maximum priority fee in lamports for Solana transaction',
      examples: [JupiterConfig.config.maxLamports],
    }),
  ),
});
