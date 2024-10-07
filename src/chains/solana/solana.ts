// import { SolonaAsset } from './solana.request';
import LRUCache from 'lru-cache';
// import { AlgorandController } from '../algorand/algorand.controller';
import { Connection, Keypair } from '@solana/web3.js';
import { getSolanaConfig } from './solana.config';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { SolanaController } from './solana.controller';
import { walletPath } from '../../services/base';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';

export class Solana {
  public nativeTokenSymbol: string = 'SOL';
  // private _assetMap: Record<string, SolonaAsset> = {};
  private static _instances: LRUCache<string, Solana>;
  private _chain: string = 'solana';
  private _network: string;
  // // private _
  private _ready: boolean = true;
  // private _assetListSource: string;
  // public gasPrice: number;
  // public gasLimit: number;
  // public gasCost: number;
  public connection: Connection;
  public controller: typeof SolanaController;

  constructor(network: string, rpc: string) {
    this._network = network;
    this.connection = new Connection(rpc);
    this.controller = SolanaController;
  }
  public get network(): string {
    return this._network;
  }
  public ready(): boolean {
    return this._ready;
  }

  public async init(): Promise<void> {
    this._ready = true;
    return;
  }

  public static getInstance(network: string): Solana {
    const config = getSolanaConfig(network);
    if (Solana._instances === undefined) {
      Solana._instances = new LRUCache<string, Solana>({ max: 1 });
    }
    if (!Solana._instances.has(config.network.name)) {
      if (network !== null) {
        Solana._instances.set(
          config.network.name,
          new Solana(network, config.network.nodeURL),
        );
      } else {
        throw new Error(
          `Solana.getInstance received an unexpected network: ${network}.`,
        );
      }
    }
    return Solana._instances.get(config.network.name) as Solana;
  }

  public async getNativeBalance(account: Keypair): Promise<number> {
    const balance = await this.connection.getBalance(account.publicKey);
    return balance ?? 0;
  }
  public async getAssetBalance() {}

  public async getKeypairFromPrivateKey(mnemonic: string): Promise<Keypair> {
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Use the standard Solana derivation path
    const derivationPath = "m/44'/501'/0'/0'";

    // Derive the private key from the seed
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;

    // Create Keypair from derived seed
    return Keypair.fromSeed(derivedSeed);
  }

  public async getAccountFromPrivateKey(
    mnemonic: string,
  ): Promise<{ address: string; privateKey: string }> {
    // Derive seed from mnemonic
    const keypair = await this.getKeypairFromPrivateKey(mnemonic);
    // Display the public and private keys
    console.log('Public Key:', keypair.publicKey.toBase58());
    console.log('Private Key:', bs58.encode(keypair.secretKey));
    return {
      address: keypair.publicKey.toBase58().toString(),
      privateKey: bs58.encode(keypair.secretKey).toString(),
    };
  }

  public encrypt(mnemonic: string, password: string): string {
    const iv = randomBytes(16);
    const key = Buffer.alloc(32);
    key.write(password);

    const cipher = createCipheriv('aes-256-cbc', key, iv);

    const encrypted = Buffer.concat([cipher.update(mnemonic), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }
  public decrypt(encryptedMnemonic: string, password: string): string {
    const [iv, encryptedKey] = encryptedMnemonic.split(':');
    const key = Buffer.alloc(32);
    key.write(password);

    const decipher = createDecipheriv(
      'aes-256-cbc',
      key,
      Buffer.from(iv, 'hex'),
    );

    const decrpyted = Buffer.concat([
      decipher.update(Buffer.from(encryptedKey, 'hex')),
      decipher.final(),
    ]);

    return decrpyted.toString();
  }

  public async getTransaction(txHash: string): Promise<any> {
    try {
      const txInfo = await this.connection.getParsedTransaction(txHash);
      const slot = await this.connection.getSlot();
      const block = await this.connection.getBlocks(slot);
      if (txInfo) {
        return {
          currentBlock: block[0],
          txBlock: txInfo.blockTime,
          txHash,
          fee: txInfo.meta?.fee,
        };
      }
    } catch (e) {
      return null;
    }
  }
  public async getAccountFromAddress(address: string) {
    const path = `${walletPath}/${this._chain}/${address}.json`;
    const encryptedMnemonic: string = await fse.readFile(path, 'utf8');
    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }
    const mnemonic = this.decrypt(encryptedMnemonic, passphrase);

    return this.getKeypairFromPrivateKey(mnemonic);
  }
}
