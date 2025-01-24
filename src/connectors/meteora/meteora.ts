import { Solana } from '../../chains/solana/solana';
import { PublicKey } from '@solana/web3.js';
import DLMM, { LbPairAccount } from '@meteora-ag/dlmm';
import { MeteoraConfig } from './meteora.config';
import { DecimalUtil } from '@orca-so/common-sdk';
import Decimal from 'decimal.js';
import { logger } from '../../services/logger';
import { convertDecimals } from '../../services/base';
import { BN } from 'bn.js';

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

  async getLbPairs() {
    const lbPairs = await DLMM.getLbPairs(this.solana.connection);
    return lbPairs.map((pair: LbPairAccount) => ({
      publicKey: pair.publicKey.toString(),
      account: {
        parameters: pair.account.parameters,
        vParameters: pair.account.vParameters,
        binArrayBitmap: pair.account.binArrayBitmap.map(bn => bn.toNumber())
      }
    }));
  }

  async getFeesQuote(positionAddress: string, wallet: PublicKey) {
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
      logger.error('Position not found');
    }

    const dlmmPool = await this.getDlmmPool(matchingPosition.info.publicKey.toBase58());
    await dlmmPool.refetchStates();

    const positionsState = await dlmmPool.getPositionsByUserAndLbPair(wallet);
    const updatedPosition = positionsState.userPositions.find(
      position => position.publicKey.equals(matchingPosition.position.publicKey)
    );

    if (!updatedPosition) {
      logger.error('Updated position not found');
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

  async getSwapQuote(
    solana: Solana,
    inputTokenSymbol: string,
    outputTokenSymbol: string,
    amount: number,
    poolAddress: string,
    slippagePct: number = 1
  ) {
    const inputToken = await solana.getTokenBySymbol(inputTokenSymbol);
    const outputToken = await solana.getTokenBySymbol(outputTokenSymbol);

    const dlmmPool = await this.getDlmmPool(poolAddress);
    await dlmmPool.refetchStates();

    const swapAmount = DecimalUtil.toBN(new Decimal(amount), inputToken.decimals);
    const swapForY = inputToken.address === dlmmPool.tokenX.publicKey.toBase58();
    const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
    const slippage = new BN(slippagePct * 100);

    const quote = dlmmPool.swapQuote(swapAmount, swapForY, slippage, binArrays);

    return {
      estimatedAmountIn: DecimalUtil.fromBN(quote.consumedInAmount, inputToken.decimals).toString(),
      estimatedAmountOut: DecimalUtil.fromBN(quote.outAmount, outputToken.decimals).toString(),
      minOutAmount: DecimalUtil.fromBN(quote.minOutAmount, outputToken.decimals).toString()
    };
  }
} 