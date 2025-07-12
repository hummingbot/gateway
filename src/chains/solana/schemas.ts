import { Type } from '@sinclair/typebox';

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
        'A list of token symbols (SOL, USDC, BONK) or token mint addresses. Both formats are accepted and will be automatically detected. An empty array is treated the same as if the parameter was not provided, returning only non-zero balances (with the exception of SOL).',
      examples: [EXAMPLE_TOKENS, ['SOL', USDC_MINT_ADDRESS, BONK_MINT_ADDRESS]],
    }),
  ),
  fetchAll: Type.Optional(
    Type.Boolean({
      description: 'Whether to fetch all tokens in wallet, not just those in token list',
      default: false,
    }),
  ),
});

// Estimate gas request schema
export const SolanaEstimateGasRequest = Type.Object({
  network: SolanaNetworkParameter,
  gasLimit: Type.Optional(
    Type.Number({
      description: 'Gas limit for the transaction',
      examples: [200000],
    }),
  ),
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
