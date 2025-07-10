import { Type, Static } from '@sinclair/typebox';

// Define schemas
export const WalletAddressSchema = Type.String({
  description: 'Wallet address (Ethereum format: 0x... or Solana format: base58)',
});

export const AddWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain to add wallet to',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  privateKey: Type.String({
    description: 'Private key for the wallet',
    examples: ['<your-private-key>'],
  }),
});

export const AddWalletResponseSchema = Type.Object({
  address: Type.String({
    description: 'The wallet address that was added',
  }),
});

export const GetWalletsQuerySchema = Type.Object({
  showHardware: Type.Optional(Type.Boolean({ default: true })),
  showReadOnly: Type.Optional(Type.Boolean({ default: true })),
});

export const GetWalletResponseSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain name',
    examples: ['solana', 'ethereum'],
  }),
  walletAddresses: Type.Array(WalletAddressSchema, {
    description: 'List of regular wallet addresses with private keys',
  }),
  readOnlyWalletAddresses: Type.Optional(
    Type.Array(WalletAddressSchema, {
      description: 'List of read-only wallet addresses (no private keys)',
    }),
  ),
  hardwareWalletAddresses: Type.Optional(
    Type.Array(WalletAddressSchema, {
      description: 'List of hardware wallet addresses (Ledger)',
    }),
  ),
});

export const RemoveWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain to remove wallet from',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  address: Type.String({
    description: 'Wallet address to remove',
  }),
});

export const RemoveWalletResponseSchema = Type.Object({
  message: Type.String({
    description: 'Success message indicating wallet type removed',
  }),
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
  chain: Type.String({
    description: 'Blockchain to add read-only wallet to',
    enum: ['ethereum', 'solana'],
    default: 'solana',
    examples: ['solana', 'ethereum'],
  }),
  address: Type.String({
    description: 'Wallet address to monitor (read-only)',
  }),
});

export const AddReadOnlyWalletResponseSchema = Type.Object({
  message: Type.String({
    description: 'Success message',
  }),
  address: Type.String({
    description: 'The wallet address that was added',
  }),
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
  chain: Type.String({
    description: 'Blockchain for hardware wallet',
    enum: ['ethereum', 'solana'],
    default: 'solana',
    examples: ['solana', 'ethereum'],
  }),
  address: Type.String({
    description: 'Hardware wallet address to add (must exist on connected Ledger device)',
  }),
});

export const AddHardwareWalletResponseSchema = Type.Object({
  address: Type.String({
    description: 'The hardware wallet address that was added',
  }),
  publicKey: Type.String({
    description: 'Public key of the hardware wallet',
  }),
  derivationPath: Type.String({
    description: 'BIP32/BIP44 derivation path used',
  }),
  message: Type.String({
    description: 'Success message',
  }),
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
  addedAt: Type.String(),
});

export const ListHardwareWalletsResponseSchema = Type.Object({
  chain: Type.String(),
  wallets: Type.Array(HardwareWalletInfoSchema),
});

// Export TypeScript types
export type GetWalletsQuery = Static<typeof GetWalletsQuerySchema>;
export type AddWalletRequest = Static<typeof AddWalletRequestSchema>;
export type AddWalletResponse = Static<typeof AddWalletResponseSchema>;
export type RemoveWalletRequest = Static<typeof RemoveWalletRequestSchema>;
export type RemoveWalletResponse = Static<typeof RemoveWalletResponseSchema>;
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
