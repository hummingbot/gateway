import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { Contract, Transaction, Wallet } from 'ethers';
import { EthereumBase } from '../ethereum/ethereum-base';
import { getEthereumConfig as getBinanceSmartChainConfig } from '../ethereum/ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { Chain as Ethereumish } from '../../services/common-interfaces';
import { PancakeSwapConfig } from '../../connectors/pancakeswap/pancakeswap.config';
import { SushiswapConfig } from '../../connectors/sushiswap/sushiswap.config';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { OpenoceanConfig } from '../../connectors/openocean/openocean.config';
import { EVMController } from '../ethereum/evm.controllers';

export class BinanceSmartChain extends EthereumBase implements Ethereumish {
  private static _instances: { [name: string]: BinanceSmartChain };
  private _chain: string;
  private _gasPrice: number;
  private _gasPriceRefreshInterval: number | null;
  private _nativeTokenSymbol: string;
  public controller;

  private constructor(network: string) {
    const config = getBinanceSmartChainConfig('binance-smart-chain', network);
    super(
      'binance-smart-chain',
      config.network.chainID,
      config.network.nodeURL,
      config.network.tokenListSource,
      config.network.tokenListType,
      config.manualGasPrice,
      config.gasLimitTransaction,
      ConfigManagerV2.getInstance().get('server.nonceDbPath'),
      ConfigManagerV2.getInstance().get('server.transactionDbPath')
    );
    this._chain = config.network.name;
    this._nativeTokenSymbol = config.nativeCurrencySymbol;
    this._gasPrice = config.manualGasPrice;
    this._gasPriceRefreshInterval =
      config.network.gasPriceRefreshInterval !== undefined
        ? config.network.gasPriceRefreshInterval
        : null;

    this.updateGasPrice();
    this.controller = EVMController;
  }

  public static getInstance(network: string): BinanceSmartChain {
    if (BinanceSmartChain._instances === undefined) {
      BinanceSmartChain._instances = {};
    }
    if (!(network in BinanceSmartChain._instances)) {
      BinanceSmartChain._instances[network] = new BinanceSmartChain(network);
    }

    return BinanceSmartChain._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: BinanceSmartChain } {
    return BinanceSmartChain._instances;
  }

  /**
   * Automatically update the prevailing gas price on the network from the connected RPC node.
   */
  async updateGasPrice(): Promise<void> {
    if (this._gasPriceRefreshInterval === null) {
      return;
    }

    const gasPrice: number = (await this.provider.getGasPrice()).toNumber();

    this._gasPrice = gasPrice * 1e-9;

    setTimeout(
      this.updateGasPrice.bind(this),
      this._gasPriceRefreshInterval * 1000
    );
  }

  // getters

  public get gasPrice(): number {
    return this._gasPrice;
  }

  public get nativeTokenSymbol(): string {
    return this._nativeTokenSymbol;
  }

  public get chain(): string {
    return this._chain;
  }

  getContract(tokenAddress: string, signerOrProvider?: Wallet | Provider) {
    return new Contract(tokenAddress, abi.ERC20Abi, signerOrProvider);
  }

  getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'pancakeswap') {
      spender = PancakeSwapConfig.config.routerAddress(this._chain);
    } else if (reqSpender === 'pancakeswapLP') {
      spender = PancakeSwapConfig.config.pancakeswapV3NftManagerAddress(
        this._chain
      );
    } else if (reqSpender === 'sushiswap') {
      spender = SushiswapConfig.config.sushiswapRouterAddress(
        'binance-smart-chain',
        this._chain
      );
    } else if (reqSpender === 'openocean') {
      spender = OpenoceanConfig.config.routerAddress(
        'binance-smart-chain',
        this._chain
      );
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
    return super.cancelTxWithGasPrice(wallet, nonce, this._gasPrice * 2);
  }
}
