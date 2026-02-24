import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/**
 * Supported signer types in Gateway
 */
export type SignerType = 'keypair' | 'ledger' | 'aws-kms' | 'fireblocks' | 'turnkey' | 'vault';

/**
 * Error codes for signer operations
 * Modeled after @solana/keychain-core SignerErrorCode
 *
 * When @solana/keychain becomes available on npm, these codes should be
 * compatible for easy migration.
 */
export enum SignerErrorCode {
  // Key validation (matches keychain-core)
  INVALID_PRIVATE_KEY = 'SIGNER_INVALID_PRIVATE_KEY',
  INVALID_PUBLIC_KEY = 'SIGNER_INVALID_PUBLIC_KEY',

  // Operation failures (matches keychain-core)
  SIGNING_FAILED = 'SIGNER_SIGNING_FAILED',
  SERIALIZATION_ERROR = 'SIGNER_SERIALIZATION_ERROR',
  PARSING_ERROR = 'SIGNER_PARSING_ERROR',
  USER_REJECTED = 'SIGNER_USER_REJECTED',
  TIMEOUT = 'SIGNER_TIMEOUT',

  // Infrastructure issues (matches keychain-core)
  NOT_AVAILABLE = 'SIGNER_NOT_AVAILABLE',
  CONNECTION_ERROR = 'SIGNER_CONNECTION_ERROR',
  HTTP_ERROR = 'SIGNER_HTTP_ERROR',
  REMOTE_API_ERROR = 'SIGNER_REMOTE_API_ERROR',
  IO_ERROR = 'SIGNER_IO_ERROR',
  DEVICE_LOCKED = 'SIGNER_DEVICE_LOCKED',

  // Configuration (matches keychain-core)
  CONFIG_ERROR = 'SIGNER_CONFIG_ERROR',

  // Type checking (matches keychain-core)
  EXPECTED_SOLANA_SIGNER = 'SIGNER_EXPECTED_SOLANA_SIGNER',
}

/**
 * Context for signer errors (matches keychain-core pattern)
 */
export interface SignerErrorContext {
  message?: string;
  cause?: Error;
  address?: string;
  [key: string]: unknown;
}

/**
 * Custom error class for signer operations
 * Modeled after @solana/keychain-core SignerError
 */
export class SignerError extends Error {
  constructor(
    public readonly code: SignerErrorCode,
    messageOrContext: string | SignerErrorContext,
    public readonly cause?: Error,
  ) {
    const message =
      typeof messageOrContext === 'string' ? messageOrContext : messageOrContext.message || `Signer error: ${code}`;
    super(message);
    this.name = 'SignerError';
    if (typeof messageOrContext !== 'string' && messageOrContext.cause) {
      this.cause = messageOrContext.cause;
    }
  }
}

/**
 * Create a SignerError without throwing
 * Matches keychain-core createSignerError pattern
 */
export function createSignerError(code: SignerErrorCode, context?: SignerErrorContext): SignerError {
  return new SignerError(code, context || {});
}

/**
 * Throw a SignerError immediately
 * Matches keychain-core throwSignerError pattern
 */
export function throwSignerError(code: SignerErrorCode, context?: SignerErrorContext): never {
  throw createSignerError(code, context);
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

/**
 * Type guard to check if a value is a SolanaSigner
 * Matches keychain-core isSolanaSigner pattern
 */
export function isSolanaSigner(value: unknown): value is SolanaSigner {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const signer = value as Record<string, unknown>;
  return (
    typeof signer.address === 'string' &&
    typeof signer.type === 'string' &&
    typeof signer.isAvailable === 'function' &&
    typeof signer.getPublicKey === 'function' &&
    typeof signer.signTransactions === 'function'
  );
}

/**
 * Assert that a value is a SolanaSigner
 * Matches keychain-core assertIsSolanaSigner pattern
 */
export function assertIsSolanaSigner(value: unknown): asserts value is SolanaSigner {
  if (!isSolanaSigner(value)) {
    throwSignerError(SignerErrorCode.EXPECTED_SOLANA_SIGNER, {
      message: 'Expected a SolanaSigner but received something else',
    });
  }
}
