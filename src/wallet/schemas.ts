import { Type, Static } from '@sinclair/typebox';

// Define schemas
export const WalletAddressSchema = Type.String();

export const AddWalletRequestSchema = Type.Object({
  chain: Type.String(),
  privateKey: Type.String(),
});

export const AddWalletResponseSchema = Type.Object({
  address: WalletAddressSchema,
});

export const GetWalletResponseSchema = Type.Object({
  chain: Type.String(),
  walletAddresses: Type.Array(WalletAddressSchema),
});

export const RemoveWalletRequestSchema = Type.Object({
  chain: Type.String(),
  address: WalletAddressSchema,
});

export const SignMessageRequestSchema = Type.Object({
  chain: Type.String(),
  network: Type.String(),
  address: WalletAddressSchema,
  message: Type.String(),
});

export const SignMessageResponseSchema = Type.Object({
  signature: Type.String(),
});

// Export TypeScript types
export type AddWalletRequest = Static<typeof AddWalletRequestSchema>;
export type AddWalletResponse = Static<typeof AddWalletResponseSchema>;
export type RemoveWalletRequest = Static<typeof RemoveWalletRequestSchema>;
export type SignMessageRequest = Static<typeof SignMessageRequestSchema>;
export type SignMessageResponse = Static<typeof SignMessageResponseSchema>;
export type GetWalletResponse = Static<typeof GetWalletResponseSchema>;
