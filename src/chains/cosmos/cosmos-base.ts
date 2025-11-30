import crypto from 'crypto';
import { promises as fs } from 'fs';

import { fromHex } from '@cosmjs/encoding';
import { DirectSecp256k1Wallet, AccountData } from '@cosmjs/proto-signing';
import { StargateClient, setupIbcExtension } from '@cosmjs/stargate';
import axios from 'axios';
import { BigNumber } from 'bignumber.js';
import fse from 'fs-extra';
import { osmosis } from 'osmojs';

import { SerializableExtendedPool as CosmosSerializableExtendedPool } from '../../connectors/osmosis/osmosis.types'; // CosmosSerializableExtendedPool is a custom type for extended pool info
import { MarketListType as tokenListType, stringInsert } from '../../services/base';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { TokenService } from '../../services/token-service';
import { getSafeWalletFilePath, isHardwareWallet as isHardwareWalletUtil } from '../../wallet/utils';
import { getEIP1559DynamicBaseFee } from '../cosmos/cosmos.prices';

import { CosmosAsset, AssetList } from './cosmos.universaltypes';
import { isValidCosmosAddress } from './cosmos.validators';
const { createRPCQueryClient } = osmosis.ClientFactory;

// a nice way to represent the token value without carrying around as a string
export interface CosmosTokenValue {
  value: BigNumber;
  decimals: number;
}

export interface TokensJson {
  assets: CosmosAsset[];
}

export interface PositionInfo {
  token0?: string | undefined;
  token1?: string | undefined;
  poolShares?: string; // COSMOS - GAMM pools only issue poolShares (no amount/unclaimedToken)
  fee?: string | undefined;
  lowerPrice?: string;
  upperPrice?: string;
  amount0?: string; // COSMOS - CL pools only
  amount1?: string; // COSMOS - CL pools only
  unclaimedToken0?: string; // COSMOS - CL pools only
  unclaimedToken1?: string; // COSMOS - CL pools only
  pools?: CosmosSerializableExtendedPool[];
}

export class CosmosWallet {
  member: DirectSecp256k1Wallet;
  pubkey: Uint8Array;
  privkey: Uint8Array;
  prefix: string;
  address: string;
}
export async function cWalletMaker(privkey: Uint8Array, prefix: string): Promise<CosmosWallet> {
  const member = await DirectSecp256k1Wallet.fromKey(privkey, prefix);
  const wallet = new CosmosWallet();
  wallet.member = member;
  wallet.privkey = privkey;
  wallet.prefix = prefix;
  wallet.pubkey = (await member
    .getAccounts()
    .then((accounts: readonly AccountData[]) => accounts[0].pubkey)) as Uint8Array;
  wallet.address = await member.getAccounts().then((accounts: readonly AccountData[]) => accounts[0].address);
  return wallet;
}

export interface KeyAlgorithm {
  name: string;
  salt: Uint8Array;
  iterations: number;
  hash: string;
}

export interface CipherAlgorithm {
  name: string;
  iv: Uint8Array;
}
export interface EncryptedPrivateKey {
  keyAlgorithm: KeyAlgorithm;
  cipherAlgorithm: CipherAlgorithm;
  ciphertext: Uint8Array;
}

export type NewBlockHandler = (bn: number) => void;

export type NewDebugMsgHandler = (msg: any) => void;

// convert a BigNumber and the number of decimals into a numeric string.
// this makes it JavaScript compatible while preserving all the data.
export const bigNumberWithDecimalToStr = (n: BigNumber, d: number): string => {
  const n_ = n.toString();

  let zeros = '';

  if (n_.length <= d) {
    zeros = '0'.repeat(d - n_.length + 1);
  }

  return stringInsert(n_.split('').reverse().join('') + zeros, '.', d)
    .split('')
    .reverse()
    .join('');
};

// we should turn Token into a string when we return as a value in an API call
export const tokenValueToString = (t: CosmosTokenValue | string): string => {
  return typeof t === 'string' ? t : bigNumberWithDecimalToStr(t.value, t.decimals);
};

export class CosmosBase {
  public _provider: any = undefined;
  protected tokenList: CosmosAsset[] = [];
  protected _tokenMap: Record<string, CosmosAsset> = {};

  public assetList: AssetList[] = [];
  public _ready: boolean = false;
  public _initialized: Promise<boolean> = Promise.resolve(false);

  public network;
  public chainName: string;
  public rpcProvider: string;
  public nodeURL;
  public gasAdjustment;
  public manualGasPrice: number;
  public allowedSlippage: string;
  public gasLimitTransaction: number;
  public manualGasPriceToken: string;
  public feeTier: string;
  public rpcAddressDynamicBaseFee: string;
  public useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: boolean;
  public lastBaseFee: number;

  constructor(
    network: string,
    chainName: string,
    nodeURL: string,
    gasAdjustment: number, // adjustment
    feeTier: string,
    manualGasPriceToken: string,
    gasLimitTransaction: number,
    allowedSlippage: string,
    rpcProvider: string,
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice?: boolean,
    rpcAddressDynamicBaseFee?: string,
    manualGasPrice?: number,
  ) {
    this.network = network;
    this.chainName = chainName;
    this.feeTier = feeTier;
    this.manualGasPriceToken = manualGasPriceToken;
    this.gasLimitTransaction = gasLimitTransaction;
    this.allowedSlippage = allowedSlippage;
    this.manualGasPrice = manualGasPrice!;
    this.nodeURL = nodeURL;
    this.gasAdjustment = gasAdjustment;
    this.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice = useEIP1559DynamicBaseFeeInsteadOfManualGasPrice!;
    this.rpcAddressDynamicBaseFee = rpcAddressDynamicBaseFee!;
    this.rpcProvider = rpcProvider;
  }

  ready(): boolean {
    return this._ready;
  }

  public get provider() {
    return this._provider;
  }

  async init(): Promise<void> {
    await this._initialized; // Wait for any previous init() calls to complete
    if (!this.ready()) {
      if (this.chainName == 'cosmos') {
        this._provider = await StargateClient.connect(this.nodeURL);
      } else {
        // osmosis
        this._provider = await createRPCQueryClient({ rpcEndpoint: this.nodeURL });
      }
      await this.getLatestBasePrice();
      // If we're not ready, this._initialized will be a Promise that resolves after init() completes
      this._initialized = (async () => {
        try {
          if (this.chainName) {
            await this.loadTokens();
          }
          return true;
        } catch (e) {
          logger.error(`Failed to initialize ${this.chainName} chain: ${e}`);
          return false;
        }
      })();
      this._ready = await this._initialized; // Wait for the initialization to complete
    }
    return;
  }

  async getLatestBasePrice(): Promise<number> {
    if (this.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice) {
      const eipPrice = await getEIP1559DynamicBaseFee(this.rpcAddressDynamicBaseFee);
      if (eipPrice != '') {
        this.manualGasPrice = Number(eipPrice);
      }
    }
    return this.manualGasPrice ? this.manualGasPrice : 0.025;
  }

  /**
   * Load tokens from the token list source
   */
  public async loadTokens(): Promise<void> {
    logger.info(`Loading tokens for Cosmos-Osmosis/${this.network} using TokenService`);
    try {
      // Use TokenService to load tokens
      const tokens = await TokenService.getInstance().loadTokenList('cosmos', this.network);

      // Convert to TokenInfo format with chainId and fake addresses
      this.tokenList = [];
      tokens.forEach((token) => {
        if (['osmosistestnet', 'osmosis'].includes(token.chainName)) {
          this.tokenList.push(new CosmosAsset(token));
        }
      });
      if (this.tokenList) {
        logger.info(`Loaded ${this.tokenList.length} tokens for Cosmos-Osmosis/${this.network}`);
        this.tokenList.forEach((token: CosmosAsset) => (this._tokenMap[token.symbol] = token));
      }
      this.assetList = [
        {
          chainName: 'osmosis',
          chain_name: 'osmosis',
          assets: this.tokenList,
        },
      ];
    } catch (error) {
      logger.error(`Failed to load token list: ${error.message}`);
      throw error;
    }
  }

  // Original token list loading logic. Retained for URL JSON load support.
  async getTokenList(tokenListSource: string, tokenListType: tokenListType): Promise<CosmosAsset[]> {
    const tokens: CosmosAsset[] = [];
    let tokensJson: any;

    if (tokenListType === 'URL') {
      ({ data: tokensJson } = await axios.get(tokenListSource));
    } else {
      tokensJson = JSON.parse(await fs.readFile(tokenListSource, 'utf8'));
    }
    if (this.chainName == 'cosmos') {
      // URL source is a bit different for cosmos
      tokensJson = tokensJson as any[];
      tokensJson.forEach((tokenAsset) => {
        const cosmosAssetInstance = new CosmosAsset(tokenAsset);
        if (cosmosAssetInstance) {
          cosmosAssetInstance.chainName = this.chainName;
          tokens.push(cosmosAssetInstance);
        }
      });
    } else if (this.chainName == 'osmosis') {
      tokensJson = tokensJson as TokensJson;
      for (let tokenAssetIdx = 0; tokenAssetIdx < tokensJson.assets.length; tokenAssetIdx++) {
        const tokenAsset = tokensJson.assets[tokenAssetIdx];
        const cosmosAssetInstance = new CosmosAsset(tokenAsset);
        if (cosmosAssetInstance) {
          cosmosAssetInstance.chainName = this.chainName;
          tokens.push(cosmosAssetInstance);
        }
      }
    }

    return tokens;
  }

  // ethereum token lists are large. instead of reloading each time with
  // getTokenList, we can read the stored tokenList value from when the
  // object was initiated.
  public get storedTokenList(): CosmosAsset[] {
    return this.tokenList;
  }

  // return the Token object for a symbol
  getTokenForSymbol(symbol: string): CosmosAsset | null {
    return this._tokenMap[symbol] ? this._tokenMap[symbol] : null;
  }

  async getWalletFromPrivateKey(privateKey: string, prefix: string): Promise<CosmosWallet> {
    const cwallet = await cWalletMaker(fromHex(privateKey), prefix);
    return cwallet;
  }

  async getWallet(address: string, prefix: string): Promise<CosmosWallet> {
    try {
      // Validate the address format first
      const validatedAddress = isValidCosmosAddress(address);

      // Use the safe wallet file path utility to prevent path injection
      const safeWalletPath = getSafeWalletFilePath('cosmos', validatedAddress);

      // Read the wallet file using the safe path
      const encryptedPrivateKey: string = await fse.readFile(safeWalletPath, 'utf8');
      const passphrase = ConfigManagerCertPassphrase.readPassphrase();
      if (!passphrase) {
        throw new Error('missing passphrase');
      }
      const decrypted = await this.decrypt(encryptedPrivateKey, passphrase);
      // const secretKeyBytes = new Uint8Array(bs58.decode(decrypted));
      return await this.getWalletFromPrivateKey(decrypted, prefix);
      // return await this.getWalletFromPrivateKey(Buffer.from(secretKeyBytes).toString('hex'), prefix);
    } catch (error) {
      if (error.message.includes('Invalid Cosmos address')) {
        throw new Error(`Invalid wallet address: ${address}`);
      }
      if (error.code === 'ENOENT') {
        throw new Error(`Wallet not found for address: ${address}`);
      }
      throw error;
    }
  }

  /**
   * Check if an address is a hardware wallet
   */
  async isHardwareWallet(address: string): Promise<boolean> {
    try {
      return await isHardwareWalletUtil('cosmos', address);
    } catch (error) {
      logger.error(`Error checking hardware wallet status: ${error.message}`);
      return false;
    }
  }

  async encrypt(secret: string, password: string): Promise<string> {
    const algorithm = 'aes-256-ctr';
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, new Uint8Array(salt), 5000, 32, 'sha512');
    const cipher = crypto.createCipheriv(algorithm, new Uint8Array(key), new Uint8Array(iv));

    const encryptedBuffers = [
      new Uint8Array(cipher.update(new Uint8Array(Buffer.from(secret)))),
      new Uint8Array(cipher.final()),
    ];
    const encrypted = Buffer.concat(encryptedBuffers);

    const ivJSON = iv.toJSON();
    const saltJSON = salt.toJSON();
    const encryptedJSON = encrypted.toJSON();

    return JSON.stringify({
      algorithm,
      iv: ivJSON,
      salt: saltJSON,
      encrypted: encryptedJSON,
    });
  }

  async decrypt(encryptedSecret: string, password: string): Promise<string> {
    const hash = JSON.parse(encryptedSecret);
    const salt = new Uint8Array(Buffer.from(hash.salt, 'utf8'));
    const iv = new Uint8Array(Buffer.from(hash.iv, 'utf8'));

    const key = crypto.pbkdf2Sync(password, salt, 5000, 32, 'sha512');

    const decipher = crypto.createDecipheriv(hash.algorithm, new Uint8Array(key), iv);

    const decryptedBuffers = [
      new Uint8Array(decipher.update(new Uint8Array(Buffer.from(hash.encrypted, 'hex')))),
      new Uint8Array(decipher.final()),
    ];
    const decrypted = Buffer.concat(decryptedBuffers);

    return decrypted.toString();
  }

  async getDenomMetadata(provider: any, denom: string): Promise<any> {
    return await provider.queryClient.bank.denomMetadata(denom);
  }

  getTokenDecimals(token: any): number {
    return token ? token.denomUnits[token.denomUnits.length - 1].exponent : 6; // Last denom unit has the decimal amount we need from our list
  }

  async getBalances(wallet: CosmosWallet): Promise<Record<string, CosmosTokenValue>> {
    const balances: Record<string, CosmosTokenValue> = {};

    const provider = await this._provider;

    const accounts = await wallet.member.getAccounts();

    const { address } = accounts[0];

    const allTokens = await provider.getAllBalances(address);

    await Promise.all(
      allTokens.map(async (t: { denom: string; amount: string }) => {
        let token = this.getTokenByBase(t.denom);

        if (!token && t.denom.startsWith('ibc/')) {
          const ibcHash: string = t.denom.replace('ibc/', '');

          // Get base denom by IBC hash
          if (ibcHash) {
            const { denomTrace } = await setupIbcExtension(await provider.queryClient).ibc.transfer.denomTrace(ibcHash);

            if (denomTrace) {
              const { baseDenom } = denomTrace;

              token = this.getTokenByBase(baseDenom);
            }
          }
        }

        // Not all tokens are added in the registry so we use the denom if the token doesn't exist
        balances[token ? token.symbol : t.denom] = {
          value: new BigNumber(parseInt(t.amount, 10)),
          decimals: this.getTokenDecimals(token),
        };
      }),
    );

    return balances;
  }

  // returns a cosmos tx for a txHash
  async getTransaction(id: string): Promise<any> {
    const provider = await this._provider;
    const transaction = await provider.cosmos.tx.v1beta1.getTx({ hash: id });
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    return transaction;
  }

  public getTokenBySymbol(tokenSymbol: string): CosmosAsset | undefined {
    return this.tokenList.find((token: CosmosAsset) => token.symbol.toUpperCase() === tokenSymbol.toUpperCase());
  }

  public getTokenByBase(base: string): CosmosAsset | undefined {
    return this.tokenList.find((token: CosmosAsset) => token.base === base);
  }

  // generic - by denom or symbol (since we don't have token address)
  public getToken(tokenString: string): CosmosAsset | undefined {
    if (this.getTokenByBase(tokenString)) {
      return this.getTokenByBase(tokenString);
    } else {
      return this.tokenList.find((token: CosmosAsset) => token.symbol.toUpperCase() === tokenString.toUpperCase());
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    const provider = await this._provider;

    return await provider.getHeight();
  }
}
