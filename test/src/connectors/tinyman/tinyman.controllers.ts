import Decimal from 'decimal.js-light';
import {
  HttpException,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_CODE,
  TRADE_FAILED_ERROR_MESSAGE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency } from '../../services/base';
import { logger } from '../../services/logger';
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { Tinyman } from './tinyman';
import { Account } from 'algosdk';
import { Algorand } from '../../chains/algorand/algorand';

export async function price(
  algorand: Algorand,
  tinyman: Tinyman,
  req: PriceRequest
): Promise<PriceResponse> {
  const startTimestamp: number = Date.now();
  let trade;
  try {
    trade = await tinyman.estimateTrade(req);
  } catch (e) {
    if (e instanceof Error) {
      throw new HttpException(
        500,
        PRICE_FAILED_ERROR_MESSAGE + e.message,
        PRICE_FAILED_ERROR_CODE
      );
    } else {
      throw new HttpException(
        500,
        UNKNOWN_ERROR_MESSAGE,
        UNKNOWN_ERROR_ERROR_CODE
      );
    }
  }

  return {
    network: algorand.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedAmount: String(trade.expectedAmount),
    price: String(trade.expectedPrice),
    gasPrice: algorand.gasPrice,
    gasPriceToken: algorand.nativeTokenSymbol,
    gasLimit: algorand.gasLimit,
    gasCost: String(algorand.gasCost),
  };
}

export async function trade(
  algorand: Algorand,
  tinyman: Tinyman,
  req: TradeRequest
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();

  const limitPrice = req.limitPrice;
  const account: Account = await algorand.getAccountFromAddress(req.address);

  let trade;
  try {
    trade = await tinyman.estimateTrade(<PriceRequest>req);
  } catch (e) {
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE
    );
  }

  const estimatedPrice = trade.expectedPrice;
  logger.info(
    `Expected execution price is ${estimatedPrice}, ` +
      `limit price is ${limitPrice}.`
  );

  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(estimatedPrice).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
          estimatedPrice,
          limitPrice
        ),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE
      );
    }
  } else {
    if (limitPrice && new Decimal(estimatedPrice).lt(new Decimal(limitPrice))) {
      logger.error('Swap price lower than limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
          estimatedPrice,
          limitPrice
        ),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE
      );
    }
  }
  const tx = await tinyman.executeTrade(
    account,
    trade.trade,
    req.side === 'BUY'
  );

  logger.info(`${req.side} swap has been executed.`);

  return {
    network: algorand.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedIn: String(trade.expectedAmount),
    price: String(estimatedPrice),
    gasPrice: algorand.gasPrice,
    gasPriceToken: algorand.nativeTokenSymbol,
    gasLimit: algorand.gasLimit,
    gasCost: String(algorand.gasCost),
    txHash: tx.txnID,
  };
}

export async function estimateGas(
  algorand: Algorand,
  _tinyman: Tinyman
): Promise<EstimateGasResponse> {
  return {
    network: algorand.network,
    timestamp: Date.now(),
    gasPrice: algorand.gasPrice,
    gasPriceToken: algorand.nativeTokenSymbol,
    gasLimit: algorand.gasLimit,
    gasCost: String(algorand.gasCost),
  };
}
