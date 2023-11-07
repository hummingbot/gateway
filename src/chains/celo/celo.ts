import { logger } from '../../services/logger';
import { Transaction, Wallet } from 'ethers';

import { UbeswapConfig } from '../../connectors/ubeswap/ubeswap.config';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { getCeloConfig } from './celo.config';
import { CeloBase } from './celo.base';
import { Celoish } from '../../services/common-interfaces';
import { Ierc20 } from '@celo/contractkit/lib/generated/IERC20';
import { Erc20Wrapper } from '@celo/contractkit/lib/wrappers/Erc20Wrapper';
import { BigNumber as EthersBigNumber } from '@ethersproject/bignumber/lib/bignumber';
import BigNumber from 'bignumber.js';

export class Celo extends CeloBase implements Celoish {
  private static _instances: { [name: string]: Celo };
  private _gasPrice: number;
  private _nativeTokenSymbol: string;
  private _chain: string;

  private constructor(network: string) {
    const config = getCeloConfig('celo', network);
    super(
      'celo',
      42220,
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

  public static getInstance(network: string): Celo {
    if (Celo._instances === undefined) {
      Celo._instances = {};
    }
    if (!(network in Celo._instances)) {
      Celo._instances[network] = new Celo(network);
    }

    return Celo._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Celo } {
    return Celo._instances;
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

  convertBigInt(amount: BigNumber | EthersBigNumber): EthersBigNumber {
    if (amount instanceof BigNumber) {
      const converted = amount.toFixed();
      return EthersBigNumber.from(converted);
    } else {
      return amount;
    }
  }

  getSpender(reqSpender: string): string {
    let spender: string;
    if (reqSpender === 'ubeswap') {
      spender = UbeswapConfig.config.routerAddress(this._chain);
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

  getContract(tokenAddress: string): Promise<Erc20Wrapper<Ierc20>> {
    return this.kit.contracts.getErc20(tokenAddress);
  }
}
