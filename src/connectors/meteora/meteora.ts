import DLMM, { getPriceOfBinByBinId, LbPair, LBCLMM_PROGRAM_IDS } from '@meteora-ag/dlmm';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, MemcmpFilter } from '@solana/web3.js';

import { Solana } from '../../chains/solana/solana';
import { MeteoraPoolInfo, PositionInfo, BinLiquidity } from '../../schemas/clmm-schema';
import { convertDecimals } from '../../services/base';
import { logger } from '../../services/logger';

import { MeteoraConfig } from './meteora.config';

export class Meteora {
  private static _instances: { [name: string]: Meteora };
  // Recommended maximum bins per position (aligns with SDK's DEFAULT_BIN_PER_POSITION)
  // Ensures single-transaction operations. SDK supports up to 1400 bins via multiple transactions.
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
    const dlmmPoolPromise = DLMM.create(this.solana.connection, new PublicKey(poolAddress), {
      cluster: this.solana.network as any,
    }).then(async (dlmmPool) => {
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
      logger.info(`Found ${lbPairs.length} matching Meteora pools, returning first ${returnLength}`);
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
      logger.debug(`Could not decode ${poolAddress} as Meteora pool: ${error}`);
      return null;
    }
  }

  async getPoolLiquidity(poolAddress: string): Promise<BinLiquidity[]> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }
    const binData = await dlmmPool.getBinsAroundActiveBin(Meteora.MAX_BINS - 1, Meteora.MAX_BINS - 1);

    return binData.bins.map((bin) => ({
      binId: bin.binId,
      price: Number(bin.pricePerToken),
      baseTokenAmount: Number(convertDecimals(bin.xAmount, dlmmPool.tokenX.mint.decimals)),
      quoteTokenAmount: Number(convertDecimals(bin.yAmount, dlmmPool.tokenY.mint.decimals)),
    }));
  }

  /** Gets all positions for a wallet across all pools */
  async getAllPositionsForWallet(wallet: PublicKey): Promise<PositionInfo[]> {
    logger.info(`Fetching all positions for wallet: ${wallet.toBase58()}`);

    let allPositions;
    try {
      allPositions = await DLMM.getAllLbPairPositionsByUser(this.solana.connection, wallet);
    } catch (error) {
      logger.error(`Meteora SDK getAllLbPairPositionsByUser failed: ${error.message}`);
      logger.error('This is a known SDK bug where it tries to access fee properties that may not be initialized.');
      logger.info('GitHub issue: https://github.com/MeteoraAg/dlmm-sdk/issues/245');

      throw new Error(
        'Unable to fetch Meteora positions due to a known SDK bug. The SDK fails when trying to compute fees on positions with uninitialized state. Please see https://github.com/MeteoraAg/dlmm-sdk/issues/245 for updates.',
      );
    }

    logger.info(`Found ${allPositions.size} pools with positions for wallet`);

    const positions: PositionInfo[] = [];
    let poolIndex = 0;
    for (const poolPositions of allPositions.values()) {
      poolIndex++;
      const poolAddress = poolPositions.publicKey.toBase58();
      logger.info(
        `[Pool ${poolIndex}/${allPositions.size}] Processing pool: ${poolAddress} with ${poolPositions.lbPairPositionsData.length} positions`,
      );

      try {
        const dlmmPool = await this.getDlmmPool(poolAddress);
        const activeBin = await dlmmPool.getActiveBin();

        if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
          logger.warn(`Invalid active bin data for pool: ${poolAddress}, skipping`);
          continue;
        }

        const decimalDiff = dlmmPool.tokenX.mint.decimals - dlmmPool.tokenY.mint.decimals;
        const adjustmentFactor = Math.pow(10, decimalDiff);

        let posIndex = 0;
        for (const { publicKey, positionData } of poolPositions.lbPairPositionsData) {
          posIndex++;
          logger.info(
            `[Pool ${poolIndex}/${allPositions.size}] [Position ${posIndex}/${poolPositions.lbPairPositionsData.length}] Processing position: ${publicKey?.toString()}`,
          );

          // Skip positions with invalid data
          if (!positionData || !publicKey) {
            logger.warn(`Skipping position with missing data in pool ${poolAddress}`);
            continue;
          }

          try {
            logger.debug(`Getting prices for position ${publicKey.toString()}`);
            const lowerPrice = getPriceOfBinByBinId(positionData.lowerBinId, dlmmPool.lbPair.binStep);
            const upperPrice = getPriceOfBinByBinId(positionData.upperBinId, dlmmPool.lbPair.binStep);

            const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
            const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

            logger.debug(`Getting token amounts for position ${publicKey.toString()}`);
            const baseTokenAmount = Number(convertDecimals(positionData.totalXAmount, dlmmPool.tokenX.mint.decimals));
            const quoteTokenAmount = Number(convertDecimals(positionData.totalYAmount, dlmmPool.tokenY.mint.decimals));

            // NOTE: Fee calculation is skipped for batch position fetching because
            // the positionData.feeX/feeY getters require internal state that may not be initialized
            // when fetched via getAllLbPairPositionsByUser. Fees are set to 0.
            // For accurate fee data, use getPositionInfo() for individual positions.
            const baseFeeAmount = 0;
            const quoteFeeAmount = 0;

            logger.debug(`Creating position info object for ${publicKey.toString()}`);
            positions.push({
              address: publicKey.toString(),
              poolAddress,
              baseTokenAddress: dlmmPool.tokenX.publicKey.toBase58(),
              quoteTokenAddress: dlmmPool.tokenY.publicKey.toBase58(),
              baseTokenAmount,
              quoteTokenAmount,
              baseFeeAmount,
              quoteFeeAmount,
              lowerBinId: positionData.lowerBinId,
              upperBinId: positionData.upperBinId,
              lowerPrice: adjustedLowerPrice,
              upperPrice: adjustedUpperPrice,
              price: Number(activeBin.pricePerToken),
            });
            logger.info(`Successfully processed position ${publicKey.toString()}`);
          } catch (posError) {
            logger.error(
              `Error processing individual position ${publicKey?.toString()} in pool ${poolAddress}:`,
              posError,
            );
            // Continue to next position
          }
        }
        logger.info(`Completed processing pool ${poolAddress}: ${posIndex} positions processed`);
      } catch (error) {
        logger.error(`Error processing positions for pool ${poolAddress}:`, error);
        // Continue processing other pools
      }
    }

    logger.info(`Completed fetching positions: ${positions.length} total positions found`);
    return positions;
  }

  /** Gets raw position data without parsing */
  async getRawPosition(positionAddress: string, wallet: PublicKey) {
    const allPositions = await DLMM.getAllLbPairPositionsByUser(this.solana.connection, wallet);

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

  /** Gets position information directly by position address (without needing wallet) */
  async getPositionInfoByAddress(positionAddress: string): Promise<PositionInfo> {
    // Fetch the position account to extract pool address
    const positionPubkey = new PublicKey(positionAddress);
    const positionAccount = await this.solana.connection.getAccountInfo(positionPubkey);

    if (!positionAccount) {
      throw new Error(`Position ${positionAddress} not found`);
    }

    // Parse the position account to extract the pool address (lbPair)
    // Meteora position account structure: lbPair is at offset 8-40 (after discriminator)
    const lbPairPubkey = new PublicKey(positionAccount.data.slice(8, 40));
    const poolAddress = lbPairPubkey.toBase58();

    // Get the pool and position using SDK methods
    const dlmmPool = await this.getDlmmPool(poolAddress);
    const position = await dlmmPool.getPosition(positionPubkey);

    if (!position) {
      throw new Error(`Position ${positionAddress} not found in pool ${poolAddress}`);
    }

    const activeBin = await dlmmPool.getActiveBin();

    if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
      throw new Error(`Invalid active bin data for pool: ${poolAddress}`);
    }

    // Get prices from bin IDs
    const lowerPrice = getPriceOfBinByBinId(position.positionData.lowerBinId, dlmmPool.lbPair.binStep);
    const upperPrice = getPriceOfBinByBinId(position.positionData.upperBinId, dlmmPool.lbPair.binStep);

    // Adjust for decimal difference (tokenX.mint.decimals - tokenY.mint.decimals)
    const decimalDiff = dlmmPool.tokenX.mint.decimals - dlmmPool.tokenY.mint.decimals;
    const adjustmentFactor = Math.pow(10, decimalDiff);

    const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
    const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

    // Try to get fees - may fail if internal state isn't initialized
    let baseFeeAmount = 0;
    let quoteFeeAmount = 0;
    try {
      baseFeeAmount = Number(convertDecimals(position.positionData.feeX, dlmmPool.tokenX.mint.decimals));
      quoteFeeAmount = Number(convertDecimals(position.positionData.feeY, dlmmPool.tokenY.mint.decimals));
    } catch (feeError) {
      logger.warn(`Could not calculate fees for position ${positionAddress}, setting to 0: ${feeError.message}`);
    }

    return {
      address: positionAddress,
      poolAddress: poolAddress,
      baseTokenAddress: dlmmPool.tokenX.publicKey.toBase58(),
      quoteTokenAddress: dlmmPool.tokenY.publicKey.toBase58(),
      baseTokenAmount: Number(convertDecimals(position.positionData.totalXAmount, dlmmPool.tokenX.mint.decimals)),
      quoteTokenAmount: Number(convertDecimals(position.positionData.totalYAmount, dlmmPool.tokenY.mint.decimals)),
      baseFeeAmount,
      quoteFeeAmount,
      lowerBinId: position.positionData.lowerBinId,
      upperBinId: position.positionData.upperBinId,
      lowerPrice: adjustedLowerPrice,
      upperPrice: adjustedUpperPrice,
      price: Number(activeBin.pricePerToken),
    };
  }

  /** Gets position information (legacy method using wallet) */
  async getPositionInfo(positionAddress: string, wallet: PublicKey): Promise<PositionInfo> {
    const { position, info } = await this.getRawPosition(positionAddress, wallet);
    if (!position) {
      throw new Error('Position not found');
    }

    const dlmmPool = await this.getDlmmPool(info.publicKey.toBase58());
    const activeBin = await dlmmPool.getActiveBin();

    if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
      throw new Error(`Invalid active bin data for pool: ${info.publicKey.toBase58()}`);
    }

    // Get prices from bin IDs
    const lowerPrice = getPriceOfBinByBinId(position.positionData.lowerBinId, dlmmPool.lbPair.binStep);
    const upperPrice = getPriceOfBinByBinId(position.positionData.upperBinId, dlmmPool.lbPair.binStep);

    // Adjust for decimal difference (tokenX.mint.decimals - tokenY.mint.decimals)
    const decimalDiff = dlmmPool.tokenX.mint.decimals - dlmmPool.tokenY.mint.decimals;
    const adjustmentFactor = Math.pow(10, decimalDiff);

    const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
    const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

    // Try to get fees - may fail if internal state isn't initialized
    let baseFeeAmount = 0;
    let quoteFeeAmount = 0;
    try {
      baseFeeAmount = Number(convertDecimals(position.positionData.feeX, dlmmPool.tokenX.mint.decimals));
      quoteFeeAmount = Number(convertDecimals(position.positionData.feeY, dlmmPool.tokenY.mint.decimals));
    } catch (feeError) {
      logger.warn(`Could not calculate fees for position ${positionAddress}, setting to 0: ${feeError.message}`);
    }

    return {
      address: positionAddress,
      poolAddress: info.publicKey.toString(),
      baseTokenAddress: dlmmPool.tokenX.publicKey.toBase58(),
      quoteTokenAddress: dlmmPool.tokenY.publicKey.toBase58(),
      baseTokenAmount: Number(convertDecimals(position.positionData.totalXAmount, dlmmPool.tokenX.mint.decimals)),
      quoteTokenAmount: Number(convertDecimals(position.positionData.totalYAmount, dlmmPool.tokenY.mint.decimals)),
      baseFeeAmount,
      quoteFeeAmount,
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

    const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true) - padBins;
    const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false) + padBins;

    if (maxBinId - minBinId > Meteora.MAX_BINS) {
      throw new Error(
        `Position range too wide: ${maxBinId - minBinId} bins requested. ` +
          `Recommended maximum is ${Meteora.MAX_BINS} bins for single-transaction operations. ` +
          `For wider ranges, create multiple positions or narrow your price range.`,
      );
    }

    return { minBinId, maxBinId };
  }

  private getPairKey(baseToken: string, quoteToken: string): string {
    return `${baseToken}-${quoteToken}`;
  }

  async findDefaultPool(_baseToken: string, _quoteToken: string): Promise<string | null> {
    // Pools are now managed separately, return null for dynamic pool discovery
    return null;
  }
}
