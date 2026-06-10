/**
 * Privy Solana Signer
 * Signs Solana transactions with a Privy wallet. Gateway builds and broadcasts
 * transactions itself; Privy only signs.
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

import { logger } from '../../services/logger';

import { getPrivyService, PrivyService } from './privy-service';

/**
 * Serialize a transaction's message (the signed payload) for round-trip comparison.
 */
function serializeMessage(tx: Transaction | VersionedTransaction): Uint8Array {
  if (tx instanceof VersionedTransaction) {
    return Uint8Array.from(tx.message.serialize());
  }
  return Uint8Array.from(tx.serializeMessage());
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export class PrivySolanaSigner {
  private privyService: PrivyService;
  private walletId: string;
  private _publicKey: PublicKey;

  constructor(walletId: string, address: string) {
    this.privyService = getPrivyService();
    this.walletId = walletId;
    this._publicKey = new PublicKey(address);
  }

  get publicKey(): PublicKey {
    return this._publicKey;
  }

  /**
   * Sign a transaction with the Privy wallet.
   *
   * The returned transaction is verified against the submitted one: the signed
   * message bytes must be identical and a signature for this wallet must be present,
   * so a manipulated response can never be broadcast.
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    logger.info(`Signing transaction with Privy wallet ${this.walletId}`);

    const serializedBytes =
      tx instanceof VersionedTransaction
        ? tx.serialize()
        : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const serialized = Buffer.from(serializedBytes as Uint8Array).toString('base64');

    const signedBase64 = await this.privyService.signSolanaTransaction(this.walletId, serialized);
    const signedBuffer = Uint8Array.from(Buffer.from(signedBase64, 'base64'));

    const signedTx =
      tx instanceof VersionedTransaction
        ? (VersionedTransaction.deserialize(signedBuffer) as T)
        : (Transaction.from(signedBuffer) as T);

    this.verifySignedTransaction(tx, signedTx);
    return signedTx;
  }

  /**
   * Round-trip verification: the signed transaction must encode the exact same
   * message Gateway submitted and carry a signature from this wallet.
   */
  private verifySignedTransaction(
    original: Transaction | VersionedTransaction,
    signed: Transaction | VersionedTransaction,
  ): void {
    if (!bytesEqual(serializeMessage(original), serializeMessage(signed))) {
      throw new Error('Privy returned a signed transaction that does not match the submitted transaction');
    }

    if (signed instanceof VersionedTransaction) {
      const signerKeys = signed.message.staticAccountKeys.slice(0, signed.message.header.numRequiredSignatures);
      const signerIndex = signerKeys.findIndex((key) => key.equals(this._publicKey));
      const signature = signerIndex >= 0 ? signed.signatures[signerIndex] : undefined;
      if (!signature || signature.every((byte) => byte === 0)) {
        throw new Error(`Privy did not sign the transaction for wallet ${this._publicKey.toBase58()}`);
      }
    } else {
      const signature = signed.signatures.find((sig) => sig.publicKey.equals(this._publicKey));
      if (!signature?.signature) {
        throw new Error(`Privy did not sign the transaction for wallet ${this._publicKey.toBase58()}`);
      }
    }
  }

  /**
   * Sign a message with the Privy wallet.
   * @returns Signature bytes
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    logger.info(`Signing message with Privy wallet ${this.walletId}`);
    const signature = await this.privyService.signMessage(this.walletId, message, 'solana');
    return Uint8Array.from(Buffer.from(signature, 'base64'));
  }
}
