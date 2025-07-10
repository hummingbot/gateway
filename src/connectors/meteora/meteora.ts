import DLMM, { getPriceOfBinByBinId, LbPair } from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import {
  MeteoraPoolInfo,
  PositionInfo,
  BinLiquidity,
} from '../../schemas/clmm-schema';
import { convertDecimals } from '../../services/base';
import { logger } from '../../services/logger';

import { MeteoraConfig } from './meteora.config';

export class Meteora {
  private static _instances: { [name: string]: Meteora };
  private static readonly MAX_BINS = 70;
  private solana: Solana;
  public config: MeteoraConfig.RootConfig;
  private dlmmPools: Map<string, DLMM> = new Map();
  private dlmmPoolPromises: Map<string, Promise<DLMM>> = new Map();

  private constructor() {
    this.config = MeteoraConfig.config;
    this.solana = null; // Initialize as null since we need to await getInstance
  }

  /** Gets singleton instance of Meteora */
  public static async getInstance(network: string): Promise<Meteora> {
    if (!Meteora._instances) {
      Meteora._instances = {};
    }
    if (!Meteora._instances[network]) {
      const instance = new Meteora();
      await instance.init(network);
      Meteora._instances[network] = instance;
    }
    return Meteora._instances[network];
  }

  /** Initializes Meteora instance */
  private async init(network: string) {
    try {
      this.solana = await Solana.getInstance(network); // Get initialized Solana instance
      this.dlmmPools = new Map();
      this.dlmmPoolPromises = new Map();
      logger.info('Initializing Meteora');
    } catch (error) {
      logger.error('Failed to initialize Meteora:', error);
      throw error;
    }
  }

  /** Gets DLMM pool instance */
  async getDlmmPool(poolAddress: string): Promise<DLMM> {
    // Check if we already have the pool instance
    if (this.dlmmPools.has(poolAddress)) {
      return this.dlmmPools.get(poolAddress);
    }

    // Check if we have a pending promise for this pool
    if (this.dlmmPoolPromises.has(poolAddress)) {
      return this.dlmmPoolPromises.get(poolAddress);
    }

    // Create a promise for the DLMM instance
    const dlmmPoolPromise = DLMM.create(
      this.solana.connection,
      new PublicKey(poolAddress),
      { cluster: this.solana.network as any },
    ).then(async (dlmmPool) => {
      await dlmmPool.refetchStates();
      this.dlmmPools.set(poolAddress, dlmmPool);
      this.dlmmPoolPromises.delete(poolAddress);
      return dlmmPool;
    });

    this.dlmmPoolPromises.set(poolAddress, dlmmPoolPromise);
    return dlmmPoolPromise;
  }

  /** Gets Meteora pools with optional token filtering */
  async getPools(
    limit: number = 100,
    tokenMintA?: string,
    tokenMintB?: string,
  ): Promise<{ publicKey: PublicKey; account: LbPair }[]> {
    const timeoutMs = 10000;
    try {
      logger.info('Fetching Meteora pools...');
      const lbPairsPromise = DLMM.getLbPairs(this.solana.connection, {
        cluster: this.solana.network as any,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('getPools timed out')), timeoutMs);
      });

      let lbPairs = (await Promise.race([lbPairsPromise, timeoutPromise])) as {
        publicKey: PublicKey;
        account: LbPair;
      }[];

      // Only apply token filtering if tokens are provided
      if (tokenMintA && tokenMintB) {
        lbPairs = lbPairs.filter((pair) => {
          const tokenXMint = pair.account.tokenXMint.toBase58();
          const tokenYMint = pair.account.tokenYMint.toBase58();
          return (
            (tokenXMint === tokenMintA && tokenYMint === tokenMintB) ||
            (tokenXMint === tokenMintB && tokenYMint === tokenMintA)
          );
        });
      } else if (tokenMintA) {
        lbPairs = lbPairs.filter((pair) => {
          const tokenXMint = pair.account.tokenXMint.toBase58();
          const tokenYMint = pair.account.tokenYMint.toBase58();
          return tokenXMint === tokenMintA || tokenYMint === tokenMintA;
        });
      }

      const returnLength = Math.min(lbPairs.length, limit);
      logger.info(
        `Found ${lbPairs.length} matching Meteora pools, returning first ${returnLength}`,
      );
      // console.log(JSON.stringify(lbPairs[0], null, 2));

      return lbPairs.slice(0, returnLength);
    } catch (error) {
      logger.error('Failed to fetch Meteora pools:', error);
      return []; // Return empty array instead of throwing
    }
  }

  /** Gets comprehensive pool information */
  async getPoolInfo(poolAddress: string): Promise<MeteoraPoolInfo | null> {
    try {
      const dlmmPool = await this.getDlmmPool(poolAddress);
      if (!dlmmPool) {
        logger.error(`Pool not found: ${poolAddress}`);
        return null;
      }

      const [reserveXBalance, reserveYBalance] = await Promise.all([
        this.solana.connection.getTokenAccountBalance(dlmmPool.lbPair.reserveX),
        this.solana.connection.getTokenAccountBalance(dlmmPool.lbPair.reserveY),
      ]);
      const feeInfo = await dlmmPool.getFeeInfo();
      const activeBin = await dlmmPool.getActiveBin();
      const dynamicFee = dlmmPool.getDynamicFee();

      if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
        logger.error(`Invalid active bin data for pool: ${poolAddress}`);
        return null;
      }

      return {
        address: poolAddress,
        baseTokenAddress: dlmmPool.tokenX.publicKey.toBase58(),
        quoteTokenAddress: dlmmPool.tokenY.publicKey.toBase58(),
        binStep: dlmmPool.lbPair.binStep,
        feePct: Number(feeInfo.baseFeeRatePercentage),
        dynamicFeePct: Number(dynamicFee),
        price: Number(activeBin.pricePerToken),
        baseTokenAmount: reserveXBalance.value.uiAmount,
        quoteTokenAmount: reserveYBalance.value.uiAmount,
        activeBinId: activeBin.binId,
        minBinId: dlmmPool.lbPair.parameters.minBinId,
        maxBinId: dlmmPool.lbPair.parameters.maxBinId,
        bins: await this.getPoolLiquidity(poolAddress),
      };
    } catch (error) {
      logger.error(`Error getting pool info for ${poolAddress}:`, error);
      return null;
    }
  }

  async getPoolLiquidity(poolAddress: string): Promise<BinLiquidity[]> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }
    const binData = await dlmmPool.getBinsAroundActiveBin(
      Meteora.MAX_BINS - 1,
      Meteora.MAX_BINS - 1,
    );

    return binData.bins.map((bin) => ({
      binId: bin.binId,
      price: Number(bin.pricePerToken),
      baseTokenAmount: Number(
        convertDecimals(bin.xAmount, dlmmPool.tokenX.decimal),
      ),
      quoteTokenAmount: Number(
        convertDecimals(bin.yAmount, dlmmPool.tokenY.decimal),
      ),
    }));
  }

  /** Gets all positions for a pool */
  async getPositionsInPool(
    poolAddress: string,
    wallet: PublicKey,
  ): Promise<PositionInfo[]> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    const { userPositions } =
      await dlmmPool.getPositionsByUserAndLbPair(wallet);
    const activeBin = await dlmmPool.getActiveBin();

    if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
      throw new Error(`Invalid active bin data for pool: ${poolAddress}`);
    }

    return userPositions.map(({ publicKey, positionData }) => {
      // Get prices from bin IDs
      const lowerPrice = getPriceOfBinByBinId(
        positionData.lowerBinId,
        dlmmPool.lbPair.binStep,
      );
      const upperPrice = getPriceOfBinByBinId(
        positionData.upperBinId,
        dlmmPool.lbPair.binStep,
      );

      // Adjust for decimal difference (tokenX.decimal - tokenY.decimal)
      const decimalDiff = dlmmPool.tokenX.decimal - dlmmPool.tokenY.decimal; // 9 - 6 = 3
      const adjustmentFactor = Math.pow(10, decimalDiff);

      const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
      const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

      return {
        address: publicKey.toString(),
        poolAddress,
        baseTokenAddress: dlmmPool.tokenX.publicKey.toBase58(),
        quoteTokenAddress: dlmmPool.tokenY.publicKey.toBase58(),
        baseTokenAmount: Number(
          convertDecimals(positionData.totalXAmount, dlmmPool.tokenX.decimal),
        ),
        quoteTokenAmount: Number(
          convertDecimals(positionData.totalYAmount, dlmmPool.tokenY.decimal),
        ),
        baseFeeAmount: Number(
          convertDecimals(positionData.feeX, dlmmPool.tokenX.decimal),
        ),
        quoteFeeAmount: Number(
          convertDecimals(positionData.feeY, dlmmPool.tokenY.decimal),
        ),
        lowerBinId: positionData.lowerBinId,
        upperBinId: positionData.upperBinId,
        lowerPrice: adjustedLowerPrice,
        upperPrice: adjustedUpperPrice,
        price: Number(activeBin.pricePerToken),
      };
    });
  }

  /** Gets raw position data without parsing */
  async getRawPosition(positionAddress: string, wallet: PublicKey) {
    const allPositions = await DLMM.getAllLbPairPositionsByUser(
      this.solana.connection,
      wallet,
    );

    const [matchingPosition] = Array.from(allPositions.values())
      .map((position) => ({
        position: position.lbPairPositionsData.find(
          (lbPosition) => lbPosition.publicKey.toBase58() === positionAddress,
        ),
        info: position,
      }))
      .filter((x) => x.position);

    if (!matchingPosition) {
      return null;
    }
    // console.log(matchingPosition);

    return matchingPosition;
  }

  /** Gets position information */
  async getPositionInfo(
    positionAddress: string,
    wallet: PublicKey,
  ): Promise<PositionInfo> {
    const { position, info } = await this.getRawPosition(
      positionAddress,
      wallet,
    );
    if (!position) {
      throw new Error('Position not found');
    }

    const dlmmPool = await this.getDlmmPool(info.publicKey.toBase58());
    const activeBin = await dlmmPool.getActiveBin();

    if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
      throw new Error(
        `Invalid active bin data for pool: ${info.publicKey.toBase58()}`,
      );
    }

    // Get prices from bin IDs
    const lowerPrice = getPriceOfBinByBinId(
      position.positionData.lowerBinId,
      dlmmPool.lbPair.binStep,
    );
    const upperPrice = getPriceOfBinByBinId(
      position.positionData.upperBinId,
      dlmmPool.lbPair.binStep,
    );

    // Adjust for decimal difference (tokenX.decimal - tokenY.decimal)
    const decimalDiff = dlmmPool.tokenX.decimal - dlmmPool.tokenY.decimal;
    const adjustmentFactor = Math.pow(10, decimalDiff);

    const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
    const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

    return {
      address: positionAddress,
      poolAddress: info.publicKey.toString(),
      baseTokenAddress: dlmmPool.tokenX.publicKey.toBase58(),
      quoteTokenAddress: dlmmPool.tokenY.publicKey.toBase58(),
      baseTokenAmount: Number(
        convertDecimals(
          position.positionData.totalXAmount,
          dlmmPool.tokenX.decimal,
        ),
      ),
      quoteTokenAmount: Number(
        convertDecimals(
          position.positionData.totalYAmount,
          dlmmPool.tokenY.decimal,
        ),
      ),
      baseFeeAmount: Number(
        convertDecimals(position.positionData.feeX, dlmmPool.tokenX.decimal),
      ),
      quoteFeeAmount: Number(
        convertDecimals(position.positionData.feeY, dlmmPool.tokenY.decimal),
      ),
      lowerBinId: position.positionData.lowerBinId,
      upperBinId: position.positionData.upperBinId,
      lowerPrice: adjustedLowerPrice,
      upperPrice: adjustedUpperPrice,
      price: Number(activeBin.pricePerToken),
    };
  }

  // async getBinLiquidity(poolAddress: string, binId: number): Promise<{xAmount: number, yAmount: number}> {
  //   const dlmmPool = await this.getDlmmPool(poolAddress);
  //   if (!dlmmPool) {
  //     throw new Error(`Pool not found: ${poolAddress}`);
  //   }
  //   return dlmmPool.getBinLiquidity(binId);
  // }

  /** Converts price range to bin IDs */
  async getPriceToBinIds(
    poolAddress: string,
    lowerPrice: number,
    upperPrice: number,
    padBins: number = 1,
  ): Promise<{ minBinId: number; maxBinId: number }> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }
    const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
    const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);

    const minBinId =
      dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true) - padBins;
    const maxBinId =
      dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false) + padBins;

    if (maxBinId - minBinId > Meteora.MAX_BINS) {
      throw new Error(
        `Position range too wide. Maximum ${Meteora.MAX_BINS} bins allowed`,
      );
    }

    return { minBinId, maxBinId };
  }

  private getPairKey(baseToken: string, quoteToken: string): string {
    return `${baseToken}-${quoteToken}`;
  }

  async findDefaultPool(
    _baseToken: string,
    _quoteToken: string,
  ): Promise<string | null> {
    // Pools are now managed separately, return null for dynamic pool discovery
    return null;
  }
}
