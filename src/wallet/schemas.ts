import { Type, Static } from '@sinclair/typebox';

// Define schemas
export const WalletAddressSchema = Type.String({
  description: 'Wallet address (Ethereum format: 0x... or Solana format: base58)',
});

export const AddWalletRequestSchema = Type.Object({
  chain: Type.String(),
  privateKey: Type.String(),
  network: Type.Optional(Type.String()),
  setDefault: Type.Optional(Type.Boolean()),
});

export const AddWalletResponseSchema = Type.Object({
  address: Type.String({
    description: 'The wallet address that was added',
  }),
});

export const GetWalletsQuerySchema = Type.Object({
  showHardware: Type.Optional(Type.Boolean({ default: true })),
});

export const GetWalletResponseSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain name',
    examples: ['solana', 'ethereum'],
  }),
  walletAddresses: Type.Array(WalletAddressSchema, {
    description: 'List of regular wallet addresses with private keys',
  }),
  hardwareWalletAddresses: Type.Optional(
    Type.Array(WalletAddressSchema, {
      description: 'List of hardware wallet addresses (Ledger)',
    }),
  ),
});

export const RemoveWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain to remove wallet from',
    enum: ['ethereum', 'solana', 'cardano'],
    examples: ['solana', 'ethereum', 'cardano'],
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
  setDefault: Type.Optional(
    Type.Boolean({
      description: 'Set this wallet as the default for the chain',
      default: false,
    }),
  ),
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

export const SetDefaultWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain to set default wallet for',
    enum: ['ethereum', 'solana', 'cardano'],
    examples: ['solana', 'ethereum', 'cardano'],
  }),
  address: Type.String({
    description: 'Wallet address to set as default',
  }),
});

export const SetDefaultWalletResponseSchema = Type.Object({
  message: Type.String({
    description: 'Success message',
  }),
  chain: Type.String({
    description: 'Chain name',
  }),
  address: Type.String({
    description: 'Default wallet address',
  }),
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
export type AddHardwareWalletRequest = Static<typeof AddHardwareWalletRequestSchema>;
export type AddHardwareWalletResponse = Static<typeof AddHardwareWalletResponseSchema>;
export type RemoveHardwareWalletRequest = Static<typeof RemoveHardwareWalletRequestSchema>;
export type RemoveHardwareWalletResponse = Static<typeof RemoveHardwareWalletResponseSchema>;
export type ListHardwareWalletsRequest = Static<typeof ListHardwareWalletsRequestSchema>;
export type ListHardwareWalletsResponse = Static<typeof ListHardwareWalletsResponseSchema>;
export type HardwareWalletInfo = Static<typeof HardwareWalletInfoSchema>;
export type SetDefaultWalletRequest = Static<typeof SetDefaultWalletRequestSchema>;
export type SetDefaultWalletResponse = Static<typeof SetDefaultWalletResponseSchema>;
