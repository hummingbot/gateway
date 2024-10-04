// import { SolonaAsset } from './solana.request';
import LRUCache from 'lru-cache';
// import { AlgorandController } from '../algorand/algorand.controller';
import { Keypair, Connection } from '@solana/web3.js';
import { getSolanaConfig } from './solana.config';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { createCipheriv, randomBytes } from 'crypto';
export class Solana {
  public nativeTokenSymbol: string = 'SOL';
  // private _assetMap: Record<string, SolonaAsset> = {};
  private static _instances: LRUCache<string, Solana>;
  // private _chain: string = 'solana';
  private _network: string;
  // // private _
  private _ready: boolean = true;
  // private _assetListSource: string;
  // public gasPrice: number;
  // public gasLimit: number;
  // public gasCost: number;
  // public controller: typeof AlgorandController;

  constructor(network: string) {
    this._network = network;
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
        // const nodeUrl = config.network.nodeURL;
        Solana._instances.set(config.network.name, new Solana(network));
      } else {
        throw new Error(
          `Solana.getInstance received an unexpected network: ${network}.`,
        );
      }
    }
    return Solana._instances.get(config.network.name) as Solana;
  }

  private connection = new Connection(
    'https://alien-late-resonance.solana-mainnet.quiknode.pro/148db7e65a5b33b040183b0b0516359d59a0b0e6/',
  );

  public async getNativeBalance(account: Keypair): Promise<number> {
    const balance = await this.connection.getBalance(account.publicKey);
    return balance ?? 0;
  }

  public async getAccountFromPrivateKey(
    mnemonic: string,
  ): Promise<{ address: string; privateKey: string }> {
    // Derive seed from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Use the standard Solana derivation path
    const derivationPath = "m/44'/501'/0'/0'";

    // Derive the private key from the seed
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;

    // Create Keypair from derived seed
    const keypair = Keypair.fromSeed(derivedSeed);

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
}
