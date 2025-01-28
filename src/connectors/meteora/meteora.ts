import { Solana } from '../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import DLMM, { getPriceOfBinByBinId } from '@meteora-ag/dlmm';
import { MeteoraConfig } from './meteora.config';
import { logger } from '../../services/logger';
import { convertDecimals } from '../../services/base';
import { PoolInfo, PositionInfo } from '../../services/common-interfaces';
import { LbPair } from '@meteora-ag/dlmm';
import { percentRegexp } from '../../services/config-manager-v2';

export class Meteora {
  private static _instances: { [name: string]: Meteora };
  private solana: Solana;
  public config: MeteoraConfig.NetworkConfig;
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
      logger.info("Initializing Meteora");
    } catch (error) {
      logger.error("Failed to initialize Meteora:", error);
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
      { cluster: this.solana.network as any }
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
    tokenMintB?: string
  ): Promise<{ publicKey: PublicKey; account: LbPair }[]> {
    const timeoutMs = 10000;
    try {
      logger.info('Fetching Meteora LB pairs...');
      const lbPairsPromise = DLMM.getLbPairs(this.solana.connection, {
        cluster: this.solana.network as any
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('getLbPairs timed out')), timeoutMs);
      });

      let lbPairs = (await Promise.race([lbPairsPromise, timeoutPromise])) as { 
        publicKey: PublicKey; 
        account: LbPair 
      }[];
      
      // Filter by tokens if provided
      if (tokenMintA && tokenMintB) {
        lbPairs = lbPairs.filter(pair => {
          const tokenXMint = (pair.account.parameters as any).tokenX;
          const tokenYMint = (pair.account.parameters as any).tokenY;
          return (tokenXMint === tokenMintA && tokenYMint === tokenMintB) ||
                 (tokenXMint === tokenMintB && tokenYMint === tokenMintA);
        });
      } else if (tokenMintA) {
        lbPairs = lbPairs.filter(pair => {
          const tokenXMint = (pair.account.parameters as any).tokenX;
          const tokenYMint = (pair.account.parameters as any).tokenY;
          return tokenXMint === tokenMintA || tokenYMint === tokenMintA;
        });
      }

      logger.info(`Found ${lbPairs.length} Meteora LB pairs, returning first ${limit}`);
      // console.log(JSON.stringify(lbPairs[0], null, 2));
       
      return lbPairs.slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch Meteora LB pairs:', error);
      return []; // Return empty array instead of throwing
    }
  }

  /** Gets position information */
  async getPosition(positionAddress: string, wallet: PublicKey): Promise<PositionInfo> {
    const matchingPosition: any = await this.getRawPosition(positionAddress, wallet);
    if (!matchingPosition) {
      throw new Error('Position not found');
    }

    console.log(JSON.stringify(matchingPosition, null, 2));

    // Get the DLMM pool for the position
    const dlmmPool = await this.getDlmmPool(matchingPosition.info.publicKey.toBase58());

    // Get prices from bin IDs
    const lowerPrice = getPriceOfBinByBinId(dlmmPool.lbPair.binStep, matchingPosition.positionData.lowerBinId);
    const upperPrice = getPriceOfBinByBinId(dlmmPool.lbPair.binStep, matchingPosition.positionData.upperBinId);

    // Adjust for decimal difference (tokenX.decimal - tokenY.decimal)
    const decimalDiff = dlmmPool.tokenX.decimal - dlmmPool.tokenY.decimal;
    const adjustmentFactor = Math.pow(10, decimalDiff);

    const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
    const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

    return {
      address: positionAddress,
      poolAddress: matchingPosition.info.publicKey.toString(),
      baseToken: dlmmPool.tokenX.publicKey.toBase58(),
      quoteToken: dlmmPool.tokenY.publicKey.toBase58(),
      baseAmount: convertDecimals(matchingPosition.positionData.totalXAmount, dlmmPool.tokenX.decimal),
      quoteAmount: convertDecimals(matchingPosition.positionData.totalYAmount, dlmmPool.tokenY.decimal),
      baseFeeAmount: convertDecimals(matchingPosition.positionData.feeX, dlmmPool.tokenX.decimal),
      quoteFeeAmount: convertDecimals(matchingPosition.positionData.feeY, dlmmPool.tokenY.decimal),
      lowerBinId: matchingPosition.positionData.lowerBinId,
      upperBinId: matchingPosition.positionData.upperBinId,
      lowerPrice: adjustedLowerPrice,
      upperPrice: adjustedUpperPrice,
    };
  }

  /** Gets all positions for a pool */
  async getPositions(poolAddress: string, wallet: PublicKey): Promise<PositionInfo[]> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(wallet);

    return userPositions.map(({ publicKey, positionData }) => {
      // Get prices from bin IDs
      const lowerPrice = getPriceOfBinByBinId(dlmmPool.lbPair.binStep, positionData.lowerBinId);
      const upperPrice = getPriceOfBinByBinId(dlmmPool.lbPair.binStep, positionData.upperBinId);

      // Adjust for decimal difference (tokenX.decimal - tokenY.decimal)
      const decimalDiff = dlmmPool.tokenX.decimal - dlmmPool.tokenY.decimal; // 9 - 6 = 3
      const adjustmentFactor = Math.pow(10, decimalDiff);

      const adjustedLowerPrice = Number(lowerPrice) * adjustmentFactor;
      const adjustedUpperPrice = Number(upperPrice) * adjustmentFactor;

      return {
        address: publicKey.toString(),
        poolAddress,
        baseToken: dlmmPool.tokenX.publicKey.toBase58(),
        quoteToken: dlmmPool.tokenY.publicKey.toBase58(),
        baseAmount: convertDecimals(positionData.totalXAmount, dlmmPool.tokenX.decimal),
        quoteAmount: convertDecimals(positionData.totalYAmount, dlmmPool.tokenY.decimal),
        baseFeeAmount: convertDecimals(positionData.feeX, dlmmPool.tokenX.decimal),
        quoteFeeAmount: convertDecimals(positionData.feeY, dlmmPool.tokenY.decimal),
        lowerBinId: positionData.lowerBinId,
        upperBinId: positionData.upperBinId,
        lowerPrice: adjustedLowerPrice,
        upperPrice: adjustedUpperPrice,
      };
    });
  }

  /** Converts price range to bin IDs */
  async getPriceToBinIds(
    poolAddress: string,
    lowerPrice: number,
    upperPrice: number,
    padBins: number = 1
  ): Promise<{minBinId: number, maxBinId: number}> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }
    const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
    const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);

    const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true) - padBins;
    const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false) + padBins;

    return { minBinId, maxBinId };
  }

  /** Gets comprehensive pool information */
  async getPoolInfo(poolAddress: string): Promise<PoolInfo | null> {
    try {
      const dlmmPool = await this.getDlmmPool(poolAddress);
      if (!dlmmPool) {
        logger.warn(`Pool not found: ${poolAddress}`);
        return null;
      }
      
      // Get reserve amounts
      const [reserveXBalance, reserveYBalance] = await Promise.all([
        this.solana.connection.getTokenAccountBalance(dlmmPool.lbPair.reserveX),
        this.solana.connection.getTokenAccountBalance(dlmmPool.lbPair.reserveY)
      ]);

      console.log(`Pool ${poolAddress} reserves:`, {
        reserveX: reserveXBalance.value.uiAmount,
        reserveY: reserveYBalance.value.uiAmount
      });
      
      const feeInfo = await dlmmPool.getFeeInfo();
      const activeBin = await dlmmPool.getActiveBin();

      if (!activeBin || !activeBin.price || !activeBin.pricePerToken) {
        logger.warn(`Invalid active bin data for pool: ${poolAddress}`);
        return null;
      }

      return {
        address: poolAddress,
        baseToken: dlmmPool.tokenX.publicKey.toBase58(),
        quoteToken: dlmmPool.tokenY.publicKey.toBase58(),
        binStep: dlmmPool.lbPair.binStep,
        feePct: Number(feeInfo.baseFeeRatePercentage),
        price: Number(activeBin.pricePerToken),
        baseAmount: reserveXBalance.value.uiAmount,
        quoteAmount: reserveYBalance.value.uiAmount,
      };
    } catch (error) {
      logger.error(`Error getting pool info for ${poolAddress}:`, error);
      return null;
    }
  }

  /** Gets raw position data without parsing */
  async getRawPosition(positionAddress: string, wallet: PublicKey) {
    const allPositions = await DLMM.getAllLbPairPositionsByUser(
      this.solana.connection,
      wallet
    );

    const [matchingPosition] = Array.from(allPositions.values())
      .map(position => ({
        position: position.lbPairPositionsData.find(
          lbPosition => lbPosition.publicKey.toBase58() === positionAddress
        ),
        info: position
      }))
      .filter(x => x.position);

    if (!matchingPosition) {
      return null;
    }

    return matchingPosition.position;
  }

  /** Gets slippage percentage from config */
  getSlippagePct(): number {
    const allowedSlippage = this.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    let slippage = 0.0;
    if (nd) {
      slippage = Number(nd[1]) / Number(nd[2]);
    } else {
      logger.error('Failed to parse slippage value:', allowedSlippage);
    }
    return slippage * 100;
  }
}