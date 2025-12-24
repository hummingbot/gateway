import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/**
 * Supported signer types in Gateway
 */
export type SignerType = 'keypair' | 'ledger' | 'aws-kms' | 'fireblocks' | 'turnkey' | 'vault';

/**
 * Error codes for signer operations
 * Modeled after @solana/keychain-core SignerErrorCode
 */
export enum SignerErrorCode {
  // Key validation
  INVALID_PRIVATE_KEY = 'INVALID_PRIVATE_KEY',
  INVALID_PUBLIC_KEY = 'INVALID_PUBLIC_KEY',

  // Operation failures
  SIGNING_FAILED = 'SIGNING_FAILED',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  USER_REJECTED = 'USER_REJECTED',
  TIMEOUT = 'TIMEOUT',

  // Infrastructure issues
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  DEVICE_LOCKED = 'DEVICE_LOCKED',

  // Configuration
  CONFIG_ERROR = 'CONFIG_ERROR',
}

/**
 * Custom error class for signer operations
 */
export class SignerError extends Error {
  constructor(
    public readonly code: SignerErrorCode,
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'SignerError';
  }
}

/**
 * Result of a signing operation
 * Contains the signature bytes for each transaction
 */
export interface SignatureResult {
  /** Base58-encoded signature */
  signature: string;
  /** Raw signature bytes (64 bytes for Ed25519) */
  signatureBytes: Uint8Array;
}

/**
 * Core signer interface for Solana transactions
 *
 * This interface is inspired by @solana/keychain-core's SolanaSigner
 * but adapted for Gateway's specific needs (server-side, transaction-focused).
 *
 * Implementations:
 * - KeypairSigner: For encrypted file-based wallets (hot wallets)
 * - LedgerSigner: For Ledger hardware wallets
 * - AwsKmsSigner: For AWS Key Management Service (future)
 * - FireblocksSigner: For Fireblocks custody (future)
 */
export interface SolanaSigner {
  /** The type of signer (for logging and debugging) */
  readonly type: SignerType;

  /** The public key address of the signer (base58-encoded) */
  readonly address: string;

  /**
   * Check if the signer is available and ready to sign
   * For hardware wallets, this checks device connectivity
   * For KMS, this validates credentials and key availability
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the public key as a Solana PublicKey object
   */
  getPublicKey(): PublicKey;

  /**
   * Sign one or more transactions
   * Returns the signed transactions (mutates in place for efficiency)
   *
   * @param transactions - Array of transactions to sign
   * @returns The same transactions, now signed
   */
  signTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;

  /**
   * Sign arbitrary messages (for authentication, etc.)
   * Not all signers support this (e.g., some custody solutions restrict to transactions)
   *
   * @param messages - Array of message bytes to sign
   * @returns Array of signatures
   */
  signMessages?(messages: Uint8Array[]): Promise<SignatureResult[]>;
}

/**
 * Configuration for creating a signer
 */
export interface SignerConfig {
  type: SignerType;
  address: string;

  // Type-specific configuration
  /** For keypair signers: the encrypted private key file path */
  keyFilePath?: string;

  /** For ledger signers: BIP44 derivation path */
  derivationPath?: string;

  /** For AWS KMS signers: the KMS key ID or ARN */
  awsKeyId?: string;
  awsRegion?: string;

  /** For Fireblocks signers: vault account ID */
  fireblocksVaultId?: string;
  fireblocksAssetId?: string;
}

/**
 * Wallet info stored in Gateway's wallet registry
 */
export interface WalletInfo {
  type: SignerType;
  address: string;

  // For hardware wallets
  derivationPath?: string;

  // For KMS/custody
  keyId?: string;
  vaultId?: string;
  region?: string;
}
