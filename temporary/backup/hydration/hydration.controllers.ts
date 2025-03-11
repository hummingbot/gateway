import { Hydration } from './hydration';
// noinspection ES6PreferShortImport
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
// noinspection ES6PreferShortImport
import { Polkadot } from '../../chains/polkadot/polkadot';
// noinspection ES6PreferShortImport
import {
  HttpException,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_CODE,
  TRADE_FAILED_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
// noinspection ES6PreferShortImport
import { latency } from '../../services/base';
import Decimal from 'decimal.js-light';
// noinspection ES6PreferShortImport
import { logger } from '../../services/logger';

export async function price(
  polkadot: Polkadot,
  hydration: Hydration,
  req: PriceRequest,
): Promise<PriceResponse> {
  const startTimestamp = Date.now();
  let trade: any;
  let tradeHuman: any;
  try {
    req.base = req.base.replace(/[_-]+$/, '');
    req.quote = req.quote.replace(/[_-]+$/, '');
    trade = await hydration.estimateTrade(req);
    tradeHuman = trade.toHuman();
  } catch (e) {
    if (e instanceof Error) {
      throw new HttpException(
        500,
        PRICE_FAILED_ERROR_MESSAGE + e.message,
        PRICE_FAILED_ERROR_CODE,
      );
    } else {
      throw new HttpException(
        500,
        UNKNOWN_ERROR_MESSAGE,
        UNKNOWN_ERROR_ERROR_CODE,
      );
    }
  }

  return {
    network: polkadot.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedAmount: tradeHuman.amountOut,
    price: tradeHuman.spotPrice,
    gasPrice: polkadot.gasPrice,
    gasPriceToken: polkadot.nativeTokenSymbol,
    gasLimit: polkadot.gasLimit,
    gasCost: tradeHuman.tradeFee,
    gasWanted: null,
  } as PriceResponse;
}

export async function trade(
  polkadot: Polkadot,
  hydration: Hydration,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp = Date.now();
  const limitPrice = req.limitPrice;
  let trade: any;
  let tradeHuman: any;
  try {
    req.base = req.base.replace(/[_-]+$/, '');
    req.quote = req.quote.replace(/[_-]+$/, '');
    trade = await hydration.estimateTrade(req as PriceRequest);
    tradeHuman = trade.toHuman();
  } catch (e) {
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE,
    );
  }

  const estimatedPrice = trade.expectedPrice;
  logger.info(
    `Expected execution price is ${estimatedPrice}, limit price is ${limitPrice}.`,
  );

  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(estimatedPrice).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
          estimatedPrice,
          limitPrice,
        ),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
      );
    }
  } else {
    if (limitPrice && new Decimal(estimatedPrice).lt(new Decimal(limitPrice))) {
      logger.error('Swap price lower than limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
          estimatedPrice,
          limitPrice,
        ),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
      );
    }
  }

  const txHash = (await hydration.executeTrade(req.address, trade)).txHash;
  logger.info(`${req.side} swap has been executed.`);

  return {
    network: polkadot.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    finalAmountReceived: null,
    rawAmount: req.amount,
    finalAmountReceived_basetoken: null,
    price: tradeHuman.spotPrice,
    expectedIn: tradeHuman.amountOut,
    expectedOut: null,
    expectedPrice: null,
    gasPrice: polkadot.gasPrice,
    gasPriceToken: polkadot.nativeTokenSymbol,
    gasLimit: polkadot.gasLimit,
    gasWanted: null,
    gasCost: tradeHuman.tradeFee,
    nonce: null,
    txHash,
  };
}

export async function estimateGas(
  polkadot: Polkadot,
  _hydration: Hydration,
): Promise<EstimateGasResponse> {
  return {
    network: polkadot.network,
    timestamp: Date.now(),
    gasPrice: polkadot.gasPrice,
    gasPriceToken: polkadot.nativeTokenSymbol,
    gasLimit: polkadot.gasLimit,
    gasCost: String(polkadot.gasCost),
  };
}
