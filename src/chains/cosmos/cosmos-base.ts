import axios from 'axios';
import { promises as fs } from 'fs';
import { TokenListType, stringInsert, walletPath } from '../../services/base';
import NodeCache from 'node-cache';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { BigNumber } from 'bignumber.js';
import { AccountData, DirectSignResponse } from '@cosmjs/proto-signing';
import { Asset, AssetDenomUnit, AssetTrace } from '@chain-registry/types/types/assets'
import { IndexedTx, setupIbcExtension } from '@cosmjs/stargate';
import { logger } from '../../services/logger';

//Cosmos
const { DirectSecp256k1Wallet } = require('@cosmjs/proto-signing');
const { StargateClient } = require('@cosmjs/stargate');
const { toBase64, fromBase64, fromHex } = require('@cosmjs/encoding');
const crypto = require('crypto').webcrypto;

import { osmosis } from 'osmojs';
import { getEIP1559DynamicBaseFee } from '../osmosis/osmosis.prices';
import { isFractionString } from '../../services/validators';
import { RefConfig } from '../../connectors/ref/ref.config';
import { percentRegexp } from '../../services/config-manager-v2';
const { createRPCQueryClient } = osmosis.ClientFactory;

export class CosmosAsset implements Asset {
  decimals: number = 0;
  constructor(asset: Asset){
    this.decimals = getExponentForAsset(asset);
    this.description = asset.description;
    if (asset.address != null){
      this.address = asset.address;
    }
    this.base = asset.base;
    this.name = asset.name;
    this.display = asset.display;
    this.symbol = asset.symbol;
    this.logo_URIs = asset.logo_URIs;
    if (asset.denom_units){
      this.denom_units = asset.denom_units;
    }
    if (asset.coingecko_id){
      this.coingecko_id = asset.coingecko_id;
    }
    if (asset.keywords){
      this.keywords = asset.keywords;
    }
    if (asset.traces){
      this.traces = asset.traces;
    }
    if (asset.ibc){
      this.ibc = asset.ibc;
    }
  }
  description?: string;
  type_asset?: string;
  address: string = '';
  denom_units: AssetDenomUnit[] = [];
  base: string; // this is denom!!!
  name: string;
  display: string;
  symbol: string;
  logo_URIs?: {
      png?: string;
      svg?: string;
      jpeg?: string;
  };
  coingecko_id?: string;
  keywords?: string[];
  traces?: AssetTrace[];
  ibc?: {
      source_channel?: string;
      source_denom?: string;
      dst_channel?: string;
  };
}

// a nice way to represent the token value without carrying around as a string
export interface CosmosTokenValue {
  value: BigNumber;
  decimals: number;
}

const getExponentForAsset = (asset: Asset): number => {
  if (asset && asset.denom_units){
    const unit = asset.denom_units.find(({ denom }) => denom === asset.display);
    if (unit){
      return unit.exponent;
    } 
  }
  return 0
};

export interface CosmosWallet {
  privkey: Uint8Array;
  pubkey: Uint8Array;
  prefix: 'string';
  getAccounts(): [AccountData];
  signDirect(): DirectSignResponse;
  fromKey(): CosmosWallet;
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
  return typeof t === 'string'
    ? t
    : bigNumberWithDecimalToStr(t.value, t.decimals);
};

export class CosmosBase {
  public _provider: any = undefined;
  protected tokenList: CosmosAsset[] = [];
  protected _tokenMap: Record<string, CosmosAsset> = {};

  public _ready: boolean = false;
  public _initialized: Promise<boolean> = Promise.resolve(false);

  public chainName;
  public rpcUrl;
  public gasPriceConstant;
  public tokenListSource: string;
  public tokenListType: TokenListType;
  public cache: NodeCache;

  public manualGasPrice: number;
  public rpcAddressDynamicBaseFee: string;
  public useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: boolean;

  constructor(
    chainName: string,
    rpcUrl: string,
    tokenListSource: string,
    tokenListType: TokenListType,
    gasPriceConstant: number, // adjustment
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice?: boolean,
    rpcAddressDynamicBaseFee?: string,
    manualGasPrice?: number
  ) {
    this.manualGasPrice = manualGasPrice!;
    this.chainName = chainName;
    this.rpcUrl = rpcUrl;
    this.gasPriceConstant = gasPriceConstant;
    this.tokenListSource = tokenListSource;
    this.tokenListType = tokenListType;
    this.cache = new NodeCache({ stdTTL: 3600 }); // set default cache ttl to 1hr
    this.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice = useEIP1559DynamicBaseFeeInsteadOfManualGasPrice!
    this.rpcAddressDynamicBaseFee = rpcAddressDynamicBaseFee!
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
      if (this.chainName == 'osmosis'){
        this._provider = await createRPCQueryClient({rpcEndpoint: this.rpcUrl});
        await this.getLatestBasePrice();
      }else{
        this._provider = StargateClient.connect(this.rpcUrl);
      }
      // If we're not ready, this._initialized will be a Promise that resolves after init() completes
      this._initialized = (async () => {
        try {
          await this.loadTokens(this.tokenListSource, this.tokenListType)
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
    var eipPrice = this.manualGasPrice;
    if (this.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice){
      const eipPrice = await getEIP1559DynamicBaseFee(this.rpcAddressDynamicBaseFee);
      if (eipPrice != ''){
        this.manualGasPrice = Number(eipPrice);
      }
    } 
    this.manualGasPrice = eipPrice;
    return this.manualGasPrice
  }

  async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<void> {
    this.tokenList = await this.getTokenList(tokenListSource, tokenListType);

    if (this.tokenList) {
      this.tokenList.forEach(
        (token: CosmosAsset) => (this._tokenMap[token.symbol] = token)
      );
    }
  }

  // returns a Tokens for a given list source and list type
  async getTokenList(
    tokenListSource: string,
    tokenListType: TokenListType
  ): Promise<CosmosAsset[]> {
    let tokens: CosmosAsset[] = [];
    let tokensJson = [];

    if (tokenListType === 'URL') {
      ({ data: tokensJson } = await axios.get(tokenListSource));
    } else {
      (tokensJson = JSON.parse(await fs.readFile(tokenListSource, 'utf8')));
    }
    for (var tokenAssetIdx=0; tokenAssetIdx<tokensJson.assets.length; tokenAssetIdx++){
      var tokenAsset = tokensJson.assets[tokenAssetIdx];
      tokens.push(new CosmosAsset(tokenAsset))
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

  async getWalletFromPrivateKey(
    privateKey: string,
    prefix: string
  ): Promise<CosmosWallet> {
    const wallet = await DirectSecp256k1Wallet.fromKey(
      fromHex(privateKey),
      prefix
    );

    return wallet;
  }

  async getAccountsfromPrivateKey(
    privateKey: string,
    prefix: string
  ): Promise<AccountData> {
    const wallet = await this.getWalletFromPrivateKey(privateKey, prefix);

    const accounts = await wallet.getAccounts();

    return accounts[0];
  }

  // returns Wallet for an address
  // TODO: Abstract-away into base.ts
  async getWallet(address: string, prefix: string): Promise<CosmosWallet> {
    const path = `${walletPath}/${this.chainName}`;

    const encryptedPrivateKey: EncryptedPrivateKey = JSON.parse(
      await fse.readFile(`${path}/${address}.json`, 'utf8'),
      (key, value) => {
        switch (key) {
          case 'ciphertext':
          case 'salt':
          case 'iv':
            return fromBase64(value);
          default:
            return value;
        }
      }
    );

    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }

    return await this.decrypt(encryptedPrivateKey, passphrase, prefix);
  }

  private static async getKeyMaterial(password: string) {
    const enc = new TextEncoder();
    return await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
  }

  private static async getKey(
    keyAlgorithm: {
      salt: Uint8Array;
      name: string;
      iterations: number;
      hash: string;
    },
    keyMaterial: CryptoKey
  ) {
    return await crypto.subtle.deriveKey(
      keyAlgorithm,
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // from Solana.ts
  async encrypt(privateKey: string, password: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await CosmosBase.getKeyMaterial(password);
    const keyAlgorithm = {
      name: 'PBKDF2',
      salt: salt,
      iterations: 500000,
      hash: 'SHA-256',
    };
    const key = await CosmosBase.getKey(keyAlgorithm, keyMaterial);
    const cipherAlgorithm = {
      name: 'AES-GCM',
      iv: iv,
    };
    const enc = new TextEncoder();
    const ciphertext: Uint8Array = (await crypto.subtle.encrypt(
      cipherAlgorithm,
      key,
      enc.encode(privateKey)
    )) as Uint8Array;
    return JSON.stringify(
      {
        keyAlgorithm,
        cipherAlgorithm,
        ciphertext: new Uint8Array(ciphertext),
      },
      (key, value) => {
        switch (key) {
          case 'ciphertext':
          case 'salt':
          case 'iv':
            return toBase64(Uint8Array.from(Object.values(value)));
          default:
            return value;
        }
      }
    );
  }

  async decrypt(
    encryptedPrivateKey: EncryptedPrivateKey,
    password: string,
    prefix: string
  ): Promise<CosmosWallet> {
    const keyMaterial = await CosmosBase.getKeyMaterial(password);
    const key = await CosmosBase.getKey(
      encryptedPrivateKey.keyAlgorithm,
      keyMaterial
    );
    const decrypted = await crypto.subtle.decrypt(
      encryptedPrivateKey.cipherAlgorithm,
      key,
      encryptedPrivateKey.ciphertext
    );
    const dec = new TextDecoder();
    dec.decode(decrypted);

    return await this.getWalletFromPrivateKey(dec.decode(decrypted), prefix);
  }

  async getDenomMetadata(provider: any, denom: string): Promise<any> {
    return await provider.queryClient.bank.denomMetadata(denom);
  }

  getTokenDecimals(token: any): number {
    return token ? token.denom_units[token.denom_units.length - 1].exponent : 6; // Last denom unit has the decimal amount we need from our list
  }

  async getBalances(wallet: CosmosWallet): Promise<Record<string, CosmosTokenValue>> {
    const balances: Record<string, CosmosTokenValue> = {};

    const provider = await this._provider;

    const accounts = await wallet.getAccounts();

    const { address } = accounts[0];

    const allTokens = await provider.getAllBalances(address);

    await Promise.all(
      allTokens.map(async (t: { denom: string; amount: string }) => {
        let token = this.getTokenByBase(t.denom);

        if (!token && t.denom.startsWith('ibc/')) {
          const ibcHash: string = t.denom.replace('ibc/', '');

          // Get base denom by IBC hash
          if (ibcHash) {
            const { denomTrace } = await setupIbcExtension(
              await provider.queryClient
            ).ibc.transfer.denomTrace(ibcHash);

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
      })
    );

    return balances;
  }

  // returns a cosmos tx for a txHash
  async getTransaction(id: string): Promise<IndexedTx> {
    const provider = await this._provider;
    var transaction;
    if (this.chainName == 'osmosis'){
      transaction = await provider.cosmos.tx.v1beta1.getTx({hash: id});
    }else{
      transaction = await provider.getTx(id);
    }

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return transaction;
  }

  public getTokenBySymbol(tokenSymbol: string): CosmosAsset | undefined {
    return this.tokenList.find(
      (token: CosmosAsset) => token.symbol.toUpperCase() === tokenSymbol.toUpperCase()
    );
  }

  public getTokenByBase(base: string): CosmosAsset | undefined {
    return this.tokenList.find((token: CosmosAsset) => token.base === base);
  }

  async getCurrentBlockNumber(): Promise<number> {
    const provider = await this._provider;

    return await provider.getHeight();
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): number {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return 100 * (Number(fractionSplit[0]) / Number(fractionSplit[1]));
    }

    const allowedSlippage = RefConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return 100 * (Number(nd[1]) / Number(nd[2]));
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
    );
  }
}