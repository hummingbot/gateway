import { Type, Static } from '@sinclair/typebox';

import { getSolanaChainConfig, networks as SolanaNetworks } from './solana.config';

// Get chain config for defaults
const solanaChainConfig = getSolanaChainConfig();

// Example values
const EXAMPLE_SIGNATURE = '55ukR6VCt1sQFMC8Nyeo51R1SMaTzUC7jikmkEJ2jjkQNdqBxXHraH7vaoaNmf8rX4Y55EXAj8XXoyzvvsrQqWZa';
const EXAMPLE_TOKENS = ['SOL', 'USDC', 'BONK'];
const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BONK_MINT_ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

// Network parameter with proper defaults and enum
export const SolanaNetworkParameter = Type.Optional(
  Type.String({
    description: 'The Solana network to use',
    default: solanaChainConfig.defaultNetwork,
    enum: SolanaNetworks,
  }),
);

// Address parameter with proper defaults
export const SolanaAddressParameter = Type.Optional(
  Type.String({
    description: 'Solana wallet address',
    default: solanaChainConfig.defaultWallet,
  }),
);

// Status request schema
export const SolanaStatusRequest = Type.Object({
  network: SolanaNetworkParameter,
});

// Balance request schema
export const SolanaBalanceRequest = Type.Object({
  network: SolanaNetworkParameter,
  address: SolanaAddressParameter,
  tokens: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "A list of token symbols (SOL, USDC, BONK) from the network's token list. Only tokens in the token list will be returned. An empty array is treated the same as if the parameter was not provided, returning only non-zero balances (with the exception of SOL).",
      examples: [EXAMPLE_TOKENS],
    }),
  ),
});

// Estimate gas request schema
export const SolanaEstimateGasRequest = Type.Object({
  network: SolanaNetworkParameter,
});

// Poll request schema
export const SolanaPollRequest = Type.Object({
  network: SolanaNetworkParameter,
  signature: Type.String({
    description: 'Transaction signature to poll',
    examples: [EXAMPLE_SIGNATURE],
  }),
  tokens: Type.Optional(
    Type.Array(Type.String(), {
      description: 'Tokens to track balance changes for',
      examples: [EXAMPLE_TOKENS],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address to track balance changes for',
      default: solanaChainConfig.defaultWallet,
    }),
  ),
});

// Quote swap request schema
export const SolanaQuoteSwapRequest = Type.Object({
  network: SolanaNetworkParameter,
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: ['SOL'],
  }),
  quoteToken: Type.String({
    description: 'The other token in the pair',
    examples: ['USDC'],
  }),
  amount: Type.Number({
    description: 'Amount of base token to trade',
    examples: [1],
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
      default: 1,
    }),
  ),
});

// Execute swap request schema
export const SolanaExecuteSwapRequest = Type.Object({
  network: SolanaNetworkParameter,
  walletAddress: SolanaAddressParameter,
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: ['SOL'],
  }),
  quoteToken: Type.String({
    description: 'The other token in the pair',
    examples: ['USDC'],
  }),
  amount: Type.Number({
    description: 'Amount of base token to trade',
    examples: [1],
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
      default: 1,
    }),
  ),
});

// Wrap request schema
export const WrapRequestSchema = Type.Object({
  network: SolanaNetworkParameter,
  address: SolanaAddressParameter,
  amount: Type.String({
    description: 'The amount of SOL to wrap (in SOL, not lamports)',
    examples: ['1.0', '0.5'],
  }),
});

// Wrap response schema
export const WrapResponseSchema = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),

  // Only included when status = CONFIRMED
  data: Type.Optional(
    Type.Object({
      fee: Type.String(),
      amount: Type.String(),
      wrappedAddress: Type.String(),
      nativeToken: Type.String(),
      wrappedToken: Type.String(),
    }),
  ),
});

// Unwrap request schema
export const UnwrapRequestSchema = Type.Object({
  network: SolanaNetworkParameter,
  address: SolanaAddressParameter,
  amount: Type.Optional(
    Type.String({
      description: 'The amount of WSOL to unwrap (in SOL, not lamports). If not provided, unwraps all WSOL.',
      examples: ['1.0', '0.5'],
    }),
  ),
});

// Unwrap response schema
export const UnwrapResponseSchema = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),

  // Only included when status = CONFIRMED
  data: Type.Optional(
    Type.Object({
      fee: Type.String(),
      amount: Type.String(),
      wrappedAddress: Type.String(),
      nativeToken: Type.String(),
      wrappedToken: Type.String(),
    }),
  ),
});

// Type exports
export type SolanaQuoteSwapRequestType = Static<typeof SolanaQuoteSwapRequest>;
export type SolanaExecuteSwapRequestType = Static<typeof SolanaExecuteSwapRequest>;
export type WrapRequestType = Static<typeof WrapRequestSchema>;
export type WrapResponseType = Static<typeof WrapResponseSchema>;
export type UnwrapRequestType = Static<typeof UnwrapRequestSchema>;
export type UnwrapResponseType = Static<typeof UnwrapResponseSchema>;
