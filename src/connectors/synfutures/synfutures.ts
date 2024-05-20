import {
  InitializationError,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { isFractionString } from '../../services/validators';
import { SynFuturesConfig } from './synfutures.config';
import {
  SynFuturesV3,
  Status as AMMStatus,
  InstrumentCondition,
  Side,
  encodeTradeParam,
  NULL_DDL,
  PairModel,
} from '@synfutures/oyster-sdk';
import { Token } from '@uniswap/sdk';
import { Transaction, Wallet, ethers } from 'ethers';
import { percentRegexp } from '../../services/config-manager-v2';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { SynFuturesish } from '../../services/common-interfaces';
import { getAddress, isAddress } from 'ethers/lib/utils';
import { PerpPosition } from '../perp/perp';

function toTickerSymbol(symbol: string) {
  const index = symbol.lastIndexOf('-');

  if (index === -1) {
    throw new Error('invalid symbol: ' + symbol);
  }

  return symbol.substring(0, index - 1);
}

function formatSlippage(slippage: number) {
  return Math.floor(slippage * 10000);
}

export class SynFutures implements SynFuturesish {
  private static _instances: { [name: string]: SynFutures };
  private ethereum: Ethereum;
  private _synfutures: SynFuturesV3;
  private _chain: string;
  private chainId;
  private tokenList: Record<string, Token> = {};
  private tokenSymbol: Record<string, Token> = {};
  private _ready: boolean = false;
  public gasLimit = 1500000;

  private constructor(chain: string, network: string) {
    this._chain = chain;
    this.ethereum = Ethereum.getInstance(network);
    this.chainId = this.ethereum.chainId;
    this._synfutures = SynFuturesV3.getInstance(network);
    this._synfutures.setProvider(this.ethereum.provider);
  }

  public get synfutures(): SynFuturesV3 {
    return this._synfutures;
  }

  public static getInstance(chain: string, network: string): SynFutures {
    if (SynFutures._instances === undefined) {
      SynFutures._instances = {};
    }

    if (!(chain + network in SynFutures._instances)) {
      SynFutures._instances[chain + network] = new SynFutures(chain, network);
    }

    return SynFutures._instances[chain + network];
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    return this.tokenList[getAddress(address)];
  }

  public async init() {
    if (this._chain == 'ethereum' && !this.ethereum.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE('ETH'),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    for (const token of this.ethereum.storedTokenList) {
      const _token = new Token(
        this.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name,
      );
      this.tokenList[token.address] = _token;
      this.tokenSymbol[token.symbol] = _token;
    }
    await this._synfutures.init();
    this._ready = true;
  }

  public ready(): boolean {
    return this._ready;
  }

  /**
   * Gets the allowed slippage percent from the optional parameter or the value
   * in the configuration.
   *
   * @param allowedSlippageStr (Optional) should be of the form '1/10'.
   */
  public getAllowedSlippage(allowedSlippageStr?: string): number {
    let allowedSlippage;
    if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
      allowedSlippage = allowedSlippageStr;
    } else allowedSlippage = SynFuturesConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return Number(nd[1]) / Number(nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.',
    );
  }

  private get pairs() {
    return Object.fromEntries(
      Array.from(this._synfutures.instrumentMap.values())
        .map((instrument) => {
          if (instrument.state.condition === InstrumentCondition.NORMAL) {
            return Array.from(instrument.pairs.values()).map((pair) => {
              if (
                pair.amm.status === AMMStatus.TRADING ||
                pair.amm.status === AMMStatus.SETTLING
              ) {
                return [toTickerSymbol(instrument.info.symbol), pair];
              } else {
                return null;
              }
            });
          } else {
            return null;
          }
        })
        .flat()
        .filter((p) => p !== null) as [string, PairModel][],
    );
  }

  /**
   * @returns a list of available marker pairs.
   */
  availablePairs(): string[] {
    return Array.from(Object.keys(this.pairs));
  }

  /**
   * Queries for the market, index and indexTwap prices for a given market pair.
   * @param tickerSymbol Market pair
   */
  async prices(tickerSymbol: string): Promise<{
    markPrice: ethers.BigNumber;
    indexPrice: ethers.BigNumber;
    indexTwapPrice: ethers.BigNumber;
    fairPrice: ethers.BigNumber;
  }> {
    let pair = this.pairs[tickerSymbol];

    if (!pair) {
      throw new Error('invalid ticker symbol: ' + tickerSymbol);
    }

    // update instrument cache
    const [instrument] = await this.synfutures.updateInstrument([
      {
        instrument: pair.rootInstrument.info.addr,
        expiries: [pair.amm.expiry],
      },
    ]);

    pair = instrument.pairs.get(pair.amm.expiry)!;

    return {
      markPrice: pair.markPrice,
      indexPrice: await this.synfutures.getRawSpotPrice({
        marketType: pair.rootInstrument.marketType,
        baseSymbol: pair.rootInstrument.info.base,
        quoteSymbol: pair.rootInstrument.info.quote,
      }),
      // NOTE: synfutures does not have indexTwapPrice, so use markPrice instead
      indexTwapPrice: pair.markPrice,
      fairPrice: pair.fairPriceWad,
    };
  }

  /**
   * Used to know if a market is active/tradable.
   * @param tickerSymbol Market pair
   * @returns true | false
   */
  async isMarketActive(tickerSymbol: string): Promise<boolean> {
    const pair = this.pairs[tickerSymbol];

    return (
      pair &&
      pair.rootInstrument.state.condition === InstrumentCondition.NORMAL &&
      (pair.amm.status === AMMStatus.TRADING ||
        pair.amm.status === AMMStatus.SETTLING)
    );
  }

  /**
   * Gets available Position.
   * @param address User address.
   * @param tickerSymbol An optional parameter to get specific position.
   * @returns Return all Positions or specific position.
   */
  async getPositions(
    address: string,
    tickerSymbol: string,
  ): Promise<PerpPosition | undefined> {
    const pair = this.pairs[tickerSymbol];

    if (!pair) {
      throw new Error('invalid ticker symbol: ' + tickerSymbol);
    }

    const account = await this.synfutures.updatePairLevelAccount(
      address,
      pair.rootInstrument.info.addr,
      pair.amm.expiry,
    );

    const position = account.position;

    return {
      positionAmt: position.size.abs().toString(),
      positionSide: position.size.gt(0) ? 'LONG' : 'SHORT',
      unrealizedProfit: position.unrealizedPnl.toString(),
      leverage: ethers.utils.formatUnits(position.leverageWad),
      entryPrice: position.entryNotional.div(position.size.abs()).toString(),
      tickerSymbol,
      pendingFundingPayment: position.unrealizedFundingFee.toString(),
    };
  }

  /**
   * Given the necessary parameters, open a position.
   * @param wallet User wallet.
   * @param isLong Will create a long position if true, else a short pos will be created.
   * @param tickerSymbol the market to create position on.
   * @param amount the amount for the position to be opened.
   * @param nonce EVM nonce.
   * @param allowedSlippage Slippage.
   * @returns An ethers transaction object.
   */
  async openPosition(
    wallet: Wallet,
    isLong: boolean,
    tickerSymbol: string,
    amount: string,
    nonce?: number,
    allowedSlippage?: string,
  ): Promise<Transaction> {
    const side = isLong ? Side.LONG : Side.SHORT;

    const baseSize = ethers.BigNumber.from(amount);

    const pair = this.pairs[tickerSymbol];

    if (!pair) {
      throw new Error('invalid ticker symbol: ' + tickerSymbol);
    }

    const slippage = formatSlippage(this.getAllowedSlippage(allowedSlippage));

    const account = await this.synfutures.updatePairLevelAccount(
      wallet.address,
      pair.rootInstrument.info.addr,
      pair.amm.expiry,
    );

    const { quotation, quoteAmount } = await this.synfutures.inquireByBase(
      pair,
      side,
      baseSize,
    );

    const { tradePrice } = this.synfutures.simulateTrade(
      account,
      quotation,
      side,
      baseSize,
      quoteAmount,
      undefined,
      slippage,
    );

    const limitTick = this.synfutures.getLimitTick(tradePrice, slippage, side);

    const instrument = this.synfutures.getInstrumentContract(
      pair.rootInstrument.info.addr,
      wallet,
    );

    return instrument.trade(
      encodeTradeParam(
        pair.amm.expiry,
        baseSize.mul(side === Side.LONG ? 1 : -1),
        quoteAmount,
        limitTick,
        NULL_DDL, // TODO: set deadline
      ),
      {
        nonce,
      },
    );
  }

  /**
   * Closes an open position on the specified market.
   * @param wallet User wallet.
   * @param tickerSymbol The market on which we want to close position.
   * @param nonce EVM nonce.
   * @param allowedSlippage Slippage.
   * @returns An ethers transaction object.
   */
  async closePosition(
    wallet: Wallet,
    tickerSymbol: string,
    nonce?: number,
    allowedSlippage?: string,
  ): Promise<Transaction> {
    const pair = this.pairs[tickerSymbol];

    if (!pair) {
      throw new Error('invalid ticker symbol: ' + tickerSymbol);
    }

    const account = await this.synfutures.updatePairLevelAccount(
      wallet.address,
      pair.rootInstrument.info.addr,
      pair.amm.expiry,
    );

    const position = account.position;

    if (position.size.eq(0)) {
      throw new Error('unknown position');
    }

    const side = position.size.gt(0) ? Side.SHORT : Side.LONG;

    const baseSize = position.size.abs();

    const slippage = formatSlippage(this.getAllowedSlippage(allowedSlippage));

    const { quotation } = await this.synfutures.inquireByBase(
      pair,
      side,
      baseSize,
    );

    const { tradePrice } = this.synfutures.simulateTrade(
      account,
      quotation,
      side,
      baseSize,
      undefined,
      undefined,
      slippage,
    );

    const limitTick = this.synfutures.getLimitTick(tradePrice, slippage, side);

    const instrument = this.synfutures.getInstrumentContract(
      pair.rootInstrument.info.addr,
      wallet,
    );

    return instrument.trade(
      encodeTradeParam(
        pair.amm.expiry,
        baseSize.mul(side === Side.LONG ? 1 : -1),
        ethers.BigNumber.from(0),
        limitTick,
        NULL_DDL, // TODO: set deadline
      ),
      {
        nonce,
      },
    );
  }

  /**
   * Function for getting account value
   * @param address User address.
   * @param quote Quote token symbol or address
   * @returns account value
   */
  async getAccountValue(
    address: string,
    quote: string,
  ): Promise<ethers.BigNumber> {
    if (isAddress(quote)) {
      return this.synfutures.contracts.gate.reserveOf(quote, address);
    } else {
      const token = this.tokenSymbol[quote];

      if (!token) {
        throw new Error('unknown quote: ' + quote);
      }

      return this.synfutures.contracts.gate.reserveOf(token.address, address);
    }
  }
}
