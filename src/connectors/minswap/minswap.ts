import { Data, PrivateKey, TxComplete, UTxO } from '@aiquant/lucid-cardano';
import { ADA, Asset, BlockfrostAdapter, NetworkId, PoolV1 } from '@aiquant/minswap-sdk';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';

import { Cardano } from '../../chains/cardano/cardano';
import { PoolInfo } from '../../schemas/amm-schema';
import { percentRegexp, ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

import { MinswapConfig } from './minswap.config';
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
        networkId: this.cardano.network === 'preprod' ? NetworkId.TESTNET : NetworkId.MAINNET,
        blockFrost: new BlockFrostAPI({
          projectId: this.cardano.projectId,
        }),
      });

      logger.info('Minswap initialized' + (walletAddress ? ` with wallet: ${walletAddress}` : 'with no wallet'));
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

  // private getPairKey(baseToken: string, quoteToken: string): string {
  //   return `${baseToken}-${quoteToken}`;
  // }

  // async findDefaultPool(routeType: 'amm'): Promise<string | null> {
  //   // Get the network-specific pools
  //   const network = this.cardano.network;
  //   const pools = MinswapConfig.getNetworkPools(network, routeType);

  //   if (!pools) return null;
  //   // For simplicity, return the first pool in the list
  //   const firstPoolAddress = Object.values(pools)[0];
  //   return firstPoolAddress || null;
  // }

  /**
   * Find a default pool for a token pair in either AMM or CLMM
   */
  public async findDefaultPool(baseToken: string, quoteToken: string, poolType: 'amm'): Promise<string | null> {
    try {
      logger.info(`Finding ${poolType} pool for ${baseToken}-${quoteToken} on ${this.networkName}`);

      // Resolve token symbols if addresses are provided
      const baseTokenInfo = this.cardano.getTokenBySymbol(baseToken);
      const quoteTokenInfo = this.cardano.getTokenBySymbol(quoteToken);

      if (!baseTokenInfo || !quoteTokenInfo) {
        logger.warn(`Token not found: ${!baseTokenInfo ? baseToken : quoteToken}`);
        return null;
      }

      logger.info(
        `Resolved tokens: ${baseTokenInfo.symbol} (${baseTokenInfo.address}), ${quoteTokenInfo.symbol} (${quoteTokenInfo.address})`,
      );

      // Use PoolService to find pool by token pair
      const { PoolService } = await import('../../services/pool-service');
      const poolService = PoolService.getInstance();

      const pool = await poolService.getPool(
        'minswap',
        this.networkName,
        poolType,
        baseTokenInfo.symbol,
        quoteTokenInfo.symbol,
      );

      if (!pool) {
        logger.warn(
          `No ${poolType} pool found for ${baseTokenInfo.symbol}-${quoteTokenInfo.symbol} on Uniswap network ${this.networkName}`,
        );
        return null;
      }

      logger.info(`Found ${poolType} pool at ${pool.address}`);
      return pool.address;
    } catch (error) {
      logger.error(`Error finding default pool: ${error.message}`);
      if (error.stack) {
        logger.debug(`Stack trace: ${error.stack}`);
      }
      return null;
    }
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

    throw new Error('Encountered a malformed percent string in the config for allowed slippage.');
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
    const rawPoolDatum = await this.blockfrostAdapter.getDatumByDatumHash(poolState.datumHash);
    const poolDatum = PoolV1.Datum.fromPlutusData(
      this.networkName === 'mainnet' ? NetworkId.MAINNET : NetworkId.TESTNET,
      Data.from(rawPoolDatum),
    );
    return { poolState, poolDatum };
  }
}
