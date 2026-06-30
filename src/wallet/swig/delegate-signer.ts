/**
 * Swig delegate signer — the pluggable custody seam.
 *
 * A Swig wallet is a PDA with no key; transactions are signed by the wallet's *delegate
 * authority* (a normal Ed25519 key on the Swig role) after the inner instructions are
 * wrapped (see swig-signer.ts). This module abstracts WHERE that delegate key lives, so
 * the wrap/rebuild logic is identical regardless of backend:
 *
 *   - `local` — the key is decrypted from Gateway's keystore and signs in-process. Simple,
 *     but the raw key is on the host. Fine for development.
 *   - `kms`   — the key lives in a cloud KMS/HSM (e.g. AWS KMS, GCP KMS) and never leaves
 *     it; Gateway holds only the credentials to *request* a signature. This is the
 *     production "no raw key on the host" custody mode. It is a documented seam here, not
 *     yet implemented — add a backend that implements SwigDelegateSigner.sign() by calling
 *     your KMS, and wire it into Solana.rebuildAndSignSwigTransaction.
 *
 * The Swig program does not care how the authority signature is produced, only that it is
 * a valid signature for the role — so swapping backends is purely a custody decision.
 */

import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';

/** Which backend holds the Swig delegate's signing key. */
export type DelegateSignerType = 'local' | 'kms';

/**
 * Produces the delegate authority's signature over a compiled transaction. Implementations
 * add their signature to the fee-payer slot; only the key's location varies.
 */
export interface SwigDelegateSigner {
  /** The delegate authority public key (fee payer + Swig role authority). */
  readonly publicKey: PublicKey;
  /** Add the delegate's signature to the compiled transaction (in place). */
  sign(tx: VersionedTransaction): Promise<void>;
}

/**
 * Local-keystore delegate signer: the Ed25519 keypair (decrypted from Gateway's keystore)
 * signs in-process. The raw key is on the host — use a KMS-backed signer for production.
 */
export class LocalKeystoreDelegateSigner implements SwigDelegateSigner {
  constructor(private readonly keypair: Keypair) {}

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async sign(tx: VersionedTransaction): Promise<void> {
    tx.sign([this.keypair]);
  }
}
