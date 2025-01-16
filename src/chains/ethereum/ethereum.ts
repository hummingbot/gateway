import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { BigNumber, Contract, Transaction, Wallet } from 'ethers';
import { EthereumBase } from './ethereum-base';
import { getEthereumConfig } from './ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { Chain as Ethereumish } from '../../services/common-interfaces';
import { EVMController } from './evm.controllers';

import { UniswapConfig } from '../../connectors/uniswap/uniswap.config';

// MKR does not match the ERC20 perfectly so we need to use a separate ABI.
const MKR_ADDRESS = '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2';

// See: https://docs.infura.io/infura/networks/ethereum/json-rpc-methods/eth_feehistory
// interface EthFeeHistoryResponse {
//   baseFeePerGas: string[];
//   gasUsedRatio: number[];
//   oldestBlock: string;
// }

export class Ethereum extends EthereumBase implements Ethereumish {
  private static _instances: { [name: string]: Ethereum };
  private _gasPrice: number;
  private _gasPriceRefreshInterval: number | null;
  private _nativeTokenSymbol: string;
  private _chain: string;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;
  public controller;

  private static lastGasPriceEstimate: {
    timestamp: number;
    price: number;
  } | null = null;
  private static GAS_PRICE_CACHE_MS = 10000; // 10 second cache

  private constructor(network: string) {
    logger.info(`Initializing Ethereum connector for network: ${network}`);
    const config = getEthereumConfig('ethereum', network);
    super(
      'ethereum',
      config.network.chainID,
      config.network.nodeURL,
      config.network.tokenListSource,
      config.network.tokenListType,
      config.manualGasPrice,
      config.gasLimitTransaction,
      ConfigManagerV2.getInstance().get('server.nonceDbPath'),
      ConfigManagerV2.getInstance().get('server.transactionDbPath'),
    );
    this._chain = network;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;
    this._gasPrice = config.manualGasPrice;
    this._gasPriceRefreshInterval =
      config.network.gasPriceRefreshInterval !== undefined
        ? config.network.gasPriceRefreshInterval
        : null;

    this.updateGasPrice();

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes

    this.onDebugMessage(this.requestCounter.bind(this));
    this._metricTimer = setInterval(
      this.metricLogger.bind(this),
      this.metricsLogInterval,
    );
    this.controller = EVMController;
    
    // Load tokens immediately
    this.loadTokens(
      config.network.tokenListSource,
      config.network.tokenListType
    ).catch(error => {
      logger.error(`Failed to load tokens in constructor: ${error.message}`);
    });
  }

  public static getInstance(network: string): Ethereum {
    if (Ethereum._instances === undefined) {
      Ethereum._instances = {};
    }
    if (!(network in Ethereum._instances)) {
      Ethereum._instances[network] = new Ethereum(network);
    }

    return Ethereum._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Ethereum } {
    return Ethereum._instances;
  }

  public requestCounter(msg: any): void {
    if (msg.action === 'request') this._requestCount += 1;
  }

  public metricLogger(): void {
    logger.info(
      this.requestCount +
        ' request(s) sent in last ' +
        this.metricsLogInterval / 1000 +
        ' seconds.',
    );
    this._requestCount = 0; // reset
  }

  // getters
  public get gasPrice(): number {
    return this._gasPrice;
  }

  public get chain(): string {
    return this._chain;
  }

  public get nativeTokenSymbol(): string {
    return this._nativeTokenSymbol;
  }

  public get requestCount(): number {
    return this._requestCount;
  }

  public get metricsLogInterval(): number {
    return this._metricsLogInterval;
  }

  // in place for mocking
  public get provider() {
    return super.provider;
  }

  /**
   * Estimates the current gas price with caching
   * Returns the gas price in GWEI
   */
  public async estimateGasPrice(): Promise<number> {
    // Check cache first
    if (
      Ethereum.lastGasPriceEstimate && 
      Date.now() - Ethereum.lastGasPriceEstimate.timestamp < Ethereum.GAS_PRICE_CACHE_MS
    ) {
      return Ethereum.lastGasPriceEstimate.price;
    }

    try {
      const baseFee: BigNumber = await this.provider.getGasPrice();
      let priorityFee: BigNumber = BigNumber.from('0');

      // Only get priority fee for mainnet
      if (this._chain === 'mainnet') {
        priorityFee = BigNumber.from(
          await this.provider.send('eth_maxPriorityFeePerGas', [])
        );
      }

      const totalFeeGwei = baseFee.add(priorityFee).toNumber() * 1e-9;
      
      // Update both cache and instance gas price
      Ethereum.lastGasPriceEstimate = {
        timestamp: Date.now(),
        price: totalFeeGwei
      };
      this._gasPrice = totalFeeGwei;

      logger.info(`[GAS PRICE] Estimated: ${totalFeeGwei} GWEI`);

      return totalFeeGwei;

    } catch (error: any) {
      logger.error(`Failed to estimate gas price: ${error.message}`);
      return this._gasPrice; // Return existing gas price as fallback
    }
  }

  /**
   * Automatically update the prevailing gas price on the network.
   */
  async updateGasPrice(): Promise<void> {
    if (this._gasPriceRefreshInterval === null) {
      return;
    }

    // Use estimateGasPrice instead of getGasPriceFromEthereumNode
    const gasPrice = await this.estimateGasPrice();
    if (gasPrice !== null) {
      this._gasPrice = gasPrice;
    } else {
      logger.info('gasPrice is unexpectedly null.');
    }

    setTimeout(
      this.updateGasPrice.bind(this),
      this._gasPriceRefreshInterval * 1000,
    );
  }

  getContract(
    tokenAddress: string,
    signerOrProvider?: Wallet | Provider,
  ): Contract {
    return tokenAddress === MKR_ADDRESS
      ? new Contract(tokenAddress, abi.MKRAbi, signerOrProvider)
      : new Contract(tokenAddress, abi.ERC20Abi, signerOrProvider);
  }

  getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'uniswap') {
      spender = UniswapConfig.config.uniswapV3SmartOrderRouterAddress(
        this.chainName,
        this._chain,
      );
    } else {
      spender = reqSpender;
    }
    return spender;
  }

  // cancel transaction
  async cancelTx(wallet: Wallet, nonce: number): Promise<Transaction> {
    logger.info(
      'Canceling any existing transaction(s) with nonce number ' + nonce + '.',
    );
    return this.cancelTxWithGasPrice(wallet, nonce, this._gasPrice * 2);
  }

  async close() {
    await super.close();
    clearInterval(this._metricTimer);
    if (this._chain in Ethereum._instances) {
      delete Ethereum._instances[this._chain];
    }
  }
}
