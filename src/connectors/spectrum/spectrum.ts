import { SpectrumConfig } from './spectrum.config';
import { Ergo } from '../../chains/ergo/ergo';
import { ErgoAsset } from '../../chains/ergo/interfaces/ergo.interface';
import { BigNumber } from 'bignumber.js';
import { PriceRequest, TradeRequest } from '../../amm/amm.requests';

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
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token prices.
   *
   * @param quoteToken Token input for the transaction
   * @param baseToken Token output from the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   */
  async estimateTrade(req: PriceRequest) {
    if (req.side === 'SELL')
      return this.ergo.estimate(
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        Number(req.allowedSlippage),
      );
    else if (req.side === 'BUY')
      return this.ergo.estimate(
        req.quote.replace("_", ""),
        req.base.replace("_", ""),
        BigNumber(req.amount),
        Number(req.allowedSlippage),
      );
    else
      return this.ergo.estimate(
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        Number(req.allowedSlippage),
      );
  }

  /**
   * Given a wallet and a Ergo trade, try to execute it on blockchain.
   *
   * @param wallet Wallet
   * @param trade Expected trade
   */
  async executeTrade(req: TradeRequest) {
    const account = await this.ergo.getAccountFromAddress(
      req.address as unknown as string,
    );
    if (req.side === 'SELL')
      return this.ergo.swap(
        account,
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.address,
        req.address,
        Number(req.allowedSlippage),
      );
    else if (req.side === 'BUY')
      return this.ergo.swap(
        account,
        req.quote.replace("_", ""),
        req.base.replace("_", ""),
        BigNumber(req.amount),
        req.address,
        req.address,
        Number(req.allowedSlippage),
      );
    else
      return this.ergo.swap(
        account,
        req.base.replace("_", ""),
        req.quote.replace("_", ""),
        BigNumber(req.amount),
        req.address,
        req.address,
        Number(req.allowedSlippage),
      );
  }
}
