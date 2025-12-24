import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

import { HardwareWalletService } from '../../../services/hardware-wallet-service';
import { logger } from '../../../services/logger';

import { SolanaSigner, SignerError, SignerErrorCode } from './types';

/**
 * Signer implementation for Ledger hardware wallets
 *
 * This wraps the existing HardwareWalletService for Ledger device communication.
 * Transactions are built locally and sent to the Ledger for signing.
 */
export class LedgerSigner implements SolanaSigner {
  readonly type = 'ledger' as const;
  readonly address: string;

  private readonly publicKey: PublicKey;
  private readonly derivationPath: string;
  private readonly hardwareWalletService: HardwareWalletService;

  constructor(address: string, derivationPath: string) {
    this.address = address;
    this.publicKey = new PublicKey(address);
    this.derivationPath = derivationPath;
    this.hardwareWalletService = HardwareWalletService.getInstance();
  }

  /**
   * Check if the Ledger device is connected and available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to get the app info to check if device is connected
      const isConnected = await this.hardwareWalletService.isDeviceConnected();
      return isConnected;
    } catch (error) {
      logger.warn(`[LedgerSigner] Device availability check failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Get the public key
   */
  getPublicKey(): PublicKey {
    return this.publicKey;
  }

  /**
   * Sign transactions using the Ledger device
   */
  async signTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    logger.info(`[LedgerSigner] Signing ${transactions.length} transaction(s) for ${this.address}`);

    try {
      for (const tx of transactions) {
        await this.signSingleTransaction(tx);
      }

      logger.info(`[LedgerSigner] Successfully signed ${transactions.length} transaction(s)`);
      return transactions;
    } catch (error) {
      const err = error as Error;
      logger.error(`[LedgerSigner] Failed to sign transactions: ${err.message}`);

      // Map specific error messages to SignerErrorCode
      if (err.message.includes('rejected by user') || err.message.includes('denied')) {
        throw new SignerError(SignerErrorCode.USER_REJECTED, 'Transaction rejected on Ledger device', err);
      } else if (err.message.includes('Timeout') || err.message.includes('timeout')) {
        throw new SignerError(SignerErrorCode.TIMEOUT, 'Transaction signing timed out', err);
      } else if (err.message.includes('locked') || err.message.includes('Locked')) {
        throw new SignerError(SignerErrorCode.DEVICE_LOCKED, 'Ledger device is locked', err);
      } else if (err.message.includes('not found') || err.message.includes('disconnected')) {
        throw new SignerError(SignerErrorCode.NOT_AVAILABLE, 'Ledger device not connected', err);
      }

      throw new SignerError(SignerErrorCode.SIGNING_FAILED, 'Failed to sign transaction with Ledger', err);
    }
  }

  /**
   * Sign a single transaction with Ledger
   */
  private async signSingleTransaction(transaction: Transaction | VersionedTransaction): Promise<void> {
    // Get signature from Ledger
    const signature = await this.hardwareWalletService.signSolanaTransaction(this.derivationPath, transaction, {
      timeout: 60000,
      displayMessage: `Please confirm the transaction on your Ledger device for address ${this.address}`,
    });

    // Add signature to transaction
    if (transaction instanceof VersionedTransaction) {
      // Convert Buffer to Uint8Array for VersionedTransaction
      const signatureArray = new Uint8Array(signature);
      transaction.addSignature(this.publicKey, signatureArray);
    } else {
      // For legacy Transaction
      if (!transaction.signatures) {
        transaction.signatures = [];
      }

      // Find the signer's index
      const signerIndex = transaction.signatures.findIndex((sig) => sig.publicKey.equals(this.publicKey));

      if (signerIndex >= 0) {
        transaction.signatures[signerIndex].signature = signature;
      } else {
        transaction.signatures.push({
          publicKey: this.publicKey,
          signature: signature,
        });
      }
    }
  }

  /**
   * Sign arbitrary messages with Ledger
   * Note: Not all Ledger apps support message signing
   */
  async signMessages(_messages: Uint8Array[]): Promise<never> {
    throw new SignerError(
      SignerErrorCode.SIGNING_FAILED,
      'Message signing is not supported by Ledger Solana app. Use signTransactions instead.',
    );
  }

  /**
   * Get the derivation path for this signer
   */
  getDerivationPath(): string {
    return this.derivationPath;
  }
}
