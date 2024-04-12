import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { BigNumber, Contract, Transaction, Wallet } from 'ethers';
import { EthereumBase } from './ethereum-base';
import { getEthereumConfig } from './ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
// import { throttleRetryWrapper } from '../../services/retry';
import { Chain as Ethereumish } from '../../services/common-interfaces';
import { EVMController } from './evm.controllers';

import { UniswapConfig } from '../../connectors/uniswap/uniswap.config';
import { Perp } from '../../connectors/perp/perp';
import { SushiswapConfig } from '../../connectors/sushiswap/sushiswap.config';
import { OpenoceanConfig } from '../../connectors/openocean/openocean.config';
import { BalancerConfig } from '../../connectors/balancer/balancer.config';
import { Curve } from '../../connectors/curve/curve';
import { CarbonConfig } from '../../connectors/carbon/carbon.config';
import { BalancerConfig } from '../../connectors/balancer/balancer.config';

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

  private constructor(network: string) {
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
      ConfigManagerV2.getInstance().get('server.transactionDbPath')
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
      this.metricsLogInterval
    );
    this.controller = EVMController;
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
        ' seconds.'
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
   * Automatically update the prevailing gas price on the network.
   *
   * Otherwise, it'll obtain the prevailing gas price from the connected
   * ETH node.
   */
  async updateGasPrice(): Promise<void> {
    if (this._gasPriceRefreshInterval === null) {
      return;
    }

    const gasPrice = await this.getGasPriceFromEthereumNode();
    if (gasPrice !== null) {
      this._gasPrice = gasPrice;
    } else {
      logger.info('gasPrice is unexpectedly null.');
    }

    setTimeout(
      this.updateGasPrice.bind(this),
      this._gasPriceRefreshInterval * 1000
    );
  }

  /**
   * Get the base gas fee from and the current max priority fee from the Ethereum
   * node, and add them together.
   */
  async getGasPriceFromEthereumNode(): Promise<number> {
    const baseFee: BigNumber = await this.provider.getGasPrice();
    let priorityFee: BigNumber = BigNumber.from('0');
    if (this._chain === 'mainnet') {
      priorityFee = BigNumber.from(
        await this.provider.send('eth_maxPriorityFeePerGas', [])
      );
    }
    return baseFee.add(priorityFee).toNumber() * 1e-9;
  }

  getContract(
    tokenAddress: string,
    signerOrProvider?: Wallet | Provider
  ): Contract {
    return tokenAddress === MKR_ADDRESS
      ? new Contract(tokenAddress, abi.MKRAbi, signerOrProvider)
      : new Contract(tokenAddress, abi.ERC20Abi, signerOrProvider);
  }

  // TODO Check the possibility to use something similar for CLOB/Solana/Serum
  // Use the following link: https://hummingbot.org/developers/gateway/building-gateway-connectors/#6-add-connector-to-spender-list
  getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'uniswap') {
      spender = UniswapConfig.config.uniswapV3SmartOrderRouterAddress(
        this._chain
      );
    } else if (reqSpender === 'sushiswap') {
      spender = SushiswapConfig.config.sushiswapRouterAddress(
        this.chainName,
        this._chain
      );
    } else if (reqSpender === 'uniswapLP') {
      spender = UniswapConfig.config.uniswapV3NftManagerAddress(this._chain);
    } else if (reqSpender === 'carbonamm') {
      spender = CarbonConfig.config.carbonContractsConfig(
        'ethereum',
        this._chain
      ).carbonControllerAddress;
    } else if (reqSpender === 'perp') {
      const perp = Perp.getInstance(this._chain, 'optimism');
      if (!perp.ready()) {
        perp.init();
        throw Error('Perp curie not ready');
      }
      spender = perp.perp.contracts.vault.address;
    } else if (reqSpender === 'openocean') {
      spender = OpenoceanConfig.config.routerAddress('ethereum', this._chain);
    } else if (reqSpender === 'balancer') {
      spender = BalancerConfig.config.balancerV2VaultAddress(
        this.chainName,
        this._chain
      );
    } else if (reqSpender === 'curve') {
      const curve = Curve.getInstance('ethereum', this._chain);
      if (!curve.ready()) {
        curve.init();
        throw Error('Curve not ready');
      }
      spender = curve.router;
    } else if (reqSpender === 'balancer') {
      spender = BalancerConfig.config.routerAddress(this._chain);
    } else {
      spender = reqSpender;
    }
    return spender;
  }

  // cancel transaction
  async cancelTx(wallet: Wallet, nonce: number): Promise<Transaction> {
    logger.info(
      'Canceling any existing transaction(s) with nonce number ' + nonce + '.'
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
