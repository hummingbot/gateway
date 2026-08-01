import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig } from '../chains/solana/solana.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// ============================================================================
// Common Types
// ============================================================================

export const MetaDaoMarketEnum = Type.String({
  description: 'Conditional market type',
  enum: ['PASS', 'FAIL'],
});

export const MetaDaoSwapTypeEnum = Type.String({
  description: 'Swap direction - BUY base with quote, SELL base for quote',
  enum: ['BUY', 'SELL'],
});

export const MetaDaoPoolStateEnum = Type.String({
  description: 'Pool state - spot (normal trading) or futarchy (proposal active)',
  enum: ['spot', 'futarchy'],
});

// ============================================================================
// Pool Info Types
// ============================================================================

export const MetaDaoPoolReservesSchema = Type.Object({
  baseReserves: Type.Number({ description: 'Human-readable base token reserves' }),
  quoteReserves: Type.Number({ description: 'Human-readable quote token reserves' }),
  baseReservesRaw: Type.String({ description: 'Raw integer base reserves (on-chain)' }),
  quoteReservesRaw: Type.String({ description: 'Raw integer quote reserves (on-chain)' }),
  price: Type.Number({ description: 'Quote per base price' }),
  baseVault: Type.Optional(Type.String({ description: 'Base token vault address' })),
  quoteVault: Type.Optional(Type.String({ description: 'Quote token vault address' })),
  protocolFeeBase: Type.Optional(Type.Number({ description: 'Human-readable accumulated base protocol fees' })),
  protocolFeeQuote: Type.Optional(Type.Number({ description: 'Human-readable accumulated quote protocol fees' })),
  protocolFeeBaseRaw: Type.Optional(Type.String({ description: 'Raw integer accumulated base protocol fees' })),
  protocolFeeQuoteRaw: Type.Optional(Type.String({ description: 'Raw integer accumulated quote protocol fees' })),
});
export type MetaDaoPoolReserves = Static<typeof MetaDaoPoolReservesSchema>;

export const MetaDaoReservePairSchema = Type.Object({
  base: Type.Number({ description: 'Human-readable base reserves' }),
  quote: Type.Number({ description: 'Human-readable quote reserves' }),
  baseRaw: Type.String({ description: 'Raw integer base reserves' }),
  quoteRaw: Type.String({ description: 'Raw integer quote reserves' }),
});
export type MetaDaoReservePair = Static<typeof MetaDaoReservePairSchema>;

export const MetaDaoProposalPdasSchema = Type.Object({
  question: Type.String(),
  baseVault: Type.String(),
  quoteVault: Type.String(),
  passBaseMint: Type.String(),
  passQuoteMint: Type.String(),
  failBaseMint: Type.String(),
  failQuoteMint: Type.String(),
});
export type MetaDaoProposalPdas = Static<typeof MetaDaoProposalPdasSchema>;

export const MetaDaoPoolInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
  },
  { $id: 'MetaDaoPoolInfoRequest' },
);
export type MetaDaoPoolInfoRequestType = Static<typeof MetaDaoPoolInfoRequest>;

export const MetaDaoPoolInfoResponse = Type.Object(
  {
    pool: Type.String({ description: 'Pool/DAO address' }),
    baseMint: Type.String(),
    quoteMint: Type.String(),
    baseSymbol: Type.String(),
    quoteSymbol: Type.String(),
    state: MetaDaoPoolStateEnum,
    totalLiquidity: Type.Number({ description: 'Total LP token supply' }),
    totalLiquidityRaw: Type.String({ description: 'Raw integer total LP token supply' }),
    spot: MetaDaoPoolReservesSchema,
    pass: Type.Optional(MetaDaoPoolReservesSchema),
    fail: Type.Optional(MetaDaoPoolReservesSchema),
  },
  { $id: 'MetaDaoPoolInfoResponse' },
);
export type MetaDaoPoolInfoResponseType = Static<typeof MetaDaoPoolInfoResponse>;

// ============================================================================
// Spot Swap Types
// ============================================================================

export const MetaDaoQuoteSwapRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
    quoteToken: Type.Optional(
      Type.String({
        default: 'USDC',
        description: 'Quote token symbol (e.g., USDC) or mint address. Used to match pool.',
      }),
    ),
    amount: Type.Number({ description: 'Amount of base token to trade', minimum: 0 }),
    side: MetaDaoSwapTypeEnum,
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoQuoteSwapRequest' },
);
export type MetaDaoQuoteSwapRequestType = Static<typeof MetaDaoQuoteSwapRequest>;

export const MetaDaoQuoteSwapResponse = Type.Object(
  {
    quoteId: Type.String(),
    pool: Type.String({ description: 'Pool/DAO address' }),
    tokenIn: Type.String(),
    tokenOut: Type.String(),
    amountIn: Type.Number(),
    amountOut: Type.Number(),
    price: Type.Number({ description: 'Effective quote per base price' }),
    priceImpactPct: Type.Number(),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),
    fee: Type.Object({
      lpFeeBps: Type.Number(),
      protocolFeeBps: Type.Number(),
      totalFeeBps: Type.Number(),
    }),
    poolReserves: MetaDaoReservePairSchema,
  },
  { $id: 'MetaDaoQuoteSwapResponse' },
);
export type MetaDaoQuoteSwapResponseType = Static<typeof MetaDaoQuoteSwapResponse>;

export const MetaDaoExecuteSwapRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    walletAddress: Type.Optional(Type.String({ description: 'Wallet address (uses default wallet if not provided)' })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
    quoteToken: Type.Optional(
      Type.String({
        default: 'USDC',
        description: 'Quote token symbol (e.g., USDC) or mint address. Used to match pool.',
      }),
    ),
    amount: Type.Number({ description: 'Amount of base token to trade', minimum: 0 }),
    side: MetaDaoSwapTypeEnum,
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoExecuteSwapRequest' },
);
export type MetaDaoExecuteSwapRequestType = Static<typeof MetaDaoExecuteSwapRequest>;

export const MetaDaoExecuteSwapResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus: -1=failed, 0=pending, 1=confirmed', enum: [-1, 0, 1] }),
    data: Type.Optional(
      Type.Object({
        tokenIn: Type.String(),
        tokenOut: Type.String(),
        amountIn: Type.Number(),
        amountOut: Type.Number(),
        fee: Type.Number({ description: 'SOL transaction fee' }),
        baseTokenBalanceChange: Type.Number(),
        quoteTokenBalanceChange: Type.Number(),
      }),
    ),
  },
  { $id: 'MetaDaoExecuteSwapResponse' },
);
export type MetaDaoExecuteSwapResponseType = Static<typeof MetaDaoExecuteSwapResponse>;

// ============================================================================
// Conditional Swap Types
// ============================================================================

export const MetaDaoQuoteConditionalSwapRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    dao: Type.String({ description: 'DAO public key' }),
    proposal: Type.String({ description: 'Proposal public key' }),
    market: MetaDaoMarketEnum,
    amount: Type.Number({ description: 'Amount of conditional base token to trade', minimum: 0 }),
    side: MetaDaoSwapTypeEnum,
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoQuoteConditionalSwapRequest' },
);
export type MetaDaoQuoteConditionalSwapRequestType = Static<typeof MetaDaoQuoteConditionalSwapRequest>;

export const MetaDaoQuoteConditionalSwapResponse = Type.Object(
  {
    quoteId: Type.String(),
    pool: Type.String({ description: 'Pool/DAO address' }),
    proposal: Type.String(),
    market: MetaDaoMarketEnum,
    side: MetaDaoSwapTypeEnum,

    // Token info
    tokenIn: Type.String({ description: 'Conditional input token mint' }),
    tokenOut: Type.String({ description: 'Conditional output token mint' }),
    inputSymbol: Type.String({ description: 'e.g., pUSDC, fMETA' }),
    outputSymbol: Type.String({ description: 'e.g., pMETA, fUSDC' }),

    // Amounts
    amountIn: Type.Number(),
    amountOut: Type.Number(),
    price: Type.Number({ description: 'Effective quote per base price' }),
    priceImpactPct: Type.Number(),
    minAmountOut: Type.Number(),
    maxAmountIn: Type.Number(),

    // Pool state
    poolReserves: MetaDaoReservePairSchema,

    // Proposal context
    proposalState: Type.String({ enum: ['pending', 'passed', 'failed'] }),
    tradingEndsAt: Type.Number({ description: 'Unix timestamp' }),

    // All proposal PDAs for reference
    pdas: MetaDaoProposalPdasSchema,
  },
  { $id: 'MetaDaoQuoteConditionalSwapResponse' },
);
export type MetaDaoQuoteConditionalSwapResponseType = Static<typeof MetaDaoQuoteConditionalSwapResponse>;

export const MetaDaoExecuteConditionalSwapRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    walletAddress: Type.Optional(Type.String({ description: 'Wallet address (uses default wallet if not provided)' })),
    dao: Type.String(),
    proposal: Type.String(),
    market: MetaDaoMarketEnum,
    amount: Type.Number({ description: 'Amount of conditional base token to trade', minimum: 0 }),
    side: MetaDaoSwapTypeEnum,
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoExecuteConditionalSwapRequest' },
);
export type MetaDaoExecuteConditionalSwapRequestType = Static<typeof MetaDaoExecuteConditionalSwapRequest>;

export const MetaDaoExecuteConditionalSwapResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ enum: [-1, 0, 1] }),
    data: Type.Optional(
      Type.Object({
        market: MetaDaoMarketEnum,
        tokenIn: Type.String(),
        tokenOut: Type.String(),
        amountIn: Type.Number(),
        amountOut: Type.Number(),
        fee: Type.Number(),
        baseTokenBalanceChange: Type.Number(),
        quoteTokenBalanceChange: Type.Number(),
      }),
    ),
  },
  { $id: 'MetaDaoExecuteConditionalSwapResponse' },
);
export type MetaDaoExecuteConditionalSwapResponseType = Static<typeof MetaDaoExecuteConditionalSwapResponse>;

export const MetaDaoSplitTokensRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    walletAddress: Type.Optional(Type.String({ description: 'Wallet address (uses default wallet if not provided)' })),
    dao: Type.String(),
    proposal: Type.String(),
    asset: Type.Union([Type.Literal('base'), Type.Literal('quote')], {
      description: 'Which underlying to split: base token or quote token',
    }),
    amount: Type.Number({ description: 'Amount of underlying token to split into pass + fail tokens', minimum: 0 }),
  },
  { $id: 'MetaDaoSplitTokensRequest' },
);
export type MetaDaoSplitTokensRequestType = Static<typeof MetaDaoSplitTokensRequest>;

export const MetaDaoSplitTokensResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ enum: [-1, 0, 1] }),
    data: Type.Optional(
      Type.Object({
        asset: Type.String(),
        underlyingMint: Type.String(),
        passMint: Type.String(),
        failMint: Type.String(),
        amount: Type.Number(),
      }),
    ),
  },
  { $id: 'MetaDaoSplitTokensResponse' },
);
export type MetaDaoSplitTokensResponseType = Static<typeof MetaDaoSplitTokensResponse>;

// ============================================================================
// Liquidity Types
// ============================================================================

export const MetaDaoQuoteLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
    quoteAmount: Type.Number({ description: 'Quote token amount to deposit', minimum: 0 }),
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoQuoteLiquidityRequest' },
);
export type MetaDaoQuoteLiquidityRequestType = Static<typeof MetaDaoQuoteLiquidityRequest>;

export const MetaDaoQuoteLiquidityResponse = Type.Object(
  {
    pool: Type.String({ description: 'Pool/DAO address' }),
    baseMint: Type.String(),
    quoteMint: Type.String(),
    poolState: MetaDaoPoolStateEnum,

    // Deposit amounts
    quoteAmount: Type.Number(),
    baseAmount: Type.Number({ description: 'Calculated base to deposit' }),
    maxBaseAmount: Type.Number({ description: 'With slippage' }),

    // LP tokens
    liquidityMinted: Type.Number({ description: 'LP shares to receive' }),
    minLiquidity: Type.Number({ description: 'With slippage' }),
    totalLiquidity: Type.Number({ description: 'Current total LP supply' }),
    totalLiquidityRaw: Type.String({ description: 'Raw integer current LP supply' }),
    shareOfPool: Type.Number({ description: 'Percentage of pool after deposit' }),

    // Current pool state
    poolReserves: MetaDaoReservePairSchema,
  },
  { $id: 'MetaDaoQuoteLiquidityResponse' },
);
export type MetaDaoQuoteLiquidityResponseType = Static<typeof MetaDaoQuoteLiquidityResponse>;

export const MetaDaoAddLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    walletAddress: Type.Optional(Type.String({ description: 'Wallet address (uses default wallet if not provided)' })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
    quoteAmount: Type.Number({ minimum: 0 }),
    maxBaseAmount: Type.Optional(Type.Number({ description: 'Maximum base to deposit (calculated if omitted)' })),
    minLiquidity: Type.Optional(Type.Number({ description: 'Minimum LP shares to receive' })),
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoAddLiquidityRequest' },
);
export type MetaDaoAddLiquidityRequestType = Static<typeof MetaDaoAddLiquidityRequest>;

export const MetaDaoAddLiquidityResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ enum: [-1, 0, 1] }),
    data: Type.Optional(
      Type.Object({
        pool: Type.String({ description: 'Pool/DAO address' }),
        positionAddress: Type.String(),
        quoteDeposited: Type.Number(),
        baseDeposited: Type.Number(),
        liquidityMinted: Type.Number(),
        fee: Type.Number(),
      }),
    ),
  },
  { $id: 'MetaDaoAddLiquidityResponse' },
);
export type MetaDaoAddLiquidityResponseType = Static<typeof MetaDaoAddLiquidityResponse>;

export const MetaDaoRemoveLiquidityRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    walletAddress: Type.Optional(Type.String({ description: 'Wallet address (uses default wallet if not provided)' })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
    liquidityAmount: Type.Number({ description: 'LP shares to burn', minimum: 0 }),
    minBaseAmount: Type.Optional(Type.Number({ description: 'Minimum base to receive' })),
    minQuoteAmount: Type.Optional(Type.Number({ description: 'Minimum quote to receive' })),
    slippagePct: Type.Optional(Type.Number({ default: 0.5, minimum: 0, maximum: 100 })),
  },
  { $id: 'MetaDaoRemoveLiquidityRequest' },
);
export type MetaDaoRemoveLiquidityRequestType = Static<typeof MetaDaoRemoveLiquidityRequest>;

export const MetaDaoRemoveLiquidityResponse = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ enum: [-1, 0, 1] }),
    data: Type.Optional(
      Type.Object({
        pool: Type.String({ description: 'Pool/DAO address' }),
        positionAddress: Type.String(),
        liquidityBurned: Type.Number(),
        baseReceived: Type.Number(),
        quoteReceived: Type.Number(),
        fee: Type.Number(),
      }),
    ),
  },
  { $id: 'MetaDaoRemoveLiquidityResponse' },
);
export type MetaDaoRemoveLiquidityResponseType = Static<typeof MetaDaoRemoveLiquidityResponse>;

// ============================================================================
// Balance Types
// ============================================================================

export const MetaDaoTokenBalanceSchema = Type.Object({
  mint: Type.String(),
  symbol: Type.String(),
  balance: Type.Number(),
  balanceRaw: Type.String({ description: 'Raw integer token balance' }),
  decimals: Type.Number(),
  ata: Type.Optional(Type.String({ description: 'Associated token account address' })),
});
export type MetaDaoTokenBalance = Static<typeof MetaDaoTokenBalanceSchema>;

export const MetaDaoBalanceRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    dao: Type.String(),
    proposal: Type.Optional(Type.String({ description: 'Proposal to check conditional tokens for' })),
    ownerAddress: Type.Optional(Type.String({ default: solanaChainConfig.defaultWallet })),
  },
  { $id: 'MetaDaoBalanceRequest' },
);
export type MetaDaoBalanceRequestType = Static<typeof MetaDaoBalanceRequest>;

export const MetaDaoBalanceResponse = Type.Object(
  {
    owner: Type.String(),
    pool: Type.String({ description: 'Pool/DAO address' }),
    proposal: Type.Optional(Type.String()),
    balances: Type.Object({
      // Spot tokens (always present)
      base: MetaDaoTokenBalanceSchema,
      quote: MetaDaoTokenBalanceSchema,

      // Conditional tokens (only if proposal provided)
      passBase: Type.Optional(MetaDaoTokenBalanceSchema),
      passQuote: Type.Optional(MetaDaoTokenBalanceSchema),
      failBase: Type.Optional(MetaDaoTokenBalanceSchema),
      failQuote: Type.Optional(MetaDaoTokenBalanceSchema),

      // LP position
      lpPosition: Type.Optional(
        Type.Object({
          liquidity: Type.Number({ description: 'LP shares held' }),
          liquidityRaw: Type.String({ description: 'Raw integer LP shares held' }),
          shareOfPool: Type.Number({ description: 'Percentage of total pool' }),
        }),
      ),
    }),
    proposalState: Type.Optional(Type.String({ enum: ['pending', 'passed', 'failed'] })),
  },
  { $id: 'MetaDaoBalanceResponse' },
);
export type MetaDaoBalanceResponseType = Static<typeof MetaDaoBalanceResponse>;

// ============================================================================
// DAO and Proposal Discovery Types
// ============================================================================

export const MetaDaoDaoInfoSchema = Type.Object({
  address: Type.String(),
  name: Type.Optional(Type.String()),
  baseMint: Type.String(),
  quoteMint: Type.String(),
  baseSymbol: Type.String(),
  quoteSymbol: Type.String(),
  poolState: MetaDaoPoolStateEnum,
  totalLiquidity: Type.Number(),
  totalLiquidityRaw: Type.String(),
  activeProposals: Type.Number(),
});
export type MetaDaoDaoInfo = Static<typeof MetaDaoDaoInfoSchema>;

export const MetaDaoListDaosRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
  },
  { $id: 'MetaDaoListDaosRequest' },
);
export type MetaDaoListDaosRequestType = Static<typeof MetaDaoListDaosRequest>;

export const MetaDaoListDaosItemSchema = Type.Object({
  pool: Type.String({ description: 'Pool/DAO address' }),
  baseMint: Type.String({ description: 'Base token mint address' }),
  quoteMint: Type.String({ description: 'Quote token mint address' }),
  baseSymbol: Type.String({ description: 'Base token symbol' }),
  quoteSymbol: Type.String({ description: 'Quote token symbol' }),
  state: Type.String({ description: 'Pool state (spot or futarchy)' }),
  totalLiquidity: Type.Number({ description: 'Total liquidity in human-readable form' }),
  totalLiquidityRaw: Type.String({ description: 'Raw total liquidity value' }),
  spot: Type.Optional(MetaDaoPoolReservesSchema),
});
export type MetaDaoListDaosItem = Static<typeof MetaDaoListDaosItemSchema>;

// /daos returns DAO addresses from chain
export const MetaDaoListDaosResponse = Type.Object(
  {
    daos: Type.Array(Type.String({ description: 'DAO address' })),
  },
  { $id: 'MetaDaoListDaosResponse' },
);
export type MetaDaoListDaosResponseType = Static<typeof MetaDaoListDaosResponse>;

// /pools returns cached pool data from daos.json
export const MetaDaoListPoolsResponse = Type.Object(
  {
    pools: Type.Array(MetaDaoListDaosItemSchema),
  },
  { $id: 'MetaDaoListPoolsResponse' },
);
export type MetaDaoListPoolsResponseType = Static<typeof MetaDaoListPoolsResponse>;

// /dao-info request - lookup by pool address
export const MetaDaoDaoInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    pool: Type.String({ description: 'Pool/DAO address to fetch info for' }),
  },
  { $id: 'MetaDaoDaoInfoRequest' },
);
export type MetaDaoDaoInfoRequestType = Static<typeof MetaDaoDaoInfoRequest>;

// /dao-info response - same as pool-info
export const MetaDaoDaoInfoResponse = Type.Object(
  {
    pool: Type.String({ description: 'Pool/DAO address' }),
    baseMint: Type.String(),
    quoteMint: Type.String(),
    baseSymbol: Type.String(),
    quoteSymbol: Type.String(),
    state: MetaDaoPoolStateEnum,
    totalLiquidity: Type.Number({ description: 'Total LP token supply' }),
    totalLiquidityRaw: Type.String({ description: 'Raw integer total LP token supply' }),
    spot: MetaDaoPoolReservesSchema,
    pass: Type.Optional(MetaDaoPoolReservesSchema),
    fail: Type.Optional(MetaDaoPoolReservesSchema),
  },
  { $id: 'MetaDaoDaoInfoResponse' },
);
export type MetaDaoDaoInfoResponseType = Static<typeof MetaDaoDaoInfoResponse>;

export const MetaDaoProposalInfoSchema = Type.Object({
  address: Type.String(),
  number: Type.Optional(Type.Number()),
  status: Type.String({ enum: ['pending', 'passed', 'failed'] }),
  launchedAt: Type.Number(),
  tradingEndsAt: Type.Number(),

  // Conditional mints
  passBaseMint: Type.String(),
  passQuoteMint: Type.String(),
  failBaseMint: Type.String(),
  failQuoteMint: Type.String(),

  // Pool metrics
  passPool: MetaDaoPoolReservesSchema,
  failPool: MetaDaoPoolReservesSchema,

  // Derived metrics
  impliedProbability: Type.Number({ description: 'Probability proposal passes based on prices' }),
});
export type MetaDaoProposalInfo = Static<typeof MetaDaoProposalInfoSchema>;

export const MetaDaoListProposalsRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    baseToken: Type.String({ description: 'Base token symbol (e.g., META) or mint address. Used to identify pool.' }),
    status: Type.Optional(Type.String({ enum: ['pending', 'passed', 'failed', 'all'], default: 'all' })),
  },
  { $id: 'MetaDaoListProposalsRequest' },
);
export type MetaDaoListProposalsRequestType = Static<typeof MetaDaoListProposalsRequest>;

export const MetaDaoListProposalsResponse = Type.Object(
  {
    pool: Type.String({ description: 'Pool/DAO address' }),
    proposals: Type.Array(MetaDaoProposalInfoSchema),
  },
  { $id: 'MetaDaoListProposalsResponse' },
);
export type MetaDaoListProposalsResponseType = Static<typeof MetaDaoListProposalsResponse>;

// ============================================================================
// Proposal Info Types (standalone proposal lookup)
// ============================================================================

export const MetaDaoProposalInfoRequest = Type.Object(
  {
    network: Type.Optional(Type.String({ default: solanaChainConfig.defaultNetwork })),
    proposal: Type.String({ description: 'Proposal public key' }),
  },
  { $id: 'MetaDaoProposalInfoRequest' },
);
export type MetaDaoProposalInfoRequestType = Static<typeof MetaDaoProposalInfoRequest>;

export const MetaDaoProposalInfoResponse = Type.Object(
  {
    proposal: Type.String(),
    pool: Type.String({ description: 'Pool/DAO address' }),
    number: Type.Optional(Type.Number()),
    status: Type.String({ enum: ['pending', 'passed', 'failed'] }),
    launchedAt: Type.Number(),
    tradingEndsAt: Type.Number(),

    // DAO token info
    baseMint: Type.String(),
    quoteMint: Type.String(),
    baseSymbol: Type.String(),
    quoteSymbol: Type.String(),

    // Conditional token mints
    pdas: MetaDaoProposalPdasSchema,

    // Pass market
    passPool: Type.Object({
      baseReserves: Type.Number(),
      quoteReserves: Type.Number(),
      baseReservesRaw: Type.String(),
      quoteReservesRaw: Type.String(),
      price: Type.Number({ description: 'Pass market price (quote per base)' }),
    }),

    // Fail market
    failPool: Type.Object({
      baseReserves: Type.Number(),
      quoteReserves: Type.Number(),
      baseReservesRaw: Type.String(),
      quoteReservesRaw: Type.String(),
      price: Type.Number({ description: 'Fail market price (quote per base)' }),
    }),

    // Derived metrics
    impliedProbability: Type.Number({ description: 'Probability proposal passes (0-100%)' }),
    passThresholdBps: Type.Number({ description: 'Pass TWAP must exceed fail TWAP by this many bps to pass' }),
    isTeamSponsored: Type.Boolean(),

    // TWAP oracle state — the decision-relevant signal for a reactive defense.
    // The proposal passes iff passTwap >= failTwap * (1 + passThresholdBps/10000).
    twap: Type.Optional(
      Type.Object({
        windowOpen: Type.Boolean({ description: 'Whether the TWAP window has started accumulating' }),
        twapStartsAt: Type.Number({ description: 'Unix ts when observations begin (created + startDelaySeconds)' }),
        twapEndsAt: Type.Number({ description: 'Unix ts when the TWAP window closes (proposal trading end)' }),
        elapsedSeconds: Type.Number({ description: 'Seconds of TWAP accumulation so far' }),
        passTwapObs: Type.Number({ description: 'Realized pass TWAP so far (oracle units)' }),
        failTwapObs: Type.Number({ description: 'Realized fail TWAP so far (oracle units)' }),
        passLastObs: Type.Number({ description: 'Current pass resting observation (oracle units)' }),
        failLastObs: Type.Number({ description: 'Current fail resting observation (oracle units)' }),
        passLastUpdated: Type.Number({ description: 'Unix ts of last pass observation' }),
        failLastUpdated: Type.Number({ description: 'Unix ts of last fail observation' }),
        marginPct: Type.Number({ description: 'realized (passTwap/failTwap - 1) * 100' }),
        thresholdPct: Type.Number({ description: 'passThresholdBps / 100' }),
        marginVsThresholdPct: Type.Number({ description: 'marginPct - thresholdPct; > 0 means currently passing' }),
        attackerWinning: Type.Boolean({ description: 'Whether the realized TWAP currently clears the pass threshold' }),
        lastObsMarginPct: Type.Number({ description: 'Instantaneous (passLastObs/failLastObs - 1) * 100' }),
        lastObsMarginVsThresholdPct: Type.Number({
          description: 'lastObsMarginPct - thresholdPct; the live sampled-price signal',
        }),
      }),
    ),

    passMarketCap: Type.Optional(Type.Number({ description: 'Pass market cap in quote tokens' })),
    failMarketCap: Type.Optional(Type.Number({ description: 'Fail market cap in quote tokens' })),
  },
  { $id: 'MetaDaoProposalInfoResponse' },
);
export type MetaDaoProposalInfoResponseType = Static<typeof MetaDaoProposalInfoResponse>;
