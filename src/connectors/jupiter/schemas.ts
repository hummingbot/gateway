import { Type } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../../chains/solana/solana.config';

// Get chain config for defaults

// Constants for examples

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
  priceImpactPct: Type.Number({
    description: 'Estimated price impact percentage (0-100)',
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
  approximation: Type.Optional(
    Type.Boolean({
      description: 'Indicates if ExactIn approximation was used when ExactOut route was not available',
    }),
  ),
});
