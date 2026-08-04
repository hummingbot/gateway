import {
  CpAmm,
  PoolState,
  PositionState,
  getPriceFromSqrtPrice,
  getTokenProgram,
  getTokenDecimals,
  feeNumeratorToBps,
  ActivationType,
} from '@meteora-ag/cp-amm-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../chains/solana/solana';
import { PoolInfo as AmmPoolInfo } from '../../schemas/amm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

import { MeteoraConfig } from './meteora.config';

/** A resolved user position in a DAMM v2 pool (positions are NFTs, not fungible LP tokens). */
export interface DammUserPosition {
  positionNftAccount: PublicKey;
  position: PublicKey;
  positionState: PositionState;
}

/**
 * Meteora DAMM v2 (cp-amm) connector.
 *
 * DAMM v2 is a constant-product AMM whose liquidity is held in NFT positions with a
 * sqrt-price accounting model (see docs/connectors/meteora-damm-v2.md for how its custom
 * features map onto Gateway's AMM interface). This class is intentionally separate from the
 * DLMM `Meteora` class because the two use different SDKs and account models.
 */
export class MeteoraDamm {
  private static _instances: { [name: string]: MeteoraDamm };
  public solana: Solana;
  public cpAmm: CpAmm;
  public config: MeteoraConfig.RootConfig;

  private constructor() {
    this.config = MeteoraConfig.config;
    this.solana = null;
  }

  /** Gets singleton instance of MeteoraDamm for a network */
  public static async getInstance(network: string): Promise<MeteoraDamm> {
    if (!MeteoraDamm._instances) {
      MeteoraDamm._instances = {};
    }
    if (!MeteoraDamm._instances[network]) {
      const instance = new MeteoraDamm();
      await instance.init(network);
      MeteoraDamm._instances[network] = instance;
    }
    return MeteoraDamm._instances[network];
  }

  private async init(network: string) {
    this.solana = await Solana.getInstance(network);
    this.cpAmm = new CpAmm(this.solana.connection);
    logger.info('Initializing Meteora DAMM v2 (cp-amm)');
  }

  /** Fetches on-chain pool state, throwing a clean 404 if the address is not a DAMM v2 pool */
  async getPoolState(poolAddress: string): Promise<PoolState> {
    let poolPubkey: PublicKey;
    try {
      poolPubkey = new PublicKey(poolAddress);
    } catch {
      throw httpErrors.badRequest(`Invalid pool address: ${poolAddress}`);
    }
    try {
      return await this.cpAmm.fetchPoolState(poolPubkey);
    } catch (error) {
      logger.debug(`Could not decode ${poolAddress} as Meteora DAMM v2 pool: ${error.message}`);
      throw httpErrors.notFound(`Pool not found: ${poolAddress}`);
    }
  }

  /** Returns the SPL token programs (Token / Token-2022) for each side of the pool */
  getTokenPrograms(poolState: PoolState): { tokenAProgram: PublicKey; tokenBProgram: PublicKey } {
    return {
      tokenAProgram: getTokenProgram(poolState.tokenAFlag),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag),
    };
  }

  /** Resolves the token decimals for both sides of the pool from on-chain mints */
  async getTokenDecimals(poolState: PoolState): Promise<{ tokenADecimal: number; tokenBDecimal: number }> {
    const { tokenAProgram, tokenBProgram } = this.getTokenPrograms(poolState);
    const [tokenADecimal, tokenBDecimal] = await Promise.all([
      getTokenDecimals(this.solana.connection, poolState.tokenAMint, tokenAProgram),
      getTokenDecimals(this.solana.connection, poolState.tokenBMint, tokenBProgram),
    ]);
    return { tokenADecimal, tokenBDecimal };
  }

  /** Current base (cliff) fee of the pool as a percentage (e.g. 0.25 for 0.25%) */
  async getFeePct(poolAddress: string): Promise<number> {
    try {
      const decoded = await this.cpAmm.fetchPoolFees(new PublicKey(poolAddress));
      if (decoded && (decoded as any).cliffFeeNumerator) {
        return feeNumeratorToBps((decoded as any).cliffFeeNumerator) / 100;
      }
    } catch (error) {
      logger.warn(`Could not decode fees for pool ${poolAddress}: ${error.message}`);
    }
    return 0;
  }

  /**
   * The pool's activation-clock reading used by remove-liquidity/vesting math: a slot number
   * for slot-activated pools, a unix timestamp for timestamp-activated pools.
   */
  getCurrentPoint(poolState: PoolState, currentSlot: number, currentTime: number): BN {
    return new BN(poolState.activationType === ActivationType.Timestamp ? currentTime : currentSlot);
  }

  /** Price of the pool as quote (token B) per base (token A) */
  getPrice(poolState: PoolState, tokenADecimal: number, tokenBDecimal: number): number {
    return Number(getPriceFromSqrtPrice(poolState.sqrtPrice, tokenADecimal, tokenBDecimal).toString());
  }

  /** Gets AMM pool information in Gateway's standard shape (base = token A, quote = token B) */
  async getPoolInfo(poolAddress: string): Promise<AmmPoolInfo> {
    const poolState = await this.getPoolState(poolAddress);
    const { tokenADecimal, tokenBDecimal } = await this.getTokenDecimals(poolState);

    const [reserveA, reserveB, feePct] = await Promise.all([
      this.solana.connection.getTokenAccountBalance(poolState.tokenAVault),
      this.solana.connection.getTokenAccountBalance(poolState.tokenBVault),
      this.getFeePct(poolAddress),
    ]);

    return {
      address: poolAddress,
      baseTokenAddress: poolState.tokenAMint.toBase58(),
      quoteTokenAddress: poolState.tokenBMint.toBase58(),
      feePct,
      price: this.getPrice(poolState, tokenADecimal, tokenBDecimal),
      baseTokenAmount: reserveA.value.uiAmount ?? 0,
      quoteTokenAmount: reserveB.value.uiAmount ?? 0,
    };
  }

  /**
   * Gets the wallet's positions in a pool, sorted by unlocked liquidity (largest first).
   * A wallet can hold multiple NFT positions in the same pool; AMM-interface routes operate
   * on the largest one (see the connector doc).
   */
  async getUserPositions(poolAddress: string, walletAddress: string): Promise<DammUserPosition[]> {
    const pool = new PublicKey(poolAddress);
    const owner = new PublicKey(walletAddress);
    const positions = await this.cpAmm.getUserPositionByPool(pool, owner);
    return positions.sort((a, b) => (b.positionState.unlockedLiquidity.gt(a.positionState.unlockedLiquidity) ? 1 : -1));
  }
}
