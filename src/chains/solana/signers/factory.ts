import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fse from 'fs-extra';

import { ConfigManagerCertPassphrase } from '../../../services/config-manager-cert-passphrase';
import { logger } from '../../../services/logger';
import { getHardwareWalletByAddress, isHardwareWallet, getSafeWalletFilePath } from '../../../wallet/utils';

import { KeypairSigner } from './keypair-signer';
import { LedgerSigner } from './ledger-signer';
import { SolanaSigner, SignerError, SignerErrorCode, SignerType, WalletInfo } from './types';

/**
 * Factory for creating Solana signers
 *
 * This factory automatically detects the wallet type and creates the appropriate signer.
 * It provides a unified interface for getting signers regardless of the underlying implementation.
 */
export class SignerFactory {
  private static decryptCache: Map<string, Keypair> = new Map();

  /**
   * Get a signer for the given address
   * Automatically detects the wallet type (keypair, hardware, etc.)
   */
  static async getSigner(address: string): Promise<SolanaSigner> {
    // Validate address format
    try {
      new PublicKey(address);
    } catch {
      throw new SignerError(SignerErrorCode.INVALID_PUBLIC_KEY, `Invalid Solana address: ${address}`);
    }

    // Check if it's a hardware wallet
    const hardwareWallet = await getHardwareWalletByAddress('solana', address);
    if (hardwareWallet) {
      logger.debug(`[SignerFactory] Creating LedgerSigner for ${address}`);
      return new LedgerSigner(address, hardwareWallet.derivationPath);
    }

    // Check if it's a regular keypair wallet
    const keypair = await SignerFactory.loadKeypair(address);
    if (keypair) {
      logger.debug(`[SignerFactory] Creating KeypairSigner for ${address}`);
      return new KeypairSigner(keypair);
    }

    throw new SignerError(SignerErrorCode.NOT_AVAILABLE, `No wallet found for address: ${address}`);
  }

  /**
   * Get wallet info for an address (type, derivation path, etc.)
   */
  static async getWalletInfo(address: string): Promise<WalletInfo> {
    // Check hardware wallet first
    const hardwareWallet = await getHardwareWalletByAddress('solana', address);
    if (hardwareWallet) {
      return {
        type: 'ledger',
        address,
        derivationPath: hardwareWallet.derivationPath,
      };
    }

    // Check regular wallet
    const walletPath = getSafeWalletFilePath('solana', address);
    const exists = await fse.pathExists(walletPath);
    if (exists) {
      return {
        type: 'keypair',
        address,
      };
    }

    throw new SignerError(SignerErrorCode.NOT_AVAILABLE, `No wallet found for address: ${address}`);
  }

  /**
   * Get the signer type for an address
   */
  static async getSignerType(address: string): Promise<SignerType> {
    if (await isHardwareWallet('solana', address)) {
      return 'ledger';
    }

    const walletPath = getSafeWalletFilePath('solana', address);
    const exists = await fse.pathExists(walletPath);
    if (exists) {
      return 'keypair';
    }

    throw new SignerError(SignerErrorCode.NOT_AVAILABLE, `No wallet found for address: ${address}`);
  }

  /**
   * Check if an address has a wallet configured
   */
  static async hasWallet(address: string): Promise<boolean> {
    try {
      await SignerFactory.getSignerType(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load a keypair from the encrypted wallet file
   */
  private static async loadKeypair(address: string): Promise<Keypair | null> {
    try {
      // Check cache first
      if (SignerFactory.decryptCache.has(address)) {
        return SignerFactory.decryptCache.get(address)!;
      }

      const walletPath = getSafeWalletFilePath('solana', address);

      // Check if file exists
      const exists = await fse.pathExists(walletPath);
      if (!exists) {
        return null;
      }

      // Read encrypted wallet
      const encryptedPrivateKey = await fse.readFile(walletPath, 'utf8');

      // Get passphrase
      const passphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!passphrase) {
        throw new SignerError(SignerErrorCode.CONFIG_ERROR, 'Missing passphrase for wallet decryption');
      }

      // Decrypt (we need to use Solana's decrypt method)
      // For now, we'll use a simplified approach - import the decrypt logic
      const decrypted = await SignerFactory.decrypt(encryptedPrivateKey, passphrase);
      const keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(decrypted)));

      // Cache the decrypted keypair
      SignerFactory.decryptCache.set(address, keypair);

      return keypair;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Decrypt an encrypted private key
   * This mirrors the Solana.decrypt method
   */
  private static async decrypt(encryptedStr: string, password: string): Promise<string> {
    const crypto = await import('crypto');

    const encrypted = JSON.parse(encryptedStr);
    const salt = Buffer.from(encrypted.salt, 'hex');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const content = Buffer.from(encrypted.content, 'hex');

    const key = crypto.pbkdf2Sync(password, new Uint8Array(salt), 5000, 32, 'sha512');

    const decipher = crypto.createDecipheriv('aes-256-ctr', new Uint8Array(key), new Uint8Array(iv));

    const decrypted = Buffer.concat([
      new Uint8Array(decipher.update(new Uint8Array(content))),
      new Uint8Array(decipher.final()),
    ]);

    return decrypted.toString();
  }

  /**
   * Clear the keypair cache (useful for testing or when passphrase changes)
   */
  static clearCache(): void {
    SignerFactory.decryptCache.clear();
  }
}
