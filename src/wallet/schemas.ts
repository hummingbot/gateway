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
  readOnlyWalletAddresses: Type.Optional(Type.Array(WalletAddressSchema)),
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

export const AddReadOnlyWalletRequestSchema = Type.Object({
  chain: Type.String(),
  address: WalletAddressSchema,
});

export const AddReadOnlyWalletResponseSchema = Type.Object({
  message: Type.String(),
  address: WalletAddressSchema,
});

export const RemoveReadOnlyWalletRequestSchema = Type.Object({
  chain: Type.String(),
  address: WalletAddressSchema,
});

export const RemoveReadOnlyWalletResponseSchema = Type.Object({
  message: Type.String(),
});

// Export TypeScript types
export type AddWalletRequest = Static<typeof AddWalletRequestSchema>;
export type AddWalletResponse = Static<typeof AddWalletResponseSchema>;
export type RemoveWalletRequest = Static<typeof RemoveWalletRequestSchema>;
export type SignMessageRequest = Static<typeof SignMessageRequestSchema>;
export type SignMessageResponse = Static<typeof SignMessageResponseSchema>;
export type GetWalletResponse = Static<typeof GetWalletResponseSchema>;
export type AddReadOnlyWalletRequest = Static<
  typeof AddReadOnlyWalletRequestSchema
>;
export type AddReadOnlyWalletResponse = Static<
  typeof AddReadOnlyWalletResponseSchema
>;
export type RemoveReadOnlyWalletRequest = Static<
  typeof RemoveReadOnlyWalletRequestSchema
>;
export type RemoveReadOnlyWalletResponse = Static<
  typeof RemoveReadOnlyWalletResponseSchema
>;
