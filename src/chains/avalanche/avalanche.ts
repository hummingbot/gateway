import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { Contract, Transaction, Wallet } from 'ethers';
import { EthereumBase } from '../ethereum/ethereum-base';
import { getEthereumConfig as getAvalancheConfig } from '../ethereum/ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { TraderjoeConfig } from '../../connectors/traderjoe/traderjoe.config';
import { PangolinConfig } from '../../connectors/pangolin/pangolin.config';
import { OpenoceanConfig } from '../../connectors/openocean/openocean.config';
import { Ethereumish } from '../../services/common-interfaces';
import { SushiswapConfig } from '../../connectors/sushiswap/sushiswap.config';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { EVMController } from '../ethereum/evm.controllers';
import { Curve } from '../../connectors/curve/curve';

export class Avalanche extends EthereumBase implements Ethereumish {
  private static _instances: { [name: string]: Avalanche };
  private _gasPrice: number;
  private _gasPriceRefreshInterval: number | null;
  private _nativeTokenSymbol: string;
  private _chain: string;
  public controller;

  private constructor(network: string) {
    const config = getAvalancheConfig('avalanche', network);
    super(
      'avalanche',
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

  public static getInstance(network: string): Avalanche {
    if (Avalanche._instances === undefined) {
      Avalanche._instances = {};
    }
    if (!(network in Avalanche._instances)) {
      Avalanche._instances[network] = new Avalanche(network);
    }

    return Avalanche._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Avalanche } {
    return Avalanche._instances;
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
    if (reqSpender === 'pangolin') {
      spender = PangolinConfig.config.routerAddress(this._chain);
    } else if (reqSpender === 'openocean') {
      spender = OpenoceanConfig.config.routerAddress('avalanche', this._chain);
    } else if (reqSpender === 'traderjoe') {
      spender = TraderjoeConfig.config.routerAddress(this._chain);
    } else if (reqSpender === 'sushiswap') {
      spender = SushiswapConfig.config.sushiswapRouterAddress(
        'avalanche',
        this._chain
      );
    } else if (reqSpender === 'curve') {
      const curve = Curve.getInstance('ethereum', this._chain);
      if (!curve.ready()) {
        curve.init();
        throw Error('Curve not ready');
      }
      spender = curve.router;
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

  /**
   * Automatically update the prevailing gas price on the network.
   */
  async updateGasPrice(): Promise<void> {
    if (this._gasPriceRefreshInterval === null) {
      return;
    }

    const gasPrice = await this.getGasPrice();
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

  async close() {
    await super.close();
    if (this._chain in Avalanche._instances) {
      delete Avalanche._instances[this._chain];
    }
  }
}
