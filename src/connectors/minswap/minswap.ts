import { Cardano } from '../../chains/cardano/cardano';
import { Data, PrivateKey } from '@vespr-wallet/lucid-cardano';
import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { BlockfrostAdapter, NetworkId } from '@aiquant/minswap-sdk';

import {
  percentRegexp,
  ConfigManagerV2,
} from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

import { MinswapConfig } from './minswap.config';
import { PoolInfo } from '../../schemas/amm-schema';

export class Minswap {
  private static _instances: { [name: string]: Minswap };
  public cardano: Cardano;
  public config: MinswapConfig.NetworkConfig;
  private owner?: PrivateKey;
  public blockfrostAdapter: BlockfrostAdapter;

  private constructor() {
    this.config =
      MinswapConfig.config as unknown as MinswapConfig.NetworkConfig;
    this.cardano = null;
  }

  /** Gets singleton instance of Minswap */
  public static async getInstance(network: string): Promise<Minswap> {
    if (!Minswap._instances) {
      Minswap._instances = {};
    }

    if (!Minswap._instances[network]) {
      const instance = new Minswap();
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
      address: pool.address,
      baseTokenAddress: pool.assetA,
      quoteTokenAddress: pool.assetB,
      feePct: 2,
      price: price[0],
      baseTokenAmount: baseTokenAmount,
      quoteTokenAmount: quoteTokenAmount,
      poolType: 'amm',
      lpMint: {
        address: pool.address,
        decimals: 0,
      },
    };
  }
}
