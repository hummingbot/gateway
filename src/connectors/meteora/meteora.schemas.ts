import { Type, Static, TSchema } from '@sinclair/typebox'

// Common fields that are reused
const id = Type.String({ minLength: 1 })
const price = Type.String({ minLength: 1 })
const size = Type.String({ minLength: 1 })
const side = Type.Enum({ buy: 'buy', sell: 'sell' })

// Base response wrapper
export const baseResponse = <T extends TSchema>(schema: T) =>
  Type.Object({
    success: Type.Boolean(),
    message: Type.Optional(Type.String()),
    data: schema,
  })

// Market schemas
export const market = Type.Object({
  id,
  baseToken: Type.String({ minLength: 1 }),
  quoteToken: Type.String({ minLength: 1 }),
  poolAddress: Type.String({ minLength: 1 }),
  fee: Type.Number({ minimum: 0 }),
})
export const markets = baseResponse(Type.Array(market))

// Order schemas
export const order = Type.Object({
  orderId: id,
  marketId: id,
  side,
  price,
  size,
  status: Type.Enum({ open: 'open', filled: 'filled', cancelled: 'cancelled' }),
  createdAt: Type.String({ format: 'datetime' }),
})
export const orders = baseResponse(Type.Array(order))

// Trade schemas
export const trade = Type.Object({
  tradeId: id,
  orderId: id,
  marketId: id,
  price,
  size,
  side,
  timestamp: Type.String({ format: 'datetime' }),
})
export const trades = baseResponse(Type.Array(trade))

// Request/Response Schemas for getSwapQuote
export const GetSwapQuoteRequestSchema = Type.Object({
  network: Type.String(),
  inputTokenSymbol: Type.String(),
  outputTokenSymbol: Type.String(),
  amount: Type.Number(),
  poolAddress: Type.String(),
  slippagePct: Type.Optional(Type.Number({ default: 1, minimum: 0, maximum: 100 })),
})

export const GetSwapQuoteResponseSchema = Type.Object({
  estimatedAmountIn: Type.String(),
  estimatedAmountOut: Type.String(),
  minOutAmount: Type.String(),
})

// Request/Response Schemas for getFeesQuote
export const GetFeesQuoteRequestSchema = Type.Object({
  network: Type.String(),
  positionAddress: Type.String(),
})

export const GetFeesQuoteResponseSchema = Type.Object({
  tokenX: Type.Object({
    address: Type.String(),
    amount: Type.String(),
  }),
  tokenY: Type.Object({
    address: Type.String(),
    amount: Type.String(),
  }),
})

// Request/Response Schemas for getLbPairs
export const GetLbPairsRequestSchema = Type.Object({
  network: Type.String(),
})

export const GetLbPairsResponseSchema = Type.Object({
    // Get all info from LbPairAccount program account
    publicKey: Type.String(),
    account: Type.Object({
      binArrayBitmap: Type.Optional(Type.Array(Type.Number())),
      bumpSeed: Type.Optional(Type.Number()),
      feeOwner: Type.Optional(Type.String()),
      feeVault: Type.Optional(Type.String()),
      fundOwner: Type.Optional(Type.String()),
      fundVault: Type.Optional(Type.String()),
      inactive: Type.Optional(Type.Boolean()),
      lastUpdatedAt: Type.Optional(Type.Number()),
      oracle: Type.Optional(Type.String()),
      parameters: Type.Optional(
        Type.Object({
          baseFactor: Type.Optional(Type.Number()),
          binStep: Type.Optional(Type.Number()),
          filteredNbReference: Type.Optional(Type.Number()),
          maxBinId: Type.Optional(Type.Number()),
          minBinId: Type.Optional(Type.Number()),
          protocolShare: Type.Optional(Type.Number()),
          reductionFactor: Type.Optional(Type.Number()),
          variableFeeControl: Type.Optional(Type.Number()),
        }),
      ),
      reserveX: Type.Optional(Type.String()),
      reserveY: Type.Optional(Type.String()),
      rewardInfos: Type.Optional(
        Type.Array(
          Type.Object({
            lastUpdateTime: Type.Optional(Type.Number()),
            rewardAPerSecond: Type.Optional(Type.String()),
            rewardBPerSecond: Type.Optional(Type.String()),
            rewardMintAddress: Type.Optional(Type.String()),
            rewardVaultAddress: Type.Optional(Type.String()),
          }),
        ),
      ),
      staticParameters: Type.Optional(
        Type.Object({
          activeId: Type.Optional(Type.Number()),
          binStep: Type.Optional(Type.Number()),
          tokenXMint: Type.Optional(Type.String()),
          tokenYMint: Type.Optional(Type.String()),
        }),
      ),
      totalFeeXAmount: Type.Optional(Type.String()),
      totalFeeYAmount: Type.Optional(Type.String()),
      totalXAmount: Type.Optional(Type.String()),
      totalYAmount: Type.Optional(Type.String()),
      vParameters: Type.Optional(
        Type.Object({
          volatilityAccumulator: Type.Optional(Type.Number()),
          volatilityReference: Type.Optional(Type.Number()),
        }),
      ),
    }),
  });

// TypeScript types
export type GetSwapQuoteRequest = Static<typeof GetSwapQuoteRequestSchema>
export type GetSwapQuoteResponse = Static<typeof GetSwapQuoteResponseSchema>
export type GetFeesQuoteRequest = Static<typeof GetFeesQuoteRequestSchema>
export type GetFeesQuoteResponse = Static<typeof GetFeesQuoteResponseSchema>
export type GetLbPairsRequest = Static<typeof GetLbPairsRequestSchema>
export type GetLbPairsResponse = Static<typeof GetLbPairsResponseSchema> 