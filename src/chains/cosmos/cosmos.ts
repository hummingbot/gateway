// import { Cosmosish } from '../../services/common-interfaces';
import fse from 'fs-extra';

import { logger } from '../../services/logger';
import { walletPath } from '../../wallet/utils';

import { CosmosBase } from './cosmos-base';
import { getCosmosConfig } from './cosmos.config';
import { CosmosController } from './cosmos.controllers';
import { isValidCosmosAddress } from './cosmos.validators';

const exampleCosmosPublicKey = 'cosmos000000000000000000000000000000000000000';
// const exampleCosmosPrivateKey = '0000000000000000000000000000000000000000000000000000000000000000';

//   /**
//  * Get a wallet address example for schema documentation
//  */
// export async function getWalletAddressExample(): Promise<string> {
//   if (Cosmos._walletAddressExample) {
//     return Cosmos._walletAddressExample;
//   }

//   const defaultAddress = exampleCosmosPublicKey;
//   try {
//     const foundWallet = await Cosmos.getFirstWalletAddress();
//     if (foundWallet) {
//       Cosmos._walletAddressExample = foundWallet;
//       return foundWallet;
//     }
//     logger.debug('No wallets found for examples in schema, using default.');
//     Cosmos._walletAddressExample = defaultAddress;
//     return defaultAddress;
//   } catch (error) {
//     logger.error(
//       `Error getting Cosmos/Osmosis wallet address for example: ${error.message}`,
//     );
//     return defaultAddress;
//   }
// }

export class Cosmos extends CosmosBase {
  private static _instances: { [name: string]: Cosmos };
  private static _walletAddressExample: string | null = null;
  private _requestCount: number;
  private _metricsLogInterval: number;
  private _metricTimer;
  public controller;
  public gasPrice: number;
  public nativeTokenSymbol: string;
  public chain: string;
  public gasLimitTransaction: number = 200000;

  private constructor(network: string) {
    const config = getCosmosConfig(network);
    super(
      network,
      config.chainName,
      config.network.nodeURL,
      config.gasAdjustment,
      config.feeTier,
      config.manualGasPriceToken,
      config.gasLimitTransaction,
      config.allowedSlippage,
      'cosmos',
      config.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice,
      config.rpcAddressDynamicBaseFee,
      config.manualGasPrice,
    );
    this.chain = network;
    this.nativeTokenSymbol = config.nativeCurrencySymbol;
    this.gasLimitTransaction = config.gasLimitTransaction;
    this.gasPrice = config.manualGasPrice;

    this._requestCount = 0;
    this._metricsLogInterval = 300000; // 5 minutes
    this._metricTimer = setInterval(this.metricLogger.bind(this), this.metricsLogInterval);
    this.controller = CosmosController;
  }

  public static getInstance(network: string): Cosmos {
    if (Cosmos._instances === undefined) {
      Cosmos._instances = {};
    }
    if (!(network in Cosmos._instances)) {
      Cosmos._instances[network] = new Cosmos(network);
    }
    return Cosmos._instances[network];
  }

  public static getConnectedInstances(): { [name: string]: Cosmos } {
    return Cosmos._instances;
  }

  /**
   * Validate Cosmos address format
   * @param address The address to validate
   * @returns The checksummed address if valid
   * @throws Error if the address is invalid
   */
  public static validateAddress(address: string): string {
    try {
      return isValidCosmosAddress(address);
    } catch (error) {
      throw new Error(`Invalid Cosmos address format: ${address}`);
    }
  }

  // Add new method to get first wallet address
  public static async getFirstWalletAddress(): Promise<string | null> {
    const path = `${walletPath}/cosmos`;
    try {
      // Create directory if it doesn't exist
      await fse.ensureDir(path);

      // Get all .json files in the directory
      const files = await fse.readdir(path);
      const walletFiles = files.filter((f) => f.endsWith('.json'));

      if (walletFiles.length === 0) {
        return null;
      }

      // Get the first wallet address (without .json extension)
      const walletAddress = walletFiles[0].slice(0, -5);

      try {
        // Attempt to validate the address
        if (isValidCosmosAddress(walletAddress)) {
          return walletAddress;
        }
      } catch (e) {
        logger.warn(`Invalid Cosmos/Osmosis address found in wallet directory: ${walletAddress}`);
        return null;
      }
    } catch (err) {
      return null;
    }
  }

  /**
   * Get a wallet address example for schema documentation
   */
  public static async getWalletAddressExample(): Promise<string> {
    const defaultAddress = exampleCosmosPublicKey;
    try {
      const foundWallet = await Cosmos.getFirstWalletAddress();
      if (foundWallet) {
        Cosmos._walletAddressExample = foundWallet;
        return foundWallet;
      }
      logger.debug('No wallets found for examples in schema, using default.');
      Cosmos._walletAddressExample = defaultAddress;
      return defaultAddress;
    } catch (error) {
      logger.error(`Error getting Cosmos/Osmosis wallet address for example: ${error.message}`);
      return defaultAddress;
    }
  }

  public requestCounter(msg: any): void {
    if (msg.action === 'request') this._requestCount += 1;
  }

  public metricLogger(): void {
    logger.info(this.requestCount + ' request(s) sent in last ' + this.metricsLogInterval / 1000 + ' seconds.');
    this._requestCount = 0; // reset
  }

  // public get gasPrice(): number {
  //   return this._gasPrice;
  // }

  // public get chain(): string {
  //   return this._chain;
  // }

  // public get nativeTokenSymbol(): string {
  //   return this._nativeTokenSymbol;
  // }

  public get requestCount(): number {
    return this._requestCount;
  }

  public get metricsLogInterval(): number {
    return this._metricsLogInterval;
  }

  async close() {
    clearInterval(this._metricTimer);
    if (this.chain in Cosmos._instances) {
      delete Cosmos._instances[this.chain];
    }
  }
}
