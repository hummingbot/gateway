import { Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';

import { HardwareWalletService } from '../../services/hardware-wallet-service';
import { logger } from '../../services/logger';
import { getHardwareWalletByAddress } from '../../wallet/utils';

export class SolanaLedger {
  private hardwareWalletService: HardwareWalletService;

  constructor() {
    this.hardwareWalletService = HardwareWalletService.getInstance();
  }

  /**
   * Sign a Solana transaction using Ledger hardware wallet
   * @param address The wallet address (public key)
   * @param transaction The transaction to sign
   * @returns The signed transaction
   */
  public async signTransaction(
    address: string,
    transaction: Transaction | VersionedTransaction,
  ): Promise<Transaction | VersionedTransaction> {
    logger.info(`Signing transaction with Ledger for address: ${address}`);

    // Get hardware wallet info to find derivation path
    const hardwareWallet = await getHardwareWalletByAddress('solana', address);

    if (!hardwareWallet) {
      throw new Error(`Hardware wallet not found for address: ${address}`);
    }

    try {
      // Get signature from Ledger
      const signature = await this.hardwareWalletService.signSolanaTransaction(
        hardwareWallet.derivationPath,
        transaction,
        {
          timeout: 60000,
          displayMessage: `Please confirm the transaction on your Ledger device for address ${address}`,
        },
      );

      // Add signature to transaction
      if (transaction instanceof VersionedTransaction) {
        // Convert Buffer to Uint8Array for VersionedTransaction
        const signatureArray = new Uint8Array(signature);
        transaction.addSignature(new PublicKey(address), signatureArray);
      } else {
        // For legacy Transaction
        const publicKey = new PublicKey(address);
        // signature is already a Buffer, no need to convert

        // Legacy transactions expect signatures in a specific format
        if (!transaction.signatures) {
          transaction.signatures = [];
        }

        // Find the signer's index
        const signerIndex = transaction.signatures.findIndex((sig) => sig.publicKey.equals(publicKey));

        if (signerIndex >= 0) {
          transaction.signatures[signerIndex].signature = signature;
        } else {
          transaction.signatures.push({
            publicKey,
            signature: signature,
          });
        }
      }

      logger.info('Transaction signed successfully with Ledger');
      return transaction;
    } catch (error) {
      logger.error(`Failed to sign transaction with Ledger: ${error.message}`);

      if (error.message.includes('rejected by user')) {
        throw new Error('Transaction rejected on Ledger device');
      } else if (error.message.includes('Timeout')) {
        throw new Error('Transaction signing timed out. Please try again.');
      }

      throw error;
    }
  }

  /**
   * Check if an address is a hardware wallet
   * @param address The wallet address to check
   * @returns True if the address is a hardware wallet
   */
  public async isHardwareWallet(address: string): Promise<boolean> {
    const wallet = await getHardwareWalletByAddress('solana', address);
    return wallet !== null;
  }

  /**
   * Get the derivation path for a hardware wallet address
   * @param address The wallet address
   * @returns The derivation path or null if not found
   */
  public async getDerivationPath(address: string): Promise<string | null> {
    const wallet = await getHardwareWalletByAddress('solana', address);
    return wallet ? wallet.derivationPath : null;
  }
}
