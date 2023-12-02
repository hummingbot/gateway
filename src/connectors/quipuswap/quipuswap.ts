import BigNumber from "bignumber.js";
import { isFractionString } from '../../services/validators';
import { UniswapishPriceError } from '../../services/error-handler';
import { QuipuBase } from "./utils/base";
import { QuipuswapConfig } from "./quipuswap.config";
import { SupportedNetwork, TradeInfo } from "./utils/shared/types";
import { Trade } from "swap-router-sdk";
import { ExecutedTrade } from "../plenty/plenty.types";
import { TezosToolkit } from "@taquito/taquito";


export class QuipuSwap extends QuipuBase {
  private static _instances: { [name: string]: QuipuSwap };
  private _gasLimitEstimate: number;

  constructor(network: SupportedNetwork) {
    const config = QuipuswapConfig.config;
    super(config.apiUrl(network), network);
    this._gasLimitEstimate = config.gasLimitEstimate;
  }

  public static getInstance(network: string): QuipuSwap {
    if (QuipuSwap._instances === undefined) {
      QuipuSwap._instances = {};
    }
    if (!(network in QuipuSwap._instances)) {
      QuipuSwap._instances[network] = new QuipuSwap(network as SupportedNetwork);
    }

    return QuipuSwap._instances[network];
  }

  /**
   * Default gas limit used to estimate gasCost for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): BigNumber {
    if (allowedSlippageStr !== undefined && isFractionString(allowedSlippageStr)) {
      const fractionSplit = allowedSlippageStr.split('/');
      const numerator = BigNumber(fractionSplit[0]);
      const denominator = BigNumber(fractionSplit[1]);
      if (fractionSplit[0] !== '0')
        return numerator.multipliedBy(100).dividedBy(denominator);
    }
    const fractionSplit = QuipuswapConfig.config.allowedSlippage.split('/');
    const numerator = BigNumber(fractionSplit[0]);
    const denominator = BigNumber(fractionSplit[1]);
    return BigNumber(numerator.multipliedBy(100).dividedBy(denominator));
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
   * @param allowedSlippage (Optional) should be of the form '1/10'.
   */
  public estimateSellTrade(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
    allowedSlippage?: string
  ): TradeInfo {
    const allowedSlippageBig = this.getAllowedSlippage(allowedSlippage);
    return this.getSellingInfo(baseToken, quoteToken, amount, allowedSlippageBig);
  }

  /**
   * Given the amount of `baseToken` desired to acquire from a transaction,
   * calculate the amount of `quoteToken` needed for the transaction.
   *
   * This is typically used for calculating token buy prices.
   *
   * @param baseToken Token output from the transaction
   * @param quoteToken Token input for the transaction
   * @param amount Amount of `baseToken` desired from the transaction
   * @param allowedSlippage (Optional) should be of the form '1/10'.
   */
  public estimateBuyTrade(
    baseToken: string,
    quoteToken: string,
    amount: BigNumber,
  ): TradeInfo {
    return this.getBuyingInfo(baseToken, quoteToken, amount);
  }

  /**
   * Given a wallet and a Uniswap-ish trade, try to execute it on blockchain.
   *
   * @param wallet TezosToolkit instance
   * @param trade Expected trade
   */
  async executeTrade(
    wallet: TezosToolkit,
    trade: Trade,
  ): Promise<ExecutedTrade> {
    const paramsWithKind = await this.getSwapParams(wallet, trade);
    const batchOp = await wallet.contract.batch(paramsWithKind).send();
    const status = batchOp.status;
    if (status === "applied") {
      return {
        hash: batchOp.hash,
        operations: batchOp.results
      };
    } else {
      throw new UniswapishPriceError('QuipuSwap: trade failed' + status);
    }
  }
}
