import { Type, Static } from '@sinclair/typebox';

import { DecimalNumber } from './decimal-field';

/**
 * Response of /trading/launch/create-token: the transaction outcome plus the
 * identity the operation minted. `mint` and `metadataUri` are known as soon as
 * the transaction is built, so they are present even on a pending response.
 */
export const CreateTokenResponse = Type.Object(
  {
    signature: Type.String({ description: 'Transaction signature/hash' }),
    status: Type.Number({ description: 'Transaction status: 0 = PENDING, 1 = CONFIRMED, -1 = FAILED' }),
    mint: Type.String({ description: 'Mint address of the newly created token' }),
    metadataUri: Type.String({
      description:
        'Metadata URI embedded on-chain — the one passed in, or the one uploaded from imageUrl. ' +
        'Reuse it on a retry to skip re-uploading.',
    }),
    poolAddress: Type.Optional(
      Type.String({
        description:
          'The venue the token launched on, for launchpads that create a pool account per token ' +
          '(meteora-dbc: the virtual pool PDA). Absent for pump, whose bonding curve is derived from the mint.',
      }),
    ),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object(
        {
          fee: DecimalNumber({}),
          tokenAmountBought: Type.Optional(
            DecimalNumber({ description: 'Tokens received by the initial buy (devBuyAmount / firstBuySol)' }),
          ),
          quoteTokenAmountSpent: Type.Optional(
            DecimalNumber({ description: 'Quote currency spent on the initial buy (devBuyAmount / firstBuySol)' }),
          ),
        },
        { $id: 'LaunchCreateTokenResponseData' },
      ),
    ),
  },
  { $id: 'LaunchCreateTokenResponse' },
);
export type CreateTokenResponseType = Static<typeof CreateTokenResponse>;

/**
 * GET /trading/launch/pool-info: state of a launchpad venue that is a per-token
 * curve account — a Meteora DBC virtual pool or a Raydium LaunchLab pool:
 * curve progress toward graduation, spot price and accrued fees. A field one
 * launchpad has and the other does not is optional and named for its venue.
 */
export const LaunchPoolInfoResponse = Type.Object(
  {
    poolAddress: Type.String({ description: 'The curve account' }),
    config: Type.String({ description: 'Config the pool was launched from (DBC partner config; LaunchLab global)' }),
    creator: Type.String({ description: 'Pool creator (the launcher / manager)' }),
    baseMint: Type.String(),
    quoteMint: Type.String(),
    tokenProgram: Type.String({ description: 'Token program owning the base mint' }),
    isMigrated: Type.Boolean({
      description:
        "True once the curve has finished; trade the token on the pool it graduated to (this connector's amm surface)",
    }),
    migratedPool: Type.Optional(
      Type.String({ description: "pump: the PumpSwap pool a migrated token trades on (its price is that pool's)" }),
    ),
    migrationProgress: DecimalNumber({ description: 'quoteReserve / migrationQuoteThreshold, 0..1' }),
    quoteReserve: DecimalNumber({ description: 'Quote token held by the curve (UI units)' }),
    migrationQuoteThreshold: DecimalNumber({ description: 'Quote reserve at which the pool migrates (UI units)' }),
    price: DecimalNumber({ description: 'Spot price, quote per base' }),
    marketCap: Type.Optional(DecimalNumber({ description: 'raydium, pump: spot price times the supply, in quote' })),
    sqrtPrice: Type.Optional(Type.String({ description: 'meteora: raw Q64.64 sqrt price' })),
    totalTradingBaseFee: Type.Optional(
      DecimalNumber({ description: 'meteora: lifetime trading fees collected in base (UI units)' }),
    ),
    totalTradingQuoteFee: Type.Optional(
      DecimalNumber({ description: 'meteora: lifetime trading fees collected in quote (UI units)' }),
    ),
    partnerQuoteFee: Type.Optional(
      DecimalNumber({
        description: 'meteora, raydium: unclaimed partner (meteora) or platform (raydium) fee in quote (UI units)',
      }),
    ),
    creatorQuoteFee: Type.Optional(
      DecimalNumber({
        description:
          "meteora: unclaimed creator fee in quote (UI units). A LaunchLab creator's fee accrues across all its " +
          'launches in one vault per quote, so it is not a pool figure',
      }),
    ),
    protocolQuoteFee: Type.Optional(
      DecimalNumber({ description: 'meteora, raydium: unclaimed protocol fee in quote (UI units)' }),
    ),
    baseDecimals: Type.Number(),
    quoteDecimals: Type.Number(),
  },
  { $id: 'LaunchPoolInfoResponse' },
);
export type LaunchPoolInfoResponseType = Static<typeof LaunchPoolInfoResponse>;
