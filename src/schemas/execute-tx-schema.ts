/**
 * Execute Transaction Schema
 * TypeBox schemas for the Ethereum execute-tx endpoint
 */

import { Type, Static } from '@sinclair/typebox';

// Ethereum execute-tx request schema
export const EthereumExecuteTxRequestSchema = Type.Object({
  network: Type.Optional(
    Type.String({
      description: 'Ethereum network (defaults to config defaultNetwork)',
      examples: ['mainnet', 'sepolia', 'polygon', 'arbitrum'],
    }),
  ),
  walletAddress: Type.Optional(
    Type.String({
      description: 'Wallet address to use (defaults to config defaultWallet)',
    }),
  ),
  // Option 1: Serialized transaction
  serializedTx: Type.Optional(
    Type.String({
      description: 'Hex encoded serialized transaction',
    }),
  ),
  // Option 2: Transaction parameters
  to: Type.Optional(
    Type.String({
      description: 'Destination address',
    }),
  ),
  data: Type.Optional(
    Type.String({
      description: 'Hex encoded calldata',
    }),
  ),
  value: Type.Optional(
    Type.String({
      description: 'Value in wei (as string for large numbers)',
      default: '0',
    }),
  ),
  // Gas options
  gasLimit: Type.Optional(
    Type.Number({
      description: 'Gas limit for the transaction',
      minimum: 21000,
    }),
  ),
  maxFeePerGas: Type.Optional(
    Type.Number({
      description: 'Max fee per gas in gwei (EIP-1559)',
    }),
  ),
  maxPriorityFeePerGas: Type.Optional(
    Type.Number({
      description: 'Max priority fee per gas in gwei (EIP-1559)',
    }),
  ),
  gasPrice: Type.Optional(
    Type.Number({
      description: 'Gas price in gwei (legacy transactions)',
    }),
  ),
  // Other options
  nonce: Type.Optional(
    Type.Number({
      description: 'Transaction nonce (defaults to current nonce)',
    }),
  ),
  skipSign: Type.Optional(
    Type.Boolean({
      description: 'Skip signing (transaction is already signed)',
      default: false,
    }),
  ),
});

// Execute-tx response schema (shared between chains)
export const ExecuteTxResponseSchema = Type.Object({
  signature: Type.String({
    description: 'Transaction hash/signature',
  }),
  status: Type.Number({
    description: 'Transaction status: 0=pending, 1=confirmed, -1=failed',
    enum: [-1, 0, 1],
  }),
  fee: Type.Optional(
    Type.Number({
      description: 'Transaction fee paid (in native token units)',
    }),
  ),
  error: Type.Optional(
    Type.String({
      description: 'Error message if transaction failed',
    }),
  ),
});

// Export TypeScript types
export type EthereumExecuteTxRequest = Static<typeof EthereumExecuteTxRequestSchema>;
export type ExecuteTxResponse = Static<typeof ExecuteTxResponseSchema>;
