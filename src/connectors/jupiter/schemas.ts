import { Type } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

import { JupiterConfig } from './jupiter.config';

// Jupiter-specific extensions for quote-swap
export const JupiterQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    network: Type.String({
      description: 'Solana network to use',
      default: 'mainnet-beta',
      examples: ['mainnet-beta', 'devnet'],
    }),
    baseToken: Type.String({
      description: 'Solana token symbol or address to determine swap direction',
      examples: ['SOL'],
    }),
    quoteToken: Type.String({
      description: 'The other Solana token symbol or address in the pair',
      examples: ['USDC'],
    }),
    amount: Type.Number({
      description: 'Amount of base token to trade',
      examples: [1],
    }),
    side: Type.Enum(
      { BUY: 'BUY', SELL: 'SELL' },
      {
        description:
          'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
        examples: ['SELL'],
      },
    ),
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
        examples: [true],
      }),
    ),
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({
        description: 'Restrict routing to only go through 1 market',
        examples: [false],
      }),
    ),
  }),
]);

// Jupiter-specific extensions for quote-swap response
export const JupiterQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
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
  }),
]);

// Jupiter-specific extensions for execute-quote
export const JupiterExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    walletAddress: Type.String({
      description: 'Solana wallet address that will execute the swap',
    }),
    network: Type.String({
      description: 'Solana network to use',
      default: 'mainnet-beta',
      examples: ['mainnet-beta', 'devnet'],
    }),
    quoteId: Type.String({
      description: 'ID of the Jupiter quote to execute',
      examples: ['123e4567-e89b-12d3-a456-426614174000'],
    }),
    priorityLevel: Type.Optional(
      Type.String({
        description: 'Priority level for Solana transaction processing',
        enum: ['medium', 'high', 'veryHigh'],
        examples: [JupiterConfig.config.priorityLevel],
      }),
    ),
    maxLamports: Type.Optional(
      Type.Number({
        description: 'Maximum priority fee in lamports for Solana transaction',
        examples: [JupiterConfig.config.maxLamports],
      }),
    ),
  }),
]);

// Jupiter-specific extensions for execute-swap
export const JupiterExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    walletAddress: Type.String({
      description: 'Solana wallet address that will execute the swap',
    }),
    network: Type.String({
      description: 'Solana network to use',
      default: 'mainnet-beta',
      examples: ['mainnet-beta', 'devnet'],
    }),
    baseToken: Type.String({
      description: 'Solana token symbol or address to determine swap direction',
      examples: ['SOL'],
    }),
    quoteToken: Type.String({
      description: 'The other Solana token symbol or address in the pair',
      examples: ['USDC'],
    }),
    amount: Type.Number({
      description: 'Amount of base token to trade',
      examples: [1],
    }),
    side: Type.Enum(
      { BUY: 'BUY', SELL: 'SELL' },
      {
        description:
          'Trade direction - BUY means buying base token with quote token, SELL means selling base token for quote token',
        examples: ['SELL'],
      },
    ),
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
        examples: [true],
      }),
    ),
    onlyDirectRoutes: Type.Optional(
      Type.Boolean({
        description: 'Restrict routing to only go through 1 market',
        examples: [false],
      }),
    ),
    priorityLevel: Type.Optional(
      Type.String({
        description: 'Priority level for Solana transaction processing',
        enum: ['medium', 'high', 'veryHigh'],
        examples: [JupiterConfig.config.priorityLevel],
      }),
    ),
    maxLamports: Type.Optional(
      Type.Number({
        description: 'Maximum priority fee in lamports for Solana transaction',
        examples: [JupiterConfig.config.maxLamports],
      }),
    ),
  }),
]);
