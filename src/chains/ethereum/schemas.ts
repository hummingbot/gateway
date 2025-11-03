import { Type, Static } from '@sinclair/typebox';

import { getEthereumChainConfig, networks as EthereumNetworks } from './ethereum.config';

// Get chain config for defaults
const ethereumChainConfig = getEthereumChainConfig();

// Example values
const EXAMPLE_TX_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const EXAMPLE_BALANCE_TOKENS = ['ETH', 'USDC', 'WETH'];
const EXAMPLE_ALLOWANCE_TOKENS = ['USDC', 'WETH'];
const EXAMPLE_AMOUNT = '0.01';
const EXAMPLE_SPENDER = 'uniswap/router';

// Network parameter with proper defaults and enum
export const EthereumNetworkParameter = Type.Optional(
  Type.String({
    description: 'The Ethereum network to use',
    default: ethereumChainConfig.defaultNetwork,
    enum: EthereumNetworks,
  }),
);

// Address parameter with proper defaults
export const EthereumAddressParameter = Type.Optional(
  Type.String({
    description: 'Ethereum wallet address',
    default: ethereumChainConfig.defaultWallet,
  }),
);

// Status request schema
export const EthereumStatusRequest = Type.Object({
  network: EthereumNetworkParameter,
});

// Balance request schema
export const EthereumBalanceRequest = Type.Object({
  network: EthereumNetworkParameter,
  address: EthereumAddressParameter,
  tokens: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'A list of token symbols (ETH, USDC, WETH) or token addresses. Both formats are accepted and will be automatically detected. An empty array is treated the same as if the parameter was not provided, returning only non-zero balances (with the exception of ETH).',
      examples: [EXAMPLE_BALANCE_TOKENS],
    }),
  ),
});

// Estimate gas request schema
export const EthereumEstimateGasRequest = Type.Object({
  network: EthereumNetworkParameter,
});

// Poll request schema - map signature to txHash for Ethereum
export const EthereumPollRequest = Type.Object({
  network: EthereumNetworkParameter,
  signature: Type.String({
    description: 'Transaction hash to poll',
    examples: [EXAMPLE_TX_HASH],
  }),
});

// Allowances request schema (multiple tokens)
export const AllowancesRequestSchema = Type.Object({
  network: EthereumNetworkParameter,
  address: EthereumAddressParameter,
  spender: Type.String({
    description: 'Connector name (e.g., uniswap/clmm, uniswap/amm, 0x/router) or contract address',
    examples: [EXAMPLE_SPENDER],
  }),
  tokens: Type.Array(Type.String(), {
    description: 'Array of token symbols or addresses',
    examples: [EXAMPLE_ALLOWANCE_TOKENS],
  }),
});

// Allowances response schema
export const AllowancesResponseSchema = Type.Object({
  spender: Type.String(),
  approvals: Type.Record(Type.String(), Type.String()),
});

// Approve request schema
export const ApproveRequestSchema = Type.Object({
  network: EthereumNetworkParameter,
  address: EthereumAddressParameter,
  spender: Type.String({
    description: 'Connector name (e.g., uniswap/clmm, uniswap/amm, 0x/router) contract address',
    examples: [EXAMPLE_SPENDER],
  }),
  token: Type.String({
    description: 'Token symbol or address',
    examples: [EXAMPLE_ALLOWANCE_TOKENS[0]],
  }),
  amount: Type.Optional(
    Type.String({
      description: 'The amount to approve. If not provided, defaults to maximum amount (unlimited approval).',
      default: '',
    }),
  ),
});

// Approve response schema
export const ApproveResponseSchema = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),

  // Only included when status = CONFIRMED
  data: Type.Optional(
    Type.Object({
      tokenAddress: Type.String(),
      spender: Type.String(),
      amount: Type.String(),
      nonce: Type.Number(),
      fee: Type.String(),
    }),
  ),
});

// Wrap request schema
export const WrapRequestSchema = Type.Object({
  network: EthereumNetworkParameter,
  address: EthereumAddressParameter,
  amount: Type.String({
    description: 'The amount of native token to wrap (e.g., ETH, BNB, AVAX)',
    examples: [EXAMPLE_AMOUNT],
  }),
});

// Wrap response schema
export const WrapResponseSchema = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),

  // Only included when status = CONFIRMED
  data: Type.Optional(
    Type.Object({
      nonce: Type.Number(),
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
  network: EthereumNetworkParameter,
  address: EthereumAddressParameter,
  amount: Type.String({
    description: 'The amount of wrapped token to unwrap (e.g., WETH, WBNB, WAVAX)',
    examples: [EXAMPLE_AMOUNT],
  }),
});

// Unwrap response schema
export const UnwrapResponseSchema = Type.Object({
  signature: Type.String(),
  status: Type.Number({ description: 'TransactionStatus enum value' }),

  // Only included when status = CONFIRMED
  data: Type.Optional(
    Type.Object({
      nonce: Type.Number(),
      fee: Type.String(),
      amount: Type.String(),
      wrappedAddress: Type.String(),
      nativeToken: Type.String(),
      wrappedToken: Type.String(),
    }),
  ),
});

// Quote swap request schema
export const EthereumQuoteSwapRequest = Type.Object({
  network: EthereumNetworkParameter,
  walletAddress: EthereumAddressParameter,
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: ['ETH'],
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
export const EthereumExecuteSwapRequest = Type.Object({
  network: EthereumNetworkParameter,
  walletAddress: EthereumAddressParameter,
  baseToken: Type.String({
    description: 'Token to determine swap direction',
    examples: ['ETH'],
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

// Type exports
export type AllowancesRequestType = Static<typeof AllowancesRequestSchema>;
export type AllowancesResponseType = Static<typeof AllowancesResponseSchema>;
export type ApproveRequestType = Static<typeof ApproveRequestSchema>;
export type ApproveResponseType = Static<typeof ApproveResponseSchema>;
export type WrapRequestType = Static<typeof WrapRequestSchema>;
export type WrapResponseType = Static<typeof WrapResponseSchema>;
export type UnwrapRequestType = Static<typeof UnwrapRequestSchema>;
export type UnwrapResponseType = Static<typeof UnwrapResponseSchema>;
export type EthereumQuoteSwapRequestType = Static<typeof EthereumQuoteSwapRequest>;
export type EthereumExecuteSwapRequestType = Static<typeof EthereumExecuteSwapRequest>;
