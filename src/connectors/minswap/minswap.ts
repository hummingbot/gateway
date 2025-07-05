import { Cardano } from '../../chains/cardano/cardano';
import { Data, PrivateKey, TxComplete, UTxO } from '@aiquant/lucid-cardano';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import {
  ADA,
  Asset,
  BlockfrostAdapter,
  NetworkId,
  PoolV1,
} from '@aiquant/minswap-sdk';

import {
  percentRegexp,
  ConfigManagerV2,
} from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

import { MinswapConfig } from './minswap.config';
import { PoolInfo } from '../../schemas/amm-schema';
import { findPoolAddress, isFractionString } from './minswap.utils';

export class Minswap {
  private static _instances: { [name: string]: Minswap };
  public cardano: Cardano;
  public config: MinswapConfig.RootConfig;
  private owner?: PrivateKey;
  public blockfrostAdapter: BlockfrostAdapter;
  // Network information
  private networkName: string;

  private constructor(network: string) {
    this.networkName = network;
    this.config = MinswapConfig.config as MinswapConfig.RootConfig;
    this.cardano = null;
  }

  /** Gets singleton instance of Minswap */
  public static async getInstance(network: string): Promise<Minswap> {
    if (!Minswap._instances) {
      Minswap._instances = {};
    }

    if (!Minswap._instances[network]) {
      const instance = new Minswap(network);
      await instance.init(network);
      Minswap._instances[network] = instance;
    }

    return Minswap._instances[network];
  }

  /** Initializes Minswap instance */
  private async init(network: string) {
    try {
      this.cardano = await Cardano.getInstance(network);

      // Load first wallet if available
      const walletAddress = await this.cardano.getFirstWalletAddress();
      if (walletAddress) {
        this.owner = await this.cardano.getWalletFromAddress(walletAddress);
      }
      this.blockfrostAdapter = new BlockfrostAdapter({
        networkId:
          this.cardano.network === 'preprod'
            ? NetworkId.TESTNET
            : NetworkId.MAINNET,
        blockFrost: new BlockFrostAPI({
          projectId: this.cardano.projectId,
        }),
      });

      logger.info(
        'Minswap initialized' +
          (walletAddress ? ` with wallet: ${walletAddress}` : 'with no wallet'),
      );
    } catch (error) {
      logger.error('Minswap initialization failed:', error);
      throw error;
    }
  }

  /**
   * Gets the allowed slippage percentage from config
   * @returns Slippage as a percentage (e.g., 1.0 for 1%)
   */
  getSlippagePct(): number {
    const allowedSlippage = MinswapConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) {
      slippage = Number(nd[1]) / Number(nd[2]);
    } else {
      logger.error('Failed to parse slippage value:', allowedSlippage);
    }
    return slippage * 100;
  }

  private getPairKey(baseToken: string, quoteToken: string): string {
    return `${baseToken}-${quoteToken}`;
  }

  async findDefaultPool(
    baseToken: string,
    quoteToken: string,
    routeType: 'amm',
  ): Promise<string | null> {
    // Get the network-specific pools
    const network = this.cardano.network;
    const pools = MinswapConfig.getNetworkPools(network, routeType);

    if (!pools) return null;

    const pairKey = this.getPairKey(baseToken, quoteToken);
    const reversePairKey = this.getPairKey(quoteToken, baseToken);

    return pools[pairKey] || pools[reversePairKey] || null;
  }

  async getAmmPoolInfo(poolAddress: string): Promise<PoolInfo> {
    const pool = await this.blockfrostAdapter.getV1PoolById({
      id: poolAddress,
    });
    if (!pool) {
      throw new Error(`Not found PoolState of ID: ${poolAddress}`);
    }

    const getQuantity = (unit) => {
      const found = pool.value.find((v) => v.unit === unit);
      return found ? Number(found.quantity) : 0;
    };

    const baseTokenUnit = pool.assetA; // e.g., 'lovelace'
    const quoteTokenUnit = pool.assetB; // e.g., '29d...d494e'

    const baseTokenAmount = getQuantity(baseTokenUnit);
    const quoteTokenAmount = getQuantity(quoteTokenUnit);

    // Convert to number for price calculation (if not zero)
    const price = await this.blockfrostAdapter.getV1PoolPrice({
      pool: pool,
    });

    return {
      address: poolAddress,
      baseTokenAddress: pool.assetA,
      quoteTokenAddress: pool.assetB,
      feePct: 2,
      price: price[0],
      baseTokenAmount: baseTokenAmount,
      quoteTokenAmount: quoteTokenAmount,
      poolType: 'amm',
      lpMint: {
        address: pool.assetLP,
        decimals: 0,
      },
    };
  }

  /**
   * Get the allowed slippage as a decimal from string or config
   * @param allowedSlippageStr Optional string representation of slippage value
   * @returns A decimal number (e.g., 0.05 for 5%)
   */
  public getAllowedSlippage(allowedSlippageStr?: string): number {
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      return Number(fractionSplit[0]) / Number(fractionSplit[1]);
    }

    // Use the global allowedSlippage setting
    const allowedSlippage = this.config.allowedSlippage;

    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return Number(nd[1]) / Number(nd[2]);

    throw new Error(
      'Encountered a malformed percent string in the config for allowed slippage.',
    );
  }

  public calculateAssetAmount(utxos: UTxO[], asset: string): bigint {
    return utxos.reduce((acc, utxo) => {
      const assetValue = utxo.assets[asset];
      if (assetValue) {
        return acc + BigInt(assetValue); // Ensure addition is performed with BigInt
      }
      return acc;
    }, 0n); // Initialize the accumulator with BigInt zero
  }

  async getPoolData(poolAddress: string) {
    const poolState = await this.blockfrostAdapter.getV1PoolById({
      id: poolAddress,
    });
    if (!poolState) {
      throw new Error(`Not found PoolState of ID: ${poolAddress}`);
    }
    const rawPoolDatum = await this.blockfrostAdapter.getDatumByDatumHash(
      poolState.datumHash,
    );
    const poolDatum = PoolV1.Datum.fromPlutusData(
      this.networkName === 'mainnet' ? NetworkId.MAINNET : NetworkId.TESTNET,
      Data.from(rawPoolDatum),
    );
    return { poolState, poolDatum };
  }
}
