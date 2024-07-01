import { SpectrumConfig } from './spectrum.config';
import { Ergo } from '../../chains/ergo/ergo';
import {
  ErgoAccount,
  ErgoAsset,
} from '../../chains/ergo/interfaces/ergo.interface';
import { Trade } from 'swap-router-sdk';

export class Spectrum {
  private static _instances: { [name: string]: Spectrum };
  private ergo: Ergo;
  private _gasLimitEstimate: number;
  private tokenList: Record<string, ErgoAsset> = {};
  private _ready: boolean = false;

  private constructor(network: string) {
    const config = SpectrumConfig.config;

    this.ergo = Ergo.getInstance(network);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: string): Spectrum {
    if (Spectrum._instances === undefined) {
      Spectrum._instances = {};
    }
    if (!(chain + network in Spectrum._instances)) {
      Spectrum._instances[chain + network] = new Spectrum(network);
    }

    return Spectrum._instances[chain + network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): ErgoAsset {
    return this.tokenList[address];
  }

  public async init() {
    if (!this.ergo.ready()) {
      await this.ergo.init();
    }

    this.tokenList = this.ergo.storedTokenList;

    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Default gas limit for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Given the amount of `baseToken` to put into a transaction, calculate the
   * amount of `quoteToken` that can be expected from the transaction.
   *
   * This is typically used for calculating token sell prices.
   *
   * @param baseToken Token input for the transaction
   * @param quoteToken Output from the transaction
   * @param amount Amount of `baseToken` to put into the transaction
   */
  async estimateSellTrade(
    baseToken: string,
    quoteToken: string,
    amount: bigint,
    allowedSlippage?: string,
  ) {
    return this.ergo.estimateSell(
      baseToken,
      quoteToken,
      amount,
      Number(allowedSlippage),
    );
  }

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   */
  async estimateBuyTrade(
    baseToken: string,
    quoteToken: string,
    amount: bigint,
    allowedSlippage?: string,
  ) {
    return this.ergo.estimateBuy(
      baseToken,
      quoteToken,
      amount,
      Number(allowedSlippage),
    );
  }

  /**
   * Given a wallet and a Ergo trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   */
  async executeTrade(
    wallet: ErgoAccount,
    trade: Trade,
    allowedSlippage?: string,
  ) {
    return this.ergo.buy(
      wallet,
      trade[0].aTokenSlug,
      trade[0].bTokenSlug,
      BigInt(trade[0].aTokenAmount.toString()),
      wallet.address,
      wallet.address,
      Number(allowedSlippage),
    );
  }
}
