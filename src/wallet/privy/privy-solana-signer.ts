/**
 * Privy Solana Signer
 * Provides transaction signing capabilities using Privy server wallets
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import { logger } from '../../services/logger';

import { getPrivyClient, PrivyClient } from './privy-client';

/**
 * Solana transaction signer that uses Privy server wallets
 */
export class PrivySolanaSigner {
  private privyClient: PrivyClient;
  private walletId: string;
  private _publicKey: PublicKey;

  constructor(walletId: string, address: string) {
    this.privyClient = getPrivyClient();
    this.walletId = walletId;
    this._publicKey = new PublicKey(address);
  }

  /**
   * Get the public key for this signer
   */
  get publicKey(): PublicKey {
    return this._publicKey;
  }

  /**
   * Sign a transaction using Privy
   * @param tx Transaction or VersionedTransaction to sign
   * @returns Signed transaction
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    logger.info(`Signing transaction with Privy wallet ${this.walletId}`);

    // Serialize the transaction to base64
    const serializedBytes = tx.serialize({ requireAllSignatures: false });
    const serialized = Buffer.from(serializedBytes as Uint8Array).toString('base64');

    // Sign via Privy
    const signedBase64 = await this.privyClient.signSolanaTransaction(this.walletId, serialized);

    // Deserialize the signed transaction
    const signedBuffer = Uint8Array.from(Buffer.from(signedBase64, 'base64'));

    if (tx instanceof VersionedTransaction) {
      return VersionedTransaction.deserialize(signedBuffer) as T;
    } else {
      return Transaction.from(signedBuffer) as T;
    }
  }

  /**
   * Sign and send a transaction using Privy
   * @param tx Transaction or VersionedTransaction to sign and send
   * @returns Transaction signature
   */
  async signAndSendTransaction(tx: Transaction | VersionedTransaction): Promise<string> {
    logger.info(`Signing and sending transaction with Privy wallet ${this.walletId}`);

    // Serialize the transaction to base64
    const serializedBytes = tx.serialize({ requireAllSignatures: false });
    const serialized = Buffer.from(serializedBytes as Uint8Array).toString('base64');

    // Sign and send via Privy
    const signature = await this.privyClient.signAndSendSolanaTransaction(this.walletId, serialized);

    logger.info(`Transaction sent via Privy: ${signature}`);
    return signature;
  }

  /**
   * Sign a message using Privy
   * @param message Message bytes to sign
   * @returns Signature bytes
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    logger.info(`Signing message with Privy wallet ${this.walletId}`);

    // Convert message to base58 for Solana
    const messageBase58 = bs58.encode(message);

    const signature = await this.privyClient.signMessage(this.walletId, messageBase58, 'solana');

    // Decode signature from base58
    return Uint8Array.from(bs58.decode(signature));
  }
}
