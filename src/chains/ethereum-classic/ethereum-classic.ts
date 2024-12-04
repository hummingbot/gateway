import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { Contract, Transaction, Wallet } from 'ethers';
import { EthereumBase } from '../ethereum/ethereum-base';
import { getEthereumConfig as getEthereumClassicChainConfig } from '../ethereum/ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { Chain as Ethereumish } from '../../services/common-interfaces';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { EVMController } from '../ethereum/evm.controllers';
import { ETCSwapConfig } from '../../connectors/etcswap/etcswap.config';

export class EthereumClassicChain extends EthereumBase implements Ethereumish {
  private static _instances: { [name: string]: EthereumClassicChain };
  private _chain: string;
  private _gasPrice: number;
  private _gasPriceRefreshInterval: number | null;
  private _nativeTokenSymbol: string;
  public controller;

  private constructor(network: string) {
    const config = getEthereumClassicChainConfig('ethereum-classic', network);
    super(
      'ethereum-classic',
      config.network.chainID,
      config.network.nodeURL,
      config.network.tokenListSource,
      config.network.tokenListType,
      config.manualGasPrice,
      config.gasLimitTransaction,
      ConfigManagerV2.getInstance().get('server.nonceDbPath'),
      ConfigManagerV2.getInstance().get('server.transactionDbPath'),
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

  public static getInstance(network: string): EthereumClassicChain {
    if (EthereumClassicChain._instances === undefined) {
      EthereumClassicChain._instances = {};
    }
    if (!(network in EthereumClassicChain._instances)) {
      EthereumClassicChain._instances[network] = new EthereumClassicChain(
        network,
      );
    }

    return EthereumClassicChain._instances[network];
  }

  public static getConnectedInstances(): {
    [name: string]: EthereumClassicChain;
  } {
    return EthereumClassicChain._instances;
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
      this._gasPriceRefreshInterval * 1000,
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

  // in place for mocking
  public get provider() {
    return super.provider;
  }

  getContract(tokenAddress: string, signerOrProvider?: Wallet | Provider) {
    return new Contract(tokenAddress, abi.ERC20Abi, signerOrProvider);
  }

  getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'etcswapLP') {
      spender = ETCSwapConfig.config.etcswapV3NftManagerAddress(this._chain);
    } else if (reqSpender === 'etcswap') {
      spender = ETCSwapConfig.config.etcswapV3SmartOrderRouterAddress(
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
    return super.cancelTxWithGasPrice(wallet, nonce, this._gasPrice * 2);
  }
}
