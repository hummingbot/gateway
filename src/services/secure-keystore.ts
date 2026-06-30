/**
 * Hardened at-rest keystore for encrypted wallet private keys.
 *
 * Addresses hummingbot/gateway#652 (§3): the previous Solana keystore used
 * PBKDF2-HMAC-SHA512 with only 5,000 iterations and AES-256-CTR with no integrity check,
 * so a leaked key file was cheap to brute-force offline (especially with a weak passphrase)
 * and tampering went undetected.
 *
 * This module derives the encryption key with scrypt (memory-hard, GPU/ASIC-resistant) and
 * encrypts with AES-256-GCM (authenticated encryption — a wrong passphrase or a tampered
 * file fails cleanly instead of returning garbage). KDF/cipher parameters are stored in the
 * file so they can be tuned over time without breaking existing keystores, and the legacy
 * format is still readable so wallets can be migrated transparently on next unlock.
 *
 * No external dependency is added — everything is from Node's built-in `crypto`.
 */

import crypto from 'crypto';

// scrypt cost parameters. N is a power-of-two CPU/memory cost; memory used ≈ 128 * N * r
// bytes (here ≈ 128 MB). N=2^17 is the OWASP-recommended minimum scrypt cost; r=8 and p=1
// also match OWASP. Parameters are stored per file so they can be raised over time without
// breaking existing keystores (~100 ms to derive per unlock).
const SCRYPT_N = 1 << 17; // 131072 (OWASP-recommended minimum)
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32; // AES-256
const SCRYPT_MAXMEM = 192 * 1024 * 1024; // headroom above 128 * N * r

interface ScryptKdfParams {
  n: number;
  r: number;
  p: number;
  dklen: number;
  salt: string; // hex
}

interface SecureKeystoreV2 {
  version: 2;
  kdf: 'scrypt';
  kdfparams: ScryptKdfParams;
  cipher: 'aes-256-gcm';
  cipherparams: { iv: string }; // hex
  ciphertext: string; // hex
  mac: string; // hex — AES-GCM authentication tag
}

function deriveKey(password: string, salt: Buffer, params: { n: number; r: number; p: number; dklen: number }): Buffer {
  return crypto.scryptSync(password, new Uint8Array(salt), params.dklen, {
    N: params.n,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

/**
 * Encrypt a secret with the hardened (scrypt + AES-256-GCM) keystore format.
 */
export function encryptSecret(secret: string, password: string): string {
  const salt = crypto.randomBytes(16);
  const params = { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dklen: KEY_LENGTH };
  const key = deriveKey(password, salt, params);
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', new Uint8Array(key), new Uint8Array(iv));
  const ciphertext = Buffer.concat([
    new Uint8Array(cipher.update(new Uint8Array(Buffer.from(secret, 'utf8')))),
    new Uint8Array(cipher.final()),
  ]);
  const mac = cipher.getAuthTag();

  const keystore: SecureKeystoreV2 = {
    version: 2,
    kdf: 'scrypt',
    kdfparams: { ...params, salt: salt.toString('hex') },
    cipher: 'aes-256-gcm',
    cipherparams: { iv: iv.toString('hex') },
    ciphertext: ciphertext.toString('hex'),
    mac: mac.toString('hex'),
  };
  return JSON.stringify(keystore);
}

/**
 * Whether an encrypted blob is in the legacy (pre-#652) format. Used to migrate on unlock.
 */
export function isLegacyKeystore(encrypted: string): boolean {
  try {
    const parsed = JSON.parse(encrypted);
    return parsed.version !== 2 && parsed.algorithm === 'aes-256-ctr';
  } catch {
    return false;
  }
}

/**
 * Decrypt a secret. Reads both the hardened (v2) format and the legacy format so existing
 * wallets keep working; callers should re-encrypt legacy files (see migrate-on-unlock).
 */
export function decryptSecret(encrypted: string, password: string): string {
  const parsed = JSON.parse(encrypted);

  if (parsed.version === 2 && parsed.kdf === 'scrypt' && parsed.cipher === 'aes-256-gcm') {
    const { kdfparams } = parsed as SecureKeystoreV2;
    const salt = Buffer.from(kdfparams.salt, 'hex');
    const key = deriveKey(password, salt, kdfparams);
    const iv = Buffer.from((parsed as SecureKeystoreV2).cipherparams.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', new Uint8Array(key), new Uint8Array(iv));
    decipher.setAuthTag(new Uint8Array(Buffer.from((parsed as SecureKeystoreV2).mac, 'hex')));
    try {
      const plaintext = Buffer.concat([
        new Uint8Array(decipher.update(new Uint8Array(Buffer.from((parsed as SecureKeystoreV2).ciphertext, 'hex')))),
        new Uint8Array(decipher.final()), // throws if the tag does not verify
      ]);
      return plaintext.toString('utf8');
    } catch {
      throw new Error('Failed to decrypt keystore: wrong passphrase or corrupted file');
    }
  }

  return decryptLegacy(parsed, password);
}

/**
 * Legacy decryptor (PBKDF2-5000 + AES-256-CTR, no MAC). Read-only — kept for migration.
 */
function decryptLegacy(parsed: any, password: string): string {
  // The legacy format stored iv/salt/encrypted via Buffer.toJSON() ({type:'Buffer',data}),
  // which Buffer.from() reconstructs directly.
  const salt = new Uint8Array(Buffer.from(parsed.salt));
  const iv = new Uint8Array(Buffer.from(parsed.iv));
  const key = crypto.pbkdf2Sync(password, salt, 5000, 32, 'sha512');
  const decipher = crypto.createDecipheriv(parsed.algorithm, new Uint8Array(key), iv);
  const decrypted = Buffer.concat([
    new Uint8Array(decipher.update(new Uint8Array(Buffer.from(parsed.encrypted)))),
    new Uint8Array(decipher.final()),
  ]);
  return decrypted.toString();
}
