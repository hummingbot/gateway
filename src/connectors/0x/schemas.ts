import { Type, Static } from '@sinclair/typebox';

import * as Base from '../../schemas/router-schema';

import { ZeroXConfig } from './0x.config';

// Constants for examples
const BASE_TOKEN = 'WETH';
const QUOTE_TOKEN = 'USDC';
const SWAP_AMOUNT = 1;

// 0x-specific extensions for quote-swap
export const ZeroXQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    indicativePrice: Type.Optional(
      Type.Boolean({
        description:
          'If true, returns indicative pricing only (no commitment). If false, returns firm quote ready for execution',
        default: true,
      }),
    ),
    takerAddress: Type.Optional(
      Type.String({
        description: 'Ethereum wallet address that will execute the swap (optional for quotes)',
      }),
    ),
  }),
]);

// 0x-specific extensions for quote-swap response
export const ZeroXQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    priceImpactPct: Type.Number({
      description: 'Estimated price impact as a percentage (0-100)',
    }),
    expirationTime: Type.Optional(
      Type.Number({
        description: 'Unix timestamp when this quote expires (only for firm quotes)',
      }),
    ),
    gasEstimate: Type.String({
      description: 'Estimated gas required for the swap',
    }),
    sources: Type.Optional(
      Type.Array(Type.Any(), {
        description: 'Liquidity sources used for this quote',
      }),
    ),
    allowanceTarget: Type.Optional(
      Type.String({
        description: 'Contract address that needs token approval',
      }),
    ),
    to: Type.Optional(
      Type.String({
        description: 'Contract address to send transaction to',
      }),
    ),
    data: Type.Optional(
      Type.String({
        description: 'Encoded transaction data',
      }),
    ),
    value: Type.Optional(
      Type.String({
        description: 'ETH value to send with transaction',
      }),
    ),
  }),
]);

// 0x-specific extensions for execute-quote
export const ZeroXExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
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
  }),
]);

// 0x-specific extensions for execute-swap
export const ZeroXExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
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
  }),
]);
