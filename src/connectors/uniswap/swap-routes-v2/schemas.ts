import { Type } from '@sinclair/typebox';

import * as Base from '../../../schemas/swap-schema';

// Uniswap-specific request extensions for quote-swap
export const UniswapQuoteSwapRequest = Type.Intersect([
  Base.QuoteSwapRequest,
  Type.Object({
    walletAddress: Type.String({
      description: 'Wallet address for the swap',
    }),
    protocols: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Protocols to use (v2, v3, mixed)',
        examples: [['v2', 'v3']],
      }),
    ),
    enableUniversalRouter: Type.Optional(
      Type.Boolean({
        description: 'Use Universal Router for the swap',
        default: true,
      }),
    ),
  }),
]);

export const UniswapExecuteSwapRequest = Type.Intersect([
  Base.ExecuteSwapRequest,
  Type.Object({
    protocols: Type.Optional(Type.Array(Type.String())),
    enableUniversalRouter: Type.Optional(
      Type.Boolean({
        default: true,
      }),
    ),
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

export const UniswapExecuteQuoteRequest = Type.Intersect([
  Base.ExecuteQuoteRequest,
  Type.Object({
    gasPrice: Type.Optional(Type.String()),
    maxGas: Type.Optional(Type.Number()),
  }),
]);

// Response extensions for quote-swap
export const UniswapQuoteSwapResponse = Type.Intersect([
  Base.QuoteSwapResponse,
  Type.Object({
    route: Type.Array(Type.String()),
    routePath: Type.String(),
    protocols: Type.Array(Type.String()),
    methodParameters: Type.Object({
      calldata: Type.String(),
      value: Type.String(),
      to: Type.String(),
    }),
    gasPriceWei: Type.String(),
    gasEstimate: Type.String(),
  }),
]);
