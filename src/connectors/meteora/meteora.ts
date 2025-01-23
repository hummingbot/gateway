import { Solana } from '../../chains/solana/solana';
import { PublicKey, Keypair } from '@solana/web3.js';
import DLMM, { BinLiquidity } from '@meteora-ag/dlmm';
import { MeteoraConfig } from './meteora.config';
import { DecimalUtil } from '@orca-so/common-sdk';
import Decimal from 'decimal.js';
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

  private convertDecimals(value: any, decimals: number): string {
    return DecimalUtil.adjustDecimals(new Decimal(value.toString()), decimals).toString();
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
    wallet: Keypair
  ) {
    const dlmmPool = await this.getDlmmPool(poolAddress);
    await dlmmPool.refetchStates();

    const owner = wallet.publicKey;
    const { activeBin, userPositions } = await dlmmPool.getPositionsByUserAndLbPair(owner);

    const adjustedActiveBin = {
      ...activeBin,
      xAmount: this.convertDecimals(activeBin.xAmount, dlmmPool.tokenX.decimal) as any,
      yAmount: this.convertDecimals(activeBin.yAmount, dlmmPool.tokenY.decimal) as any,
    };
    const adjustedUserPositions = userPositions.map((position) => {
      const { positionData } = position;
      const tokenXDecimals = dlmmPool.tokenX.decimal;
      const tokenYDecimals = dlmmPool.tokenY.decimal;

      return {
        ...position,
        positionData: {
        ...positionData,
        positionBinData: positionData.positionBinData.map((binData) => ({
          ...binData,
          binXAmount: this.convertDecimals(binData.binXAmount, tokenXDecimals),
          binYAmount: this.convertDecimals(binData.binYAmount, tokenYDecimals),
          positionXAmount: this.convertDecimals(binData.positionXAmount, tokenXDecimals),
          positionYAmount: this.convertDecimals(binData.positionYAmount, tokenYDecimals),
        })),
        totalXAmount: this.convertDecimals(positionData.totalXAmount, tokenXDecimals),
        totalYAmount: this.convertDecimals(positionData.totalYAmount, tokenYDecimals),
        feeX: this.convertDecimals(positionData.feeX, tokenXDecimals),
        feeY: this.convertDecimals(positionData.feeY, tokenYDecimals),
        rewardOne: this.convertDecimals(positionData.rewardOne, tokenXDecimals),
        rewardTwo: this.convertDecimals(positionData.rewardTwo, tokenYDecimals),
        lastUpdatedAt: DecimalUtil.fromBN(positionData.lastUpdatedAt).toString(),
        },
      };
    });

    return {
      activeBin: adjustedActiveBin,
      userPositions: adjustedUserPositions,
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