import { Solana } from '../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import DLMM, { BinLiquidity } from '@meteora-ag/dlmm';
import { MeteoraConfig } from './meteora.config';
import { DecimalUtil } from '@orca-so/common-sdk';
import { logger } from '../../services/logger';

export class Meteora {
  private static _instances: { [name: string]: Meteora };
  private solana: Solana;
  private _ready: boolean = false;
  public config: MeteoraConfig.NetworkConfig;

  private constructor(network: string) {
    this.config = MeteoraConfig.config;
    this.solana = Solana.getInstance(network);
    this.loadMeteora();
  }

  protected async loadMeteora(): Promise<void> {
    try {
      // Initialize any Meteora-specific setup here
      logger.info("Initializing Meteora");
    } catch (error) {
      logger.error("Failed to initialize Meteora:", error);
      throw error;
    }
  }

  public static getInstance(network: string): Meteora {
    if (!Meteora._instances) {
      Meteora._instances = {};
    }
    if (!Meteora._instances[network]) {
      Meteora._instances[network] = new Meteora(network);
    }
    return Meteora._instances[network];
  }

  public async init() {
    if (!this.solana.ready()) {
      await this.solana.init();
    }
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  async getDlmmPool(poolAddress: string): Promise<DLMM> {
    const pool = await DLMM.create(
      this.solana.connection,
      new PublicKey(poolAddress),
      { cluster: this.solana.network as any }
    );
    await pool.refetchStates();
    return pool;
  }

  async getPositionsOwnedBy(
    poolAddress: string,
    walletAddress?: string
  ) {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    const owner = walletAddress 
      ? new PublicKey(walletAddress)
      : (await this.solana.getWallet(walletAddress)).publicKey;

    const { activeBin, userPositions } = await dlmmPool.getPositionsByUserAndLbPair(owner);

    return {
      activeBin: {
        binId: activeBin.binId,
        price: activeBin.price,
        pricePerToken: activeBin.pricePerToken,
        liquiditySupply: activeBin.supply.toString(),
      },
      userPositions: userPositions.map(position => ({
        positionAddress: position.publicKey.toString(),
        lowerBinId: position.positionData.lowerBinId,
        upperBinId: position.positionData.upperBinId,
        liquidityShares: position.positionData.positionBinData[0].positionLiquidity.toString(),
        rewardInfos: [],
      })),
    };
  }

  async getActiveBin(poolAddress: string) {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    const activeBin: BinLiquidity = await dlmmPool.getActiveBin();

    return {
      binId: activeBin.binId,
      xAmount: DecimalUtil.fromBN(activeBin.xAmount, dlmmPool.tokenX.decimal).toNumber(),
      yAmount: DecimalUtil.fromBN(activeBin.yAmount, dlmmPool.tokenY.decimal).toNumber(),
      price: activeBin.price,
      pricePerToken: activeBin.pricePerToken,
    };
  }
} 