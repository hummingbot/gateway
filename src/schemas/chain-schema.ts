import { Type, Static } from '@sinclair/typebox';

// Transaction status enum
export enum TransactionStatus {
  PENDING = 0,
  CONFIRMED = 1,
  FAILED = -1,
}

export const EstimateGasRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
  },
  { $id: 'EstimateGasRequest' },
);
export type EstimateGasRequestType = Static<typeof EstimateGasRequestSchema>;

export const EstimateGasResponseSchema = Type.Object(
  {
    feePerComputeUnit: Type.Number(), // Fee per compute unit (legacy gas price or maxFeePerGas for EIP-1559)
    denomination: Type.String(), // Denomination: "lamports" or "gwei"
    computeUnits: Type.Number(), // Default compute units/gas limit used for fee calculation
    feeAsset: Type.String(), // Native currency symbol from network config (ETH, SOL, etc.)
    fee: Type.Number(), // Total fee calculated using default gas/compute limits
    timestamp: Type.Number(), // Unix timestamp when estimate was made
    gasType: Type.Optional(Type.String()), // Gas type: "legacy" or "eip1559"
    maxFeePerGas: Type.Optional(Type.Number()), // EIP-1559: Maximum fee per gas in gwei
    maxPriorityFeePerGas: Type.Optional(Type.Number()), // EIP-1559: Maximum priority fee per gas in gwei
  },
  { $id: 'EstimateGasResponse' },
);
export type EstimateGasResponse = Static<typeof EstimateGasResponseSchema>;

export const BalanceRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    address: Type.Optional(Type.String()),
    tokens: Type.Optional(
      Type.Array(Type.String(), {
        description: 'a list of token symbols or addresses',
      }),
    ),
    fetchAll: Type.Optional(
      Type.Boolean({
        description: 'fetch all tokens in wallet, not just those in token list (default: false)',
      }),
    ),
  },
  { $id: 'BalanceRequest' },
);
export type BalanceRequestType = Static<typeof BalanceRequestSchema>;

export const BalanceResponseSchema = Type.Object(
  {
    balances: Type.Record(Type.String(), Type.Number()),
  },
  { $id: 'BalanceResponse' },
);
export type BalanceResponseType = Static<typeof BalanceResponseSchema>;

export const TokensRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    tokenSymbols: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  },
  { $id: 'TokensRequest' },
);
export type TokensRequestType = Static<typeof TokensRequestSchema>;

export const TokensResponseSchema = Type.Object(
  {
    tokens: Type.Array(
      Type.Object({
        symbol: Type.String(),
        address: Type.String(),
        decimals: Type.Number(),
        name: Type.String(),
      }),
    ),
  },
  { $id: 'TokensResponse' },
);
export type TokensResponseType = Static<typeof TokensResponseSchema>;

export const PollRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    signature: Type.String({ description: 'Transaction signature/hash' }),
    tokens: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Array of token symbols or addresses for balance change calculation',
      }),
    ),
    walletAddress: Type.Optional(
      Type.String({
        description: 'Wallet address for balance change calculation (required if tokens provided)',
      }),
    ),
  },
  { $id: 'PollRequest' },
);
export type PollRequestType = Static<typeof PollRequestSchema>;

export const PollResponseSchema = Type.Object(
  {
    currentBlock: Type.Number(),
    signature: Type.String(),
    txBlock: Type.Union([Type.Number(), Type.Null()]),
    txStatus: Type.Number(),
    fee: Type.Union([Type.Number(), Type.Null()]),
    tokenBalanceChanges: Type.Optional(
      Type.Record(Type.String(), Type.Number(), {
        description: 'Dictionary of token balance changes keyed by token input value (symbol or address)',
      }),
    ),
    txData: Type.Union([Type.Record(Type.String(), Type.Any()), Type.Null()]),
    error: Type.Optional(Type.String()),
  },
  { $id: 'PollResponse' },
);
export type PollResponseType = Static<typeof PollResponseSchema>;

export const StatusRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
  },
  { $id: 'StatusRequest' },
);
export type StatusRequestType = Static<typeof StatusRequestSchema>;

export const StatusResponseSchema = Type.Object(
  {
    chain: Type.String(),
    network: Type.String(),
    rpcUrl: Type.String(),
    rpcProvider: Type.String(),
    currentBlockNumber: Type.Number(),
    nativeCurrency: Type.String(),
    swapProvider: Type.String(),
  },
  { $id: 'StatusResponse' },
);
export type StatusResponseType = Static<typeof StatusResponseSchema>;

export const TransactionsRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    walletAddress: Type.String({
      description: 'Wallet address to fetch transactions for',
    }),
    connector: Type.Optional(
      Type.String({
        description: 'Filter by connector with type (e.g., jupiter/router, raydium/clmm, meteora/clmm)',
      }),
    ),
    sinceBlock: Type.Optional(
      Type.Number({
        description: 'Fetch transactions after this slot number',
      }),
    ),
    limit: Type.Optional(
      Type.Number({
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Maximum number of transactions to return (default: 10 to respect rate limits)',
      }),
    ),
  },
  { $id: 'TransactionsRequest' },
);
export type TransactionsRequestType = Static<typeof TransactionsRequestSchema>;

// Transaction signature item schema - lightweight (no parsing)
export const TransactionSignatureSchema = Type.Object(
  {
    signature: Type.String(),
    slot: Type.Number(),
    blockTime: Type.Union([Type.Number(), Type.Null()]),
    err: Type.Union([Type.Any(), Type.Null()]),
    memo: Type.Union([Type.String(), Type.Null()]),
    confirmationStatus: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: 'TransactionSignature' },
);
export type TransactionSignatureType = Static<typeof TransactionSignatureSchema>;

export const TransactionsResponseSchema = Type.Object(
  {
    currentBlock: Type.Number(),
    transactions: Type.Array(TransactionSignatureSchema),
    count: Type.Number({
      description: 'Number of transactions returned',
    }),
  },
  { $id: 'TransactionsResponse' },
);
export type TransactionsResponseType = Static<typeof TransactionsResponseSchema>;

// Parse transaction request
export const ParseRequestSchema = Type.Object(
  {
    network: Type.Optional(Type.String()),
    signature: Type.String({ description: 'Transaction signature to parse' }),
    walletAddress: Type.String({ description: 'Wallet address for balance change calculation' }),
    tokens: Type.Optional(
      Type.Array(Type.String(), {
        description: 'Array of token symbols or addresses to track balance changes',
      }),
    ),
    connector: Type.Optional(
      Type.String({
        description:
          'Connector name (e.g., jupiter, raydium, meteora) - helps identify program and decode instructions',
      }),
    ),
    type: Type.Optional(
      Type.String({
        description: 'Connector type (router, amm, clmm) - helps identify which IDL to use for decoding',
      }),
    ),
  },
  { $id: 'ParseRequest' },
);
export type ParseRequestType = Static<typeof ParseRequestSchema>;

// Parse transaction response - focused on balance changes and fees
export const ParseResponseSchema = Type.Object(
  {
    signature: Type.String(),
    slot: Type.Union([Type.Number(), Type.Null()]),
    blockTime: Type.Union([Type.Number(), Type.Null()]),
    status: Type.Number({ description: '0 = PENDING, 1 = CONFIRMED, -1 = FAILED' }),
    fee: Type.Union([Type.Number(), Type.Null()], {
      description: 'Transaction fee in native currency (SOL)',
    }),
    nativeBalanceChange: Type.Optional(
      Type.Number({
        description: 'Balance change for native currency (SOL) including fees',
      }),
    ),
    tokenBalanceChanges: Type.Optional(
      Type.Record(Type.String(), Type.Number(), {
        description: 'Balance changes keyed by token symbol or address',
      }),
    ),
    connector: Type.Optional(
      Type.String({
        description: 'Detected connector name if transaction interacted with a known program',
      }),
    ),
    action: Type.Optional(
      Type.String({
        description:
          'Human-readable description of the action (e.g., "Swap 0.001 WSOL for 12602.89 BONK on Jupiter Aggregator v6")',
      }),
    ),
    error: Type.Optional(Type.String()),
  },
  { $id: 'ParseResponse' },
);
export type ParseResponseType = Static<typeof ParseResponseSchema>;

// Chain-level quote-swap response (no quoteId since quotes aren't cached)
export const ChainQuoteSwapResponseSchema = Type.Object(
  {
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
    // Optional fields that may be included by specific connectors
    poolAddress: Type.Optional(
      Type.String({
        description: 'Pool address for AMM/CLMM swaps',
      }),
    ),
    routePath: Type.Optional(
      Type.String({
        description: 'Route path for router-based swaps',
      }),
    ),
    slippagePct: Type.Optional(
      Type.Number({
        description: 'Slippage tolerance percentage',
      }),
    ),
  },
  { $id: 'ChainQuoteSwapResponse' },
);
export type ChainQuoteSwapResponseType = Static<typeof ChainQuoteSwapResponseSchema>;

// Chain-level execute-swap response
export const ChainExecuteSwapResponseSchema = Type.Object(
  {
    signature: Type.String({
      description: 'Transaction signature/hash',
    }),
    status: Type.Number({
      description: 'Transaction status: 0 = PENDING, 1 = CONFIRMED, -1 = FAILED',
    }),
    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object({
        tokenIn: Type.String({
          description: 'Address of the token swapped from',
        }),
        tokenOut: Type.String({
          description: 'Address of the token swapped to',
        }),
        amountIn: Type.Number({
          description: 'Actual amount of tokenIn swapped',
        }),
        amountOut: Type.Number({
          description: 'Actual amount of tokenOut received',
        }),
        fee: Type.Number({
          description: 'Transaction fee paid',
        }),
        baseTokenBalanceChange: Type.Number({
          description: 'Change in base token balance (negative for decrease)',
        }),
        quoteTokenBalanceChange: Type.Number({
          description: 'Change in quote token balance (negative for decrease)',
        }),
      }),
    ),
  },
  { $id: 'ChainExecuteSwapResponse' },
);
export type ChainExecuteSwapResponseType = Static<typeof ChainExecuteSwapResponseSchema>;
