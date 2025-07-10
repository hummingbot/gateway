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
  hardwareWalletAddresses: Type.Optional(Type.Array(WalletAddressSchema)),
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

// Hardware wallet schemas
export const AddHardwareWalletRequestSchema = Type.Object({
  chain: Type.String(),
  address: WalletAddressSchema,
  accountIndex: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  name: Type.Optional(Type.String()),
});

export const AddHardwareWalletResponseSchema = Type.Object({
  address: WalletAddressSchema,
  publicKey: Type.String(),
  derivationPath: Type.String(),
  name: Type.Optional(Type.String()),
  message: Type.String(),
});

export const RemoveHardwareWalletRequestSchema = Type.Object({
  chain: Type.String(),
  address: WalletAddressSchema,
});

export const RemoveHardwareWalletResponseSchema = Type.Object({
  message: Type.String(),
});

export const ListHardwareWalletsRequestSchema = Type.Object({
  chain: Type.String(),
});

export const HardwareWalletInfoSchema = Type.Object({
  address: WalletAddressSchema,
  publicKey: Type.String(),
  derivationPath: Type.String(),
  name: Type.Optional(Type.String()),
  addedAt: Type.String(),
});

export const ListHardwareWalletsResponseSchema = Type.Object({
  chain: Type.String(),
  wallets: Type.Array(HardwareWalletInfoSchema),
});

// Export TypeScript types
export type AddWalletRequest = Static<typeof AddWalletRequestSchema>;
export type AddWalletResponse = Static<typeof AddWalletResponseSchema>;
export type RemoveWalletRequest = Static<typeof RemoveWalletRequestSchema>;
export type SignMessageRequest = Static<typeof SignMessageRequestSchema>;
export type SignMessageResponse = Static<typeof SignMessageResponseSchema>;
export type GetWalletResponse = Static<typeof GetWalletResponseSchema>;
export type AddReadOnlyWalletRequest = Static<typeof AddReadOnlyWalletRequestSchema>;
export type AddReadOnlyWalletResponse = Static<typeof AddReadOnlyWalletResponseSchema>;
export type RemoveReadOnlyWalletRequest = Static<typeof RemoveReadOnlyWalletRequestSchema>;
export type RemoveReadOnlyWalletResponse = Static<typeof RemoveReadOnlyWalletResponseSchema>;
export type AddHardwareWalletRequest = Static<typeof AddHardwareWalletRequestSchema>;
export type AddHardwareWalletResponse = Static<typeof AddHardwareWalletResponseSchema>;
export type RemoveHardwareWalletRequest = Static<typeof RemoveHardwareWalletRequestSchema>;
export type RemoveHardwareWalletResponse = Static<typeof RemoveHardwareWalletResponseSchema>;
export type ListHardwareWalletsRequest = Static<typeof ListHardwareWalletsRequestSchema>;
export type ListHardwareWalletsResponse = Static<typeof ListHardwareWalletsResponseSchema>;
export type HardwareWalletInfo = Static<typeof HardwareWalletInfoSchema>;
