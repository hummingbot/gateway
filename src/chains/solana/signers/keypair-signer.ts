import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import { logger } from '../../../services/logger';

import { SolanaSigner, SignerError, SignerErrorCode, SignatureResult } from './types';

/**
 * Signer implementation for Solana Keypair-based wallets (hot wallets)
 *
 * This wraps the standard Solana Keypair for signing transactions.
 * The keypair is typically loaded from an encrypted wallet file.
 */
export class KeypairSigner implements SolanaSigner {
  readonly type = 'keypair' as const;
  readonly address: string;

  private readonly keypair: Keypair;

  constructor(keypair: Keypair) {
    this.keypair = keypair;
    this.address = keypair.publicKey.toBase58();
  }

  /**
   * Create a KeypairSigner from a base58-encoded private key
   */
  static fromPrivateKey(privateKeyBase58: string): KeypairSigner {
    try {
      const secretKey = new Uint8Array(bs58.decode(privateKeyBase58));
      const keypair = Keypair.fromSecretKey(secretKey);
      return new KeypairSigner(keypair);
    } catch (error) {
      throw new SignerError(
        SignerErrorCode.INVALID_PRIVATE_KEY,
        'Failed to create keypair from private key',
        error as Error,
      );
    }
  }

  /**
   * Create a KeypairSigner from a secret key (Uint8Array)
   */
  static fromSecretKey(secretKey: Uint8Array): KeypairSigner {
    try {
      const keypair = Keypair.fromSecretKey(secretKey);
      return new KeypairSigner(keypair);
    } catch (error) {
      throw new SignerError(
        SignerErrorCode.INVALID_PRIVATE_KEY,
        'Failed to create keypair from secret key',
        error as Error,
      );
    }
  }

  /**
   * Keypair signers are always available (the key is in memory)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Get the public key
   */
  getPublicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  /**
   * Sign transactions using the keypair
   */
  async signTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    logger.debug(`[KeypairSigner] Signing ${transactions.length} transaction(s) for ${this.address}`);

    try {
      for (const tx of transactions) {
        if (tx instanceof VersionedTransaction) {
          tx.sign([this.keypair]);
        } else {
          (tx as Transaction).sign(this.keypair);
        }
      }

      logger.debug(`[KeypairSigner] Successfully signed ${transactions.length} transaction(s)`);
      return transactions;
    } catch (error) {
      logger.error(`[KeypairSigner] Failed to sign transactions: ${(error as Error).message}`);
      throw new SignerError(SignerErrorCode.SIGNING_FAILED, 'Failed to sign transactions', error as Error);
    }
  }

  /**
   * Sign arbitrary messages using Ed25519
   * Uses Node.js crypto module for Ed25519 signing
   */
  async signMessages(messages: Uint8Array[]): Promise<SignatureResult[]> {
    logger.debug(`[KeypairSigner] Signing ${messages.length} message(s) for ${this.address}`);

    try {
      const crypto = await import('crypto');
      const results: SignatureResult[] = [];

      for (const message of messages) {
        // Create Ed25519 private key from the keypair's secret key
        // The secret key is 64 bytes: first 32 are the seed, last 32 are the public key
        const derPrefix = new Uint8Array(Buffer.from('302e020100300506032b657004220420', 'hex'));
        const seed = new Uint8Array(this.keypair.secretKey.slice(0, 32));
        const privateKeyDer = new Uint8Array(derPrefix.length + seed.length);
        privateKeyDer.set(derPrefix);
        privateKeyDer.set(seed, derPrefix.length);

        const privateKey = crypto.createPrivateKey({
          key: Buffer.from(privateKeyDer),
          format: 'der',
          type: 'pkcs8',
        });

        const signatureBuffer = crypto.sign(null, new Uint8Array(message), privateKey);
        const signatureBytes = new Uint8Array(signatureBuffer);

        results.push({
          signature: bs58.encode(signatureBytes),
          signatureBytes,
        });
      }

      logger.debug(`[KeypairSigner] Successfully signed ${messages.length} message(s)`);
      return results;
    } catch (error) {
      logger.error(`[KeypairSigner] Failed to sign messages: ${(error as Error).message}`);
      throw new SignerError(SignerErrorCode.SIGNING_FAILED, 'Failed to sign messages', error as Error);
    }
  }

  /**
   * Get the underlying keypair (for compatibility with existing code)
   * @deprecated Use signTransactions instead
   */
  getKeypair(): Keypair {
    return this.keypair;
  }
}
