import { Solana } from '../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import DLMM from '@meteora-ag/dlmm';
import { MeteoraConfig } from './meteora.config';
import { logger } from '../../services/logger';
import { convertDecimals } from '../../services/base';
import { percentRegexp } from '../../services/config-manager-v2';
import { FeeInfo } from '@meteora-ag/dlmm';

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

  /** Gets LB pairs with optional token filtering */
  async getLbPairs(
    limit: number = 100,
    tokenMintA?: string,
    tokenMintB?: string
  ): Promise<any[]> {
    const timeoutMs = 10000;
    try {
      logger.info('Fetching Meteora LB pairs...');
      const lbPairsPromise = DLMM.getLbPairs(this.solana.connection, {
        cluster: this.solana.network as any
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('getLbPairs timed out')), timeoutMs);
      });

      let lbPairs = (await Promise.race([lbPairsPromise, timeoutPromise])) as any[];
      
      // Filter by tokens if provided
      if (tokenMintA && tokenMintB) {
        lbPairs = lbPairs.filter(pair => 
          (pair.account.tokenXMint.toBase58() === tokenMintA && pair.account.tokenYMint.toBase58() === tokenMintB) ||
          (pair.account.tokenXMint.toBase58() === tokenMintB && pair.account.tokenYMint.toBase58() === tokenMintA)
        );
      } else if (tokenMintA) {
        lbPairs = lbPairs.filter(pair => 
          pair.account.tokenXMint.toBase58() === tokenMintA || 
          pair.account.tokenYMint.toBase58() === tokenMintA
        );
      }

      logger.info(`Found ${lbPairs.length} Meteora LB pairs, returning first ${limit}`);
      return lbPairs.slice(0, limit);
    } catch (error) {
      logger.error('Failed to fetch Meteora LB pairs:', error);
      throw error;
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

    await dlmmPool.refetchStates();

    const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
    const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);

    const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true) - padBins;
    const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false) + padBins;

    return { minBinId, maxBinId };
  }

  /** Gets fee information for a pool */
  async getPoolFeeInfo(poolAddress: string): Promise<FeeInfo> {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    if (!dlmmPool) {
      throw new Error(`Pool not found: ${poolAddress}`);
    }

    await dlmmPool.refetchStates();
    return dlmmPool.getFeeInfo();
  }

} 