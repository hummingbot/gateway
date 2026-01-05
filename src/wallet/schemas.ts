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
  setDefault: Type.Optional(
    Type.Boolean({
      description: 'Set this wallet as the default for the chain',
      default: false,
    }),
  ),
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
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
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

// Create wallet schemas
export const CreateWalletRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain to create wallet for',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  setDefault: Type.Optional(
    Type.Boolean({
      description: 'Set this wallet as the default for the chain',
      default: false,
    }),
  ),
});

export const CreateWalletResponseSchema = Type.Object({
  address: Type.String({
    description: 'The wallet address that was created',
  }),
  chain: Type.String({
    description: 'Blockchain name',
  }),
});

// Show private key schemas
export const ShowPrivateKeyRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain of the wallet',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  address: Type.String({
    description: 'Wallet address to get private key for',
  }),
  passphrase: Type.String({
    description: 'Gateway passphrase for decryption (required for security)',
  }),
});

export const ShowPrivateKeyResponseSchema = Type.Object({
  address: Type.String({
    description: 'The wallet address',
  }),
  chain: Type.String({
    description: 'Blockchain name',
  }),
  privateKey: Type.String({
    description: 'The decrypted private key',
  }),
});

// Send transaction schemas
export const SendTransactionRequestSchema = Type.Object({
  chain: Type.String({
    description: 'Blockchain to send transaction on',
    enum: ['ethereum', 'solana'],
    examples: ['solana', 'ethereum'],
  }),
  network: Type.String({
    description: 'Network to use',
    examples: ['mainnet', 'mainnet-beta'],
  }),
  address: Type.String({
    description: 'Sender wallet address',
  }),
  toAddress: Type.String({
    description: 'Recipient wallet address',
  }),
  amount: Type.String({
    description: 'Amount to send (in human-readable format)',
  }),
  token: Type.Optional(
    Type.String({
      description: 'Token symbol or address (omit for native token)',
    }),
  ),
});

export const SendTransactionResponseSchema = Type.Object({
  signature: Type.String({
    description: 'Transaction signature/hash',
  }),
  status: Type.Number({
    description: 'Transaction status: 1 = confirmed, 0 = pending, -1 = failed',
  }),
  amount: Type.String({
    description: 'Amount sent',
  }),
  token: Type.String({
    description: 'Token sent (symbol or native)',
  }),
  toAddress: Type.String({
    description: 'Recipient address',
  }),
  fee: Type.Optional(
    Type.Number({
      description: 'Transaction fee',
    }),
  ),
});

export type CreateWalletRequest = Static<typeof CreateWalletRequestSchema>;
export type CreateWalletResponse = Static<typeof CreateWalletResponseSchema>;
export type ShowPrivateKeyRequest = Static<typeof ShowPrivateKeyRequestSchema>;
export type ShowPrivateKeyResponse = Static<typeof ShowPrivateKeyResponseSchema>;
export type SendTransactionRequest = Static<typeof SendTransactionRequestSchema>;
export type SendTransactionResponse = Static<typeof SendTransactionResponseSchema>;
