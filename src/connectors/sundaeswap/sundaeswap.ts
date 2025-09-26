// Monkey-patch Math.pow to support BigInt when both arguments are BigInts.
const originalMathPow = Math.pow;
Math.pow = function (base, exponent) {
  if (typeof base === 'bigint' && typeof exponent === 'bigint') {
    return base ** exponent; // Use BigInt exponentiation operator.
  }
  return originalMathPow(base, exponent);
};

import { PrivateKey, UTxO } from '@aiquant/lucid-cardano';
import { IPoolDataAsset, QueryProviderSundaeSwap, TSupportedNetworks } from '@aiquant/sundaeswap-core';

import { Cardano } from '../../chains/cardano/cardano';
import { PoolInfo } from '../../schemas/amm-schema';
import { percentRegexp, ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

import { SundaeswapConfig } from './sundaeswap.config';
import { isFractionString } from './sundaeswap.utils';

export class Sundaeswap {
  private static _instances: { [name: string]: Sundaeswap };
  public cardano: Cardano;
  public config: SundaeswapConfig.RootConfig;
  private owner?: PrivateKey;
  // Network information
  private networkName: string;

  private constructor(network: string) {
    this.networkName = network;
    this.config = SundaeswapConfig.config as SundaeswapConfig.RootConfig;
    this.cardano = null;
  }

  /** Gets singleton instance of Sundaeswap */
  public static async getInstance(network: string): Promise<Sundaeswap> {
    if (!Sundaeswap._instances) {
      Sundaeswap._instances = {};
    }

    if (!Sundaeswap._instances[network]) {
      const instance = new Sundaeswap(network);
      await instance.init(network);
      Sundaeswap._instances[network] = instance;
    }

    return Sundaeswap._instances[network];
  }

  /** Initializes Sundaeswap instance */
  private async init(network: string) {
    try {
      this.cardano = await Cardano.getInstance(network);

      // Load first wallet if available
      const walletAddress = await this.cardano.getFirstWalletAddress();
      if (walletAddress) {
        this.owner = await this.cardano.getWalletFromAddress(walletAddress);
      }

      logger.info('Sundaeswap initialized' + (walletAddress ? ` with wallet: ${walletAddress}` : 'with no wallet'));
    } catch (error) {
      logger.error('Sundaeswap initialization failed:', error);
      throw error;
    }
  }

  /**
   * Gets the allowed slippage percentage from config
   * @returns Slippage as a percentage (e.g., 1.0 for 1%)
   */
  getSlippagePct(): number {
    const allowedSlippage = SundaeswapConfig.config.allowedSlippage;
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

  async findDefaultPool(baseToken: string, quoteToken: string, routeType: 'amm'): Promise<string | null> {
    // Get the network-specific pools
    const network = this.cardano.network;
    const pools = SundaeswapConfig.getNetworkPools(network, routeType);

    if (!pools) return null;

    const pairKey = this.getPairKey(baseToken, quoteToken);
    const reversePairKey = this.getPairKey(quoteToken, baseToken);

    return pools[pairKey] || pools[reversePairKey] || null;
  }

  async getAmmPoolInfo(ident: string): Promise<PoolInfo> {
    const queryProvider = new QueryProviderSundaeSwap(this.networkName as TSupportedNetworks);
    const raw = await queryProvider.findPoolData({ ident });

    const aReserveSmallest = raw.liquidity.aReserve / BigInt(10 ** raw.assetA.decimals);
    const bReserveSmallest = raw.liquidity.bReserve / BigInt(10 ** raw.assetB.decimals);

    const info: PoolInfo = {
      address: raw.ident,
      baseTokenAddress: raw.assetA.assetId,
      quoteTokenAddress: raw.assetB.assetId,
      feePct: raw.currentFee * 100,
      price: raw.liquidity.aReserve > 0n ? Number(aReserveSmallest) / Number(bReserveSmallest) : 0,
      baseTokenAmount: Number(raw.liquidity.aReserve), // ← explicit cast
      quoteTokenAmount: Number(raw.liquidity.bReserve), // ← explicit cast
    };

    return info;
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

  public calculateAssetAmount(utxos: UTxO[], asset: IPoolDataAsset): bigint {
    return utxos.reduce((acc, utxo) => {
      const [policyId, assetName] = asset.assetId.split('.');
      const assetValue = utxo.assets[policyId + assetName];
      if (assetValue) {
        return acc + BigInt(assetValue); // Ensure addition is performed with BigInt
      }
      return acc;
    }, 0n); // Initialize the accumulator with BigInt zero
  }

  async getPoolData(poolIdent: string) {
    const queryProvider = new QueryProviderSundaeSwap(this.networkName as TSupportedNetworks);

    // 2) Fetch the raw pool data
    const raw = await queryProvider.findPoolData({ ident: poolIdent });

    return raw;
  }
}
