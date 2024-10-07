// import { SolonaAsset } from './solana.request';
import LRUCache from 'lru-cache';
// import { AlgorandController } from '../algorand/algorand.controller';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getSolanaConfig } from './solana.config';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { SolanaController } from './solana.controller';
import { walletPath } from '../../services/base';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SolanaAsset } from './solana.request';
import { promises as fs } from 'fs';

export class Solana {
  public nativeTokenSymbol: string = 'SOL';
  private _assetMap: Record<string, SolanaAsset> = {};
  private static _instances: LRUCache<string, Solana>;
  private _chain: string = 'solana';
  private _network: string;
  // // private _
  private _ready: boolean = true;
  private _assetListSource: string;
  // public gasPrice: number;
  // public gasLimit: number;
  // public gasCost: number;
  public connection: Connection;
  public controller: typeof SolanaController;

  constructor(network: string, rpc: string, assetListSource: string) {
    this._network = network;
    this.connection = new Connection(rpc);
    this.controller = SolanaController;
    this._assetListSource = assetListSource;
  }
  public get network(): string {
    return this._network;
  }
  public ready(): boolean {
    return this._ready;
  }

  private async loadAssets(): Promise<void> {
    const assetData = await this.getAssetData();
    for (const result of assetData) {
      this._assetMap[result.symbol] = {
        symbol: result.symbol.toUpperCase(),
        address: result.address,
        decimals: result.decimals,
        name: result.name,
        logoURI: result.logoURI,
      };
    }
  }
  private async getAssetData(): Promise<Array<SolanaAsset>> {
    const data = JSON.parse(await fs.readFile(this._assetListSource, 'utf8'));
    return data.tokens;
  }

  public async init(): Promise<void> {
    await this.loadAssets();
    this._ready = true;
    return;
  }
  public get storedAssetList(): SolanaAsset[] {
    return Object.values(this._assetMap);
  }

  public getAssetForSymbol(symbol: string): SolanaAsset | null {
    return this._assetMap[symbol] ? this._assetMap[symbol] : null;
  }

  public static getInstance(network: string): Solana {
    const config = getSolanaConfig(network);
    if (Solana._instances === undefined) {
      Solana._instances = new LRUCache<string, Solana>({ max: 1 });
    }
    if (!Solana._instances.has(config.network.name)) {
      if (network !== null) {
        const assetListSource = config.network.assetListSource;

        Solana._instances.set(
          config.network.name,
          new Solana(network, config.network.nodeURL, assetListSource),
        );
      } else {
        throw new Error(
          `Solana.getInstance received an unexpected network: ${network}.`,
        );
      }
    }
    return Solana._instances.get(config.network.name) as Solana;
  }

  public async getNativeBalance(account: Keypair): Promise<string> {
    const balance = await this.connection.getBalance(account.publicKey);
    return (balance ?? 0).toString();
  }

  public async getAssociatedTokenAccount(
    tokenAddress: string,
    ownerAddress: string,
  ) {
    const associatedAccount = await getAssociatedTokenAddressSync(
      new PublicKey(tokenAddress),
      new PublicKey(ownerAddress),
    );
    return associatedAccount;
  }

  public async getAssetBalance(account: Keypair, tokenAddress: string) {
    const associatedAccount = await this.getAssociatedTokenAccount(
      tokenAddress,
      account.publicKey.toString(),
    );
    const assetBalance =
      await this.connection.getTokenAccountBalance(associatedAccount);
    return assetBalance?.value?.uiAmountString ?? '0';
  }

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
