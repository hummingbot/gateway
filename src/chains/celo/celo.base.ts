import {
  BigNumber as EthersBigNumber,
  providers,
  Transaction,
  utils,
  Wallet,
} from 'ethers';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { rootPath } from '../../paths';
import { TokenListType, TokenValue, walletPath } from '../../services/base';
import { EVMNonceManager } from '../../evm/evm.nonce';
import NodeCache from 'node-cache';
import { EvmTxStorage } from '../../evm/evm.tx-storage';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { logger } from '../../services/logger';
import { ReferenceCountingCloseable } from '../../services/refcounting-closeable';
import { newKit } from '@celo/contractkit';
import { ContractKit } from '@celo/contractkit/lib/kit';
import {
  CeloWallet,
  StaticCeloProvider,
} from '@celo-tools/celo-ethers-wrapper';
import { Ierc20 } from '@celo/contractkit/lib/generated/IERC20';
import { Erc20Wrapper } from '@celo/contractkit/lib/wrappers/Erc20Wrapper';
import { TransactionResult } from '@celo/connect';
import { StableTokenWrapper } from '@celo/contractkit/lib/wrappers/StableTokenWrapper';
import { GoldTokenWrapper } from '@celo/contractkit/lib/wrappers/GoldTokenWrapper';
import { decryptJsonWallet } from '@ethersproject-xdc/json-wallets';

// information about an Ethereum token
export interface TokenInfo {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export type NewBlockHandler = (bn: number) => void;

export type NewDebugMsgHandler = (msg: any) => void;

export class CeloBase {
  private _provider;
  protected tokenList: TokenInfo[] = [];
  private _tokenMap: Record<string, TokenInfo> = {};
  // there are async values set in the constructor
  private _ready: boolean = false;
  private _initializing: boolean = false;
  public chainName;
  public chainId;
  public rpcUrl;
  public gasPriceConstant;
  private _gasLimitTransaction;
  public tokenListSource: string;
  public tokenListType: TokenListType;
  public cache: NodeCache;
  private readonly _refCountingHandle: string;
  private readonly _nonceManager: EVMNonceManager;
  private readonly _txStorage: EvmTxStorage;
  protected kit: ContractKit;

  constructor(
    chainName: string,
    chainId: number,
    rpcUrl: string,
    tokenListSource: string,
    tokenListType: TokenListType,
    gasPriceConstant: number,
    gasLimitTransaction: number,
    nonceDbPath: string,
    transactionDbPath: string,
  ) {
    this.chainName = chainName;
    this.chainId = chainId;
    this.rpcUrl = rpcUrl;
    this.gasPriceConstant = gasPriceConstant;
    this.tokenListSource = tokenListSource;
    this.tokenListType = tokenListType;

    this._refCountingHandle = ReferenceCountingCloseable.createHandle();
    this._nonceManager = new EVMNonceManager(
      chainName,
      chainId,
      this.resolveDBPath(nonceDbPath),
    );
    this._nonceManager.declareOwnership(this._refCountingHandle);
    this.cache = new NodeCache({ stdTTL: 3600 }); // set default cache ttl to 1hr
    this._gasLimitTransaction = gasLimitTransaction;
    this._txStorage = EvmTxStorage.getInstance(
      this.resolveDBPath(transactionDbPath),
      this._refCountingHandle,
    );
    this._txStorage.declareOwnership(this._refCountingHandle);
    this.kit = newKit(rpcUrl);
    this._provider = new StaticCeloProvider(rpcUrl);
  }

  ready(): boolean {
    return this._ready;
  }

  public get provider() {
    return this._provider;
  }

  public get gasLimitTransaction() {
    return this._gasLimitTransaction;
  }

  public resolveDBPath(oldPath: string): string {
    if (oldPath.charAt(0) === '/') return oldPath;
    const dbDir: string = path.join(rootPath(), 'db/');
    fse.mkdirSync(dbDir, { recursive: true });
    return path.join(dbDir, oldPath);
  }

  public events() {
    this._provider?._events.map(function (event) {
      return [event.tag];
    });
  }

  public onNewBlock(func: NewBlockHandler) {
    this._provider.on('block', func);
  }

  public onDebugMessage(func: NewDebugMsgHandler) {
    this._provider.on('debug', func);
  }

  async init(): Promise<void> {
    if (!this.ready() && !this._initializing) {
      this._initializing = true;
      await this._nonceManager.init(
        async (address) => await this.provider.getTransactionCount(address),
      );
      await this.loadTokens(this.tokenListSource, this.tokenListType);
      this._ready = true;
      this._initializing = false;
    }
    return;
  }

  async loadTokens(
    tokenListSource: string,
    tokenListType: TokenListType,
  ): Promise<void> {
    this.tokenList = await this.getTokenList(tokenListSource, tokenListType);
    // Only keep tokens in the same chain
    this.tokenList = this.tokenList.filter(
      (token: TokenInfo) => token.chainId === this.chainId,
    );
    if (this.tokenList) {
      this.tokenList.forEach(
        (token: TokenInfo) => (this._tokenMap[token.symbol] = token),
      );
    }
  }

  // returns a Tokens for a given list source and list type
  async getTokenList(
    tokenListSource: string,
    tokenListType: TokenListType,
  ): Promise<TokenInfo[]> {
    let tokens;
    if (tokenListType === 'URL') {
      ({
        data: { tokens },
      } = await axios.get(tokenListSource));
    } else {
      ({ tokens } = JSON.parse(await fs.readFile(tokenListSource, 'utf8')));
    }
    tokens.forEach(
      (token: TokenInfo) => (token.symbol = token.symbol.toUpperCase()),
    );
    return tokens;
  }

  public get nonceManager() {
    return this._nonceManager;
  }

  public get txStorage(): EvmTxStorage {
    return this._txStorage;
  }

  // ethereum token lists are large. instead of reloading each time with
  // getTokenList, we can read the stored tokenList value from when the
  // object was initiated.
  public get storedTokenList(): TokenInfo[] {
    return Object.values(this._tokenMap);
  }

  // return the Token object for a symbol
  getTokenForSymbol(symbol: string): TokenInfo | null {
    return this._tokenMap[symbol] ? this._tokenMap[symbol] : null;
  }

  getUserAccount(privateKey: string) {
    return this.kit.web3.eth.accounts.privateKeyToAccount(privateKey);
  }

  getWalletFromPrivateKey(privateKey: string): Wallet {
    const provider = new StaticCeloProvider(this.rpcUrl);
    const account = this.getUserAccount(privateKey);
    this.kit.addAccount(privateKey);
    this.kit.defaultAccount = account.address;
    return new CeloWallet(privateKey, provider);
  }
  // returns Wallet for an address
  // TODO: Abstract-away into base.ts
  async getWallet(address: string): Promise<Wallet> {
    const path = `${walletPath}/${this.chainName}`;

    const encryptedPrivateKey: string = await fse.readFile(
      `${path}/${address}.json`,
      'utf8',
    );

    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }
    return await this.decrypt(encryptedPrivateKey, passphrase);
  }

  encrypt(privateKey: string, password: string): Promise<string> {
    const wallet = this.getWalletFromPrivateKey(privateKey);
    return wallet.encrypt(password);
  }

  async decrypt(
    encryptedPrivateKey: string,
    password: string,
  ): Promise<Wallet> {
    const decipher = await decryptJsonWallet(encryptedPrivateKey, password);
    return this.getWalletFromPrivateKey(decipher.privateKey);
  }

  convertBigInt(amount: BigNumber | EthersBigNumber): EthersBigNumber {
    if (amount instanceof BigNumber) {
      const converted = amount.toFixed();
      return EthersBigNumber.from(converted);
    }
    return amount;
  }

  // returns the Native balance, convert BigNumber to string
  async getNativeBalance(wallet: Wallet): Promise<TokenValue> {
    const balance = await wallet.getBalance();
    return { value: balance, decimals: 18 };
  }

  // returns the balance for an ERC-20 token
  async getERC20Balance(
    contract: Erc20Wrapper<Ierc20>,
    wallet: Wallet,
    decimals: number,
  ): Promise<TokenValue> {
    logger.info('Requesting balance for owner ' + wallet.address + '.');
    const balance = await contract.balanceOf(wallet.address);
    const result = this.convertBigInt(balance);
    logger.info(
      `Raw balance of ${contract.address} for ` +
        `${wallet.address}: ${result.toString()}`,
    );
    return { value: result, decimals: decimals };
  }

  // returns the allowance for an ERC-20 token
  async getERC20Allowance(
    contract: Erc20Wrapper<Ierc20>,
    wallet: Wallet,
    spender: string,
    decimals: number,
  ): Promise<TokenValue> {
    logger.info(
      `Requesting spender: ${spender}, allowance for owner: ${wallet.address}`,
    );
    const allowance = await contract.allowance(wallet.address, spender);
    const result = this.convertBigInt(allowance);
    return { value: result, decimals: decimals };
  }

  // returns an ethereum TransactionResponse for a txHash.
  async getTransaction(txHash: string): Promise<providers.TransactionResponse> {
    return this._provider.getTransaction(txHash);
  }

  // caches transaction receipt once they arrive
  cacheTransactionReceipt(tx: providers.TransactionReceipt) {
    this.cache.set(tx.transactionHash, tx); // transaction hash is used as cache key since it is unique enough
  }

  // returns an ethereum TransactionReceipt for a txHash if the transaction has been mined.
  async getTransactionReceipt(
    txHash: string,
  ): Promise<providers.TransactionReceipt | null> {
    if (this.cache.keys().includes(txHash)) {
      // If it's in the cache, return the value in cache, whether it's null or not
      return this.cache.get(txHash) as providers.TransactionReceipt;
    } else {
      // If it's not in the cache,
      const fetchedTxReceipt =
        await this._provider.getTransactionReceipt(txHash);

      this.cache.set(txHash, fetchedTxReceipt); // Cache the fetched receipt, whether it's null or not

      if (!fetchedTxReceipt) {
        this._provider.once(txHash, this.cacheTransactionReceipt.bind(this));
      }

      return fetchedTxReceipt;
    }
  }

  // adds allowance by spender to transfer the given amount of Token
  async approveERC20(
    contract: Erc20Wrapper<Ierc20>,
    wallet: Wallet,
    spender: string,
    amount: BigNumber | EthersBigNumber,
  ): Promise<TransactionResult> {
    const finalAmount = this.convertBigInt(amount).toString();
    logger.info(
      `Approve for spender: ${spender}, allowance: ${finalAmount} for owner: ${wallet.address}`,
    );
    return contract
      .approve(spender, finalAmount)
      .send({ from: wallet.address });
  }

  async approveCelo(
    contract: StableTokenWrapper | GoldTokenWrapper,
    wallet: Wallet,
    spender: string,
    amount: BigNumber | EthersBigNumber,
  ): Promise<TransactionResult> {
    const finalAmount = this.convertBigInt(amount).toString();
    logger.info(
      `Approve for spender: ${spender}, allowance: ${finalAmount} for owner: ${wallet.address}`,
    );
    return contract
      .approve(spender, finalAmount)
      .send({ from: wallet.address });
  }

  async getCeloTokenWrapper(
    tokenName: string,
  ): Promise<StableTokenWrapper | GoldTokenWrapper | undefined> {
    const wrappers = await this.kit.celoTokens.getWrappers();
    const converted = tokenName.toUpperCase();
    let token;
    if (wrappers) {
      if (converted === 'CELO') {
        token = await wrappers.CELO;
      }
      if (converted === 'CUSD') {
        token = await wrappers.cUSD;
      }
      if (converted === 'CEUR') {
        token = await wrappers.cEUR;
      }
    }
    return token;
  }

  public getTokenBySymbol(tokenSymbol: string): TokenInfo | undefined {
    const token = this.tokenList.find(
      (token: TokenInfo) =>
        tokenSymbol.toUpperCase() === token.symbol.toUpperCase() &&
        token.chainId === this.chainId,
    );
    return token;
  }

  // returns the current block number
  async getCurrentBlockNumber(): Promise<number> {
    return this._provider.getBlockNumber();
  }

  // cancel transaction
  async cancelTxWithGasPrice(
    wallet: Wallet,
    nonce: number,
    gasPrice: number,
  ): Promise<Transaction> {
    return this.nonceManager.provideNonce(
      nonce,
      wallet.address,
      async (nextNonce) => {
        const tx = {
          from: wallet.address,
          to: wallet.address,
          value: utils.parseEther('0'),
          nonce: nextNonce,
          gasPrice: gasPrice * 1e9,
        };
        try {
          const response = await wallet.sendTransaction(tx);
          logger.info(response);
          return response;
        } catch (err) {
          logger.error(`Exception during cancel: ${err}`);
          return {};
        }
      },
    );
  }

  /**
   * Get the base gas fee and the current max priority fee from the EVM
   * node, and add them together.
   */
  async getGasPrice(): Promise<number | null> {
    if (!this.ready) {
      await this.init();
    }
    const feeData: providers.FeeData = await this._provider.getFeeData();
    if (feeData.gasPrice !== null && feeData.maxPriorityFeePerGas !== null) {
      return (
        feeData.gasPrice.add(feeData.maxPriorityFeePerGas).toNumber() * 1e-9
      );
    } else {
      return null;
    }
  }

  async close() {
    await this._nonceManager.close(this._refCountingHandle);
    await this._txStorage.close(this._refCountingHandle);
  }
}
