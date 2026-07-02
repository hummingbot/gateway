import crypto from 'crypto';

import { encryptSecret, decryptSecret, isLegacyKeystore } from '../../src/services/secure-keystore';

const SECRET = '5jKMnQ2cVtqz3uExamplePrivateKeyMaterialBase58xyz';
const PASSWORD = 'correct horse battery staple';

/** Reproduce the legacy (pre-#652) keystore format: PBKDF2-5000 + AES-256-CTR, no MAC. */
function legacyEncrypt(secret: string, password: string): string {
  const algorithm = 'aes-256-ctr';
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(password, new Uint8Array(salt), 5000, 32, 'sha512');
  const cipher = crypto.createCipheriv(algorithm, new Uint8Array(key), new Uint8Array(iv));
  const encrypted = Buffer.concat([
    new Uint8Array(cipher.update(new Uint8Array(Buffer.from(secret)))),
    new Uint8Array(cipher.final()),
  ]);
  return JSON.stringify({ algorithm, iv: iv.toJSON(), salt: salt.toJSON(), encrypted: encrypted.toJSON() });
}

describe('secure-keystore (hardened at-rest format)', () => {
  it('round-trips a secret', () => {
    const encrypted = encryptSecret(SECRET, PASSWORD);
    expect(decryptSecret(encrypted, PASSWORD)).toBe(SECRET);
  });

  it('uses scrypt + AES-256-GCM and embeds parameters', () => {
    const ks = JSON.parse(encryptSecret(SECRET, PASSWORD));
    expect(ks.version).toBe(2);
    expect(ks.kdf).toBe('scrypt');
    expect(ks.cipher).toBe('aes-256-gcm');
    expect(ks.kdfparams.n).toBeGreaterThanOrEqual(1 << 17); // OWASP-recommended minimum
    expect(ks.kdfparams.salt).toMatch(/^[0-9a-f]+$/);
    expect(ks.mac).toMatch(/^[0-9a-f]+$/);
    // Ciphertext must not contain the plaintext.
    expect(ks.ciphertext).not.toContain(Buffer.from(SECRET).toString('hex'));
  });

  it('produces a different salt/iv/ciphertext each time', () => {
    const a = JSON.parse(encryptSecret(SECRET, PASSWORD));
    const b = JSON.parse(encryptSecret(SECRET, PASSWORD));
    expect(a.kdfparams.salt).not.toBe(b.kdfparams.salt);
    expect(a.cipherparams.iv).not.toBe(b.cipherparams.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects a wrong passphrase', () => {
    const encrypted = encryptSecret(SECRET, PASSWORD);
    expect(() => decryptSecret(encrypted, 'wrong password')).toThrow(/wrong passphrase or corrupted/i);
  });

  it('detects tampering (authenticated encryption)', () => {
    const ks = JSON.parse(encryptSecret(SECRET, PASSWORD));
    // Flip one byte of the ciphertext.
    const bytes = Buffer.from(ks.ciphertext, 'hex');
    bytes[0] ^= 0xff;
    ks.ciphertext = bytes.toString('hex');
    expect(() => decryptSecret(JSON.stringify(ks), PASSWORD)).toThrow(/wrong passphrase or corrupted/i);
  });

  it('still decrypts the legacy format (backward compatible)', () => {
    const legacy = legacyEncrypt(SECRET, PASSWORD);
    expect(isLegacyKeystore(legacy)).toBe(true);
    expect(decryptSecret(legacy, PASSWORD)).toBe(SECRET);
  });

  it('recognises the hardened format as non-legacy', () => {
    expect(isLegacyKeystore(encryptSecret(SECRET, PASSWORD))).toBe(false);
  });
});
