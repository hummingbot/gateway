import { Solana } from '../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { MeteoraConfig } from './meteora.config';
import { logger } from '../../services/logger';
import { convertDecimals } from '../../services/base';
import { percentRegexp } from '../../services/config-manager-v2';
import { PoolInfo } from '../../services/common-interfaces';
import { LbPair } from '@meteora-ag/dlmm';

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
      
      // Only apply token filtering if tokens are provided
      if (tokenMintA && tokenMintB) {
        lbPairs = lbPairs.filter(pair => {
          const tokenXMint = pair.account.tokenXMint.toBase58();
          const tokenYMint = pair.account.tokenYMint.toBase58();
          return (tokenXMint === tokenMintA && tokenYMint === tokenMintB) ||
                (tokenXMint === tokenMintB && tokenYMint === tokenMintA);
        });
      } else if (tokenMintA) {
        lbPairs = lbPairs.filter(pair => {
          const tokenXMint = pair.account.tokenXMint.toBase58();
          const tokenYMint = pair.account.tokenYMint.toBase58();
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
  async getPosition(positionAddress: string, wallet: PublicKey): Promise<any> {
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
      throw new Error('Position not found');
    }

    return matchingPosition;
  }

  /** Gets fees quote for a position */
  async getFeesQuote(positionAddress: string, wallet: PublicKey): Promise<any> {
    const matchingPosition = await this.getPosition(positionAddress, wallet);

    const dlmmPool = await this.getDlmmPool(matchingPosition.info.publicKey.toBase58());
    await dlmmPool.refetchStates();

    const positionsState = await dlmmPool.getPositionsByUserAndLbPair(wallet);
    const updatedPosition = positionsState.userPositions.find(
      position => position.publicKey.equals(matchingPosition.position.publicKey)
    );

    if (!updatedPosition) {
      logger.error('Updated position not found');
      throw new Error('Updated position not found');
    }

    return {
      tokenX: {
        address: matchingPosition.info.tokenX.publicKey.toBase58(),
        amount: convertDecimals(updatedPosition.positionData.feeX, matchingPosition.info.tokenX.decimal)
      },
      tokenY: {
        address: matchingPosition.info.tokenY.publicKey.toBase58(),
        amount: convertDecimals(updatedPosition.positionData.feeY, matchingPosition.info.tokenY.decimal)
      }
    };
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

  /** Gets all positions for a pool */
  async getPositionsForPool(poolAddress: string, wallet: PublicKey): Promise<any[]> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
      wallet
    );

    return userPositions;
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
}