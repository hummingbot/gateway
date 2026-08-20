import { Type, Static } from '@sinclair/typebox';

import { networks as ethereumNetworks } from '../chains/ethereum/ethereum.config';
import { networks as solanaNetworks } from '../chains/solana/solana.config';

/**
 * Every network the chain routes accept, read from the chain configs rather than
 * listed here, so a network added to conf/chains appears in the docs without an
 * edit. The union spans both chains: `chain` is a path parameter and `network` a
 * query/body field, and OpenAPI cannot make one enum depend on another parameter.
 * Passing a network belonging to the other chain still fails, in resolveChain,
 * with a message naming the chain's own networks.
 */
export const CHAIN_NETWORKS = [...new Set([...solanaNetworks, ...ethereumNetworks])];

/**
 * Network selector shared by every chain route.
 *
 * Carries `examples` rather than `default` on purpose. Fastify injects schema
 * defaults into the request before the handler runs, so a default of
 * 'mainnet-beta' here would be injected for /chains/ethereum/* too and turn a
 * working call that omits the network into "Network 'mainnet-beta' is not an
 * ethereum network". Left absent, each chain resolves its own configured default
 * (solana mainnet-beta, ethereum mainnet) as it does today, while Swagger still
 * renders the enum as a dropdown and shows the example.
 */
export const networkField = () =>
  Type.Optional(
    Type.String({
      description: "Network to use. Defaults to the chain's configured default network.",
      enum: CHAIN_NETWORKS,
      examples: ['mainnet-beta'],
    }),
  );

// Transaction status enum
export enum TransactionStatus {
  PENDING = 0,
  CONFIRMED = 1,
  FAILED = -1,
}

export const EstimateGasRequestSchema = Type.Object(
  {
    network: networkField(),
  },
  { $id: 'EstimateGasRequest', additionalProperties: false },
);
export type EstimateGasRequestType = Static<typeof EstimateGasRequestSchema>;

export const EstimateGasResponseSchema = Type.Object(
  {
    feePerComputeUnit: Type.Number({ format: 'decimal' }), // Fee per compute unit (legacy gas price or maxFeePerGas for EIP-1559)
    denomination: Type.String(), // Denomination: "lamports" or "gwei"
    computeUnits: Type.Number(), // Default compute units/gas limit used for fee calculation
    feeAsset: Type.String(), // Native currency symbol from network config (ETH, SOL, etc.)
    fee: Type.Number({ format: 'decimal' }), // Total fee calculated using default gas/compute limits
    timestamp: Type.Number(), // Unix timestamp when estimate was made
    gasType: Type.Optional(Type.String()), // Gas type: "legacy" or "eip1559"
    maxFeePerGas: Type.Optional(Type.Number({ format: 'decimal' })), // EIP-1559: Maximum fee per gas in gwei
    maxPriorityFeePerGas: Type.Optional(Type.Number({ format: 'decimal' })), // EIP-1559: Maximum priority fee per gas in gwei
    // Solana Helius-specific fields
    priorityFeeLevel: Type.Optional(Type.String()), // Helius priority level used: Min, Low, Medium, High, VeryHigh, UnsafeMax
    priorityFeePerCUEstimate: Type.Optional(Type.Number({ format: 'decimal' })), // Raw Helius estimate in lamports/CU (before minimum enforcement)
  },
  { $id: 'EstimateGasResponse' },
);
export type EstimateGasResponse = Static<typeof EstimateGasResponseSchema>;

export const BalanceRequestSchema = Type.Object(
  {
    network: networkField(),
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
  { $id: 'BalanceRequest', additionalProperties: false },
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
    network: networkField(),
    tokenSymbols: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  },
  // No $id: the pre-refactor shape (per-connector `network`, no `connector`), kept only as
  // the base a unified route composes from. Publishing it would generate a client that
  // sends the wrong keys under a name the real wire shape wants.
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
  // No $id: no route serves this shape. The pool-scoped surfaces answer with the shared
  // Chain* responses, so publishing this would put a name a caller reaches for on a
  // shape they never receive. Kept as the base those responses compose from.
);
export type TokensResponseType = Static<typeof TokensResponseSchema>;

export const PollRequestSchema = Type.Object(
  {
    network: networkField(),
    signature: Type.String({ description: 'Transaction signature/hash' }),
  },
  { $id: 'PollRequest', additionalProperties: false },
);
export type PollRequestType = Static<typeof PollRequestSchema>;

// Values reported in PollResponse.txStatus, shared by all chains.
export enum TransactionStatusCode {
  NOT_FOUND = -2, // unknown to the chain: never received or dropped
  FAILED = -1, // landed with an error / reverted
  PENDING = 0, // seen by the chain, awaiting confirmation
  CONFIRMED = 1, // landed without error
}

export const PollResponseSchema = Type.Object(
  {
    currentBlock: Type.Number(),
    signature: Type.String(),
    txBlock: Type.Union([Type.Number(), Type.Null()]),
    txStatus: Type.Number({
      description:
        'Transaction status: 1 = confirmed, 0 = pending, -1 = failed, -2 = not found (unknown to the chain: never received or dropped; on Solana this is terminal once the transaction blockhash expires)',
    }),
    fee: Type.Union([Type.Number(), Type.Null()]),
    error: Type.Union([Type.String({ description: 'Error info if failed: "TYPE (code): message"' }), Type.Null()]),
    txData: Type.Union([Type.Record(Type.String(), Type.Any()), Type.Null()]),
  },
  { $id: 'PollResponse' },
);
export type PollResponseType = Static<typeof PollResponseSchema>;

export const StatusRequestSchema = Type.Object(
  {
    network: networkField(),
  },
  { $id: 'StatusRequest', additionalProperties: false },
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
      format: 'decimal',
      description: 'Amount of tokenIn to be swapped',
    }),
    amountOut: Type.Number({
      format: 'decimal',
      description: 'Expected amount of tokenOut to receive',
    }),
    price: Type.Number({
      format: 'decimal',
      description: 'Exchange rate between tokenIn and tokenOut',
    }),
    priceImpactPct: Type.Number({
      format: 'decimal',
      description: 'Estimated price impact percentage (0-100)',
    }),
    minAmountOut: Type.Number({
      format: 'decimal',
      description: 'Minimum amount of tokenOut that will be accepted',
    }),
    maxAmountIn: Type.Number({
      format: 'decimal',
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
        format: 'decimal',
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
      Type.Object(
        {
          tokenIn: Type.String({
            description: 'Address of the token swapped from',
          }),
          tokenOut: Type.String({
            description: 'Address of the token swapped to',
          }),
          amountIn: Type.Number({
            format: 'decimal',
            description: 'Actual amount of tokenIn swapped',
          }),
          amountOut: Type.Number({
            format: 'decimal',
            description: 'Actual amount of tokenOut received',
          }),
          fee: Type.Number({
            format: 'decimal',
            description: 'Transaction fee paid',
          }),
          baseTokenBalanceChange: Type.Number({
            format: 'decimal',
            description: 'Change in base token balance (negative for decrease)',
          }),
          quoteTokenBalanceChange: Type.Number({
            format: 'decimal',
            description: 'Change in quote token balance (negative for decrease)',
          }),
          slippagePct: Type.Optional(
            Type.Number({
              format: 'decimal',
              description: 'Slippage tolerance percentage actually applied to the swap',
            }),
          ),
          poolAddress: Type.Optional(
            Type.String({
              description:
                'Pool the swap executed against. Set by the pool-scoped routes ' +
                '(/trading/clmm, /trading/amm), which resolve exactly one pool; a router picks ' +
                'its own path across pools and leaves this unset. Without it a settled fill ' +
                'cannot be reconciled to a venue without refetching the transaction.',
            }),
          ),
        },
        { $id: 'ChainExecuteSwapResponseData' },
      ),
    ),
  },
  { $id: 'ChainExecuteSwapResponse' },
);
export type ChainExecuteSwapResponseType = Static<typeof ChainExecuteSwapResponseSchema>;

// ============================================
// Wrap / unwrap (shared by every chain with a wrapped native token)
// ============================================
// The per-chain schemas these replace differed only in EVM's `nonce`, so it is
// optional here and simply absent on chains that have no nonce.

export const WrapRequestSchema = Type.Object(
  {
    network: networkField(),
    address: Type.String({ description: 'Wallet address holding the native token' }),
    amount: Type.String({
      description: 'Amount of the native token to wrap, in whole units (not lamports/wei)',
      examples: ['1.0', '0.5'],
    }),
  },
  { $id: 'WrapRequest', additionalProperties: false },
);
export type WrapRequestType = Static<typeof WrapRequestSchema>;

export const UnwrapRequestSchema = Type.Object(
  {
    network: networkField(),
    address: Type.String({ description: 'Wallet address holding the wrapped token' }),
    amount: Type.Optional(
      Type.String({
        description:
          'Amount of the wrapped token to unwrap, in whole units. Solana unwraps the full balance when omitted; EVM chains require it.',
        examples: ['1.0', '0.5'],
      }),
    ),
  },
  { $id: 'UnwrapRequest', additionalProperties: false },
);
export type UnwrapRequestType = Static<typeof UnwrapRequestSchema>;

export const WrapResponseSchema = Type.Object(
  {
    signature: Type.String(),
    status: Type.Number({ description: 'TransactionStatus enum value' }),

    // Only included when status = CONFIRMED
    data: Type.Optional(
      Type.Object(
        {
          nonce: Type.Optional(Type.Number({ description: 'EVM transaction nonce; absent on non-EVM chains' })),
          fee: Type.String(),
          amount: Type.String(),
          wrappedAddress: Type.String(),
          nativeToken: Type.String(),
          wrappedToken: Type.String(),
        },
        { $id: 'ChainWrapResponseData' },
      ),
    ),
  },
  { $id: 'ChainWrapResponse' },
);
export type ChainWrapResponseType = Static<typeof WrapResponseSchema>;

/**
 * Router quote response: the shared swap-quote fields plus the two a router adds.
 *
 * `quoteId` is what makes /trading/router/execute-quote reachable — a quote whose
 * id is stripped in serialization can never be executed by id — so the router
 * surface cannot use the plain ChainQuoteSwapResponse.
 */
export const RouterQuoteSwapResponseSchema = Type.Composite(
  [
    ChainQuoteSwapResponseSchema,
    Type.Object({
      quoteId: Type.String({ description: 'Identifier to pass to /trading/router/execute-quote' }),
      approximation: Type.Optional(
        Type.Boolean({
          description:
            'True when a BUY was approximated via a sell-leg ExactIn quote because the router has no ExactOut route; amountOut is an estimate rather than exact',
        }),
      ),
    }),
  ],
  { $id: 'RouterQuoteSwapResponse' },
);
export type RouterQuoteSwapResponseType = Static<typeof RouterQuoteSwapResponseSchema>;
