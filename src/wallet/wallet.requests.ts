import { Type, Static } from '@sinclair/typebox';

// Request Schemas
export const AddWalletRequestSchema = Type.Object({
  chain: Type.String({ description: 'Chain name' }),
  network: Type.String({ description: 'Network name' }),
  privateKey: Type.String({ description: 'Private key for the wallet' }),
  address: Type.Optional(Type.String({ description: 'Wallet address' })),
  accountId: Type.Optional(Type.Number({ description: 'Account ID' }))
});

export const AddWalletResponseSchema = Type.Object({
  address: Type.String({ description: 'Wallet address' })
});

export const RemoveWalletRequestSchema = Type.Object({
  chain: Type.String({ description: 'Chain name' }),
  address: Type.String({ description: 'Wallet address' })
});

export const WalletSignRequestSchema = Type.Object({
  chain: Type.String({ description: 'Chain name' }),
  network: Type.String({ description: 'Network name' }),
  address: Type.String({ description: 'Wallet address' }),
  message: Type.String({ description: 'Message to sign' })
});

export const WalletSignResponseSchema = Type.Object({
  signature: Type.String({ description: 'Signature of the message' })
});

export const GetWalletResponseSchema = Type.Object({
  chain: Type.String({ description: 'Chain name' }),
  walletAddresses: Type.Array(Type.String(), { description: 'List of wallet addresses' })
});

// Type definitions using Static
export type AddWalletRequest = Static<typeof AddWalletRequestSchema>;
export type AddWalletResponse = Static<typeof AddWalletResponseSchema>;
export type RemoveWalletRequest = Static<typeof RemoveWalletRequestSchema>;
export type WalletSignRequest = Static<typeof WalletSignRequestSchema>;
export type WalletSignResponse = Static<typeof WalletSignResponseSchema>;
export type GetWalletResponse = Static<typeof GetWalletResponseSchema>;
