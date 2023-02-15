import abi from '../ethereum/ethereum.abi.json';
import { logger } from '../../services/logger';
import { Contract, Transaction, Wallet } from 'ethers';
import { XdcBase } from './xdc.base';
import { getEthereumConfig as getXdcConfig } from '../ethereum/ethereum.config';
import { Provider } from '@ethersproject/abstract-provider';
import { XdcswapConfig } from '../../connectors/xdcswap/xdcswap.config';
import { Xdcish } from '../../services/common-interfaces';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { walletPath } from '../../services/base';
import { convertXdcAddressToEthAddress } from '../../services/wallet/wallet.controllers';
import fse from 'fs-extra';
import { ConfigManagerCertPassphrase } from '../../services/config-manager-cert-passphrase';
import { XsswapConfig } from '../../connectors/xsswap/xsswap.config';

export class Xdc extends XdcBase implements Xdcish {
  private static _instances: { [name: string]: Xdc };
  private _gasPrice: number;
  private _nativeTokenSymbol: string;
  private _chain: string;

  private constructor(network: string) {
    const config = getXdcConfig('xdc', network);
    super(
      'xdc',
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
  }

  public static getInstance(network: string): Xdc {
    if (Xdc._instances === undefined) {
      Xdc._instances = {};
    }
    if (!(network in Xdc._instances)) {
      Xdc._instances[network] = new Xdc(network);
    }

    return Xdc._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Xdc } {
    return Xdc._instances;
  }

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
    if (reqSpender === 'xdcswap') {
      spender = XdcswapConfig.config.routerAddress(this._chain);
    } else if (reqSpender === 'xsswap') {
      spender = XsswapConfig.config.routerAddress(this._chain);
    } else {
      spender = convertXdcAddressToEthAddress(reqSpender);
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

  // override
  async getWallet(address: string): Promise<Wallet> {
    const path = `${walletPath}/${this.chainName}`;

    const encryptedPrivateKey: string = await fse.readFile(
      `${path}/${convertXdcAddressToEthAddress(address)}.json`,
      'utf8'
    );

    const passphrase = ConfigManagerCertPassphrase.readPassphrase();
    if (!passphrase) {
      throw new Error('missing passphrase');
    }
    return await this.decrypt(encryptedPrivateKey, passphrase);
  }

  async close() {
    await super.close();
    if (this._chain in Xdc._instances) {
      delete Xdc._instances[this._chain];
    }
  }
}
