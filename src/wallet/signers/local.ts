/**
 * The `local` backend: the wallet's key is an encrypted file in conf/wallets/{chain}/.
 *
 * This module is the only place outside wallet onboarding that decrypts a key. The key
 * is decrypted for one signature and is not returned to the caller.
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { Wallet } from 'ethers';
import fse from 'fs-extra';
import nacl from 'tweetnacl';

import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { decryptSecret, encryptSecret, isLegacyKeystore } from '../../services/secure-keystore';

import { EthereumSigner, SignerFactories, SolanaSigner, UnsignedEvmTransaction, WalletRecord } from './types';
import { localKeyFilePath } from './wallet-store';

function walletKey(): string {
  const key = ConfigManagerCertPassphrase.readWalletKey();
  if (!key) {
    throw httpErrors.internalServerError('No wallet encryption key configured (start Gateway with --passphrase)');
  }
  return key;
}

async function readKeyFile(path: string, address: string): Promise<string> {
  try {
    return await fse.readFile(path, 'utf8');
  } catch (e: any) {
    if (e.code === 'ENOENT') throw httpErrors.notFound(`No key file for wallet ${address}`);
    throw e;
  }
}

/**
 * The Solana keypair of a local wallet. Legacy (PBKDF2-5000 + AES-256-CTR) key files are
 * upgraded to the hardened format on unlock (hummingbot/gateway#652).
 */
export async function loadSolanaKeypair(address: string): Promise<Keypair> {
  const path = localKeyFilePath('solana', address);
  const encrypted = await readKeyFile(path, address);
  const password = walletKey();
  const secret = decryptSecret(encrypted, password);
  if (isLegacyKeystore(encrypted)) {
    try {
      await fse.writeFile(path, encryptSecret(secret, password), { mode: 0o600 });
      await fse.chmod(path, 0o600);
      logger.info(`Upgraded keystore for ${address} to the hardened format (scrypt + AES-256-GCM)`);
    } catch (e) {
      logger.warn(`Failed to upgrade keystore for ${address}: ${(e as Error).message}`);
    }
  }
  const keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(secret)));
  if (keypair.publicKey.toBase58() !== address) {
    throw httpErrors.internalServerError(`The key file of ${address} holds the key of ${keypair.publicKey.toBase58()}`);
  }
  return keypair;
}

/** The ethers wallet (not connected to a provider) of a local Ethereum wallet. */
export async function loadEthereumWallet(address: string): Promise<Wallet> {
  const path = localKeyFilePath('ethereum', address);
  const wallet = await Wallet.fromEncryptedJson(await readKeyFile(path, address), walletKey());
  if (wallet.address.toLowerCase() !== address.toLowerCase()) {
    throw httpErrors.internalServerError(`The key file of ${address} holds the key of ${wallet.address}`);
  }
  return wallet;
}

class LocalSolanaSigner implements SolanaSigner {
  readonly kind = 'local' as const;
  constructor(readonly address: string) {}

  async signTransactionMessage(message: Uint8Array) {
    const keypair = await loadSolanaKeypair(this.address);
    return { kind: 'signed' as const, value: nacl.sign.detached(message, keypair.secretKey) };
  }
}

class LocalEthereumSigner implements EthereumSigner {
  readonly kind = 'local' as const;
  constructor(readonly address: string) {}

  async signTransaction(tx: UnsignedEvmTransaction) {
    const wallet = await loadEthereumWallet(this.address);
    return { kind: 'signed' as const, value: await wallet.signTransaction(tx) };
  }
}

export const localBackend: SignerFactories = {
  solana: async (record: WalletRecord) => new LocalSolanaSigner(record.address),
  ethereum: async (record: WalletRecord) => new LocalEthereumSigner(record.address),
};
