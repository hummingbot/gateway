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
import { latency } from '../../services/base';
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { Stonfi } from './ston_fi';
import { Ton } from '../../chains/ton/ton';
import { logger } from '../../services/logger';
import Decimal from 'decimal.js-light';

export const price = async (
  ton: Ton,
  stonfi: Stonfi,
  req: PriceRequest,
): Promise<PriceResponse> => {
  const startTimestamp: number = Date.now();
  let trade;
  try {
    trade = await stonfi.estimateTrade(req);
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
    network: ton.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedAmount: String(trade.expectedAmount),
    price: String(trade.expectedPrice),
    gasPrice: ton.gasPrice,
    gasPriceToken: ton.nativeTokenSymbol,
    gasLimit: ton.gasLimit,
    gasCost: String(ton.gasCost),
  };
};

export async function trade(
  ton: Ton,
  stonfi: Stonfi,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();

  const limitPrice = req.limitPrice;
  const account = await ton.getAccountFromAddress(req.address);

  let trade;

  try {
    trade = await stonfi.estimateTrade(<PriceRequest>req);
  } catch (e) {
    console.error(e);
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE,
    );
  }

  const estimatedPrice = trade.expectedPrice;
  logger.info(
    `Expected execution price is ${estimatedPrice}, ` +
      `limit price is ${limitPrice}.`,
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
  const transactionHash = await stonfi.executeTrade(
    account.publicKey,
    trade.trade,
    req.base,
    req.quote,
    req.side === 'BUY',
  );

  logger.info(`${req.side} swap has been executed.`);

  return {
    network: ton.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedIn: String(trade.expectedAmount),
    price: String(estimatedPrice),
    gasPrice: ton.gasPrice,
    gasPriceToken: ton.nativeTokenSymbol,
    gasLimit: ton.gasLimit,
    gasCost: String(ton.gasCost),
    txHash: transactionHash,
  };
}

export async function estimateGas(
  ton: Ton,
  _stonfi: Stonfi,
): Promise<EstimateGasResponse> {
  return {
    network: ton.network,
    timestamp: Date.now(),
    gasPrice: ton.gasPrice,
    gasPriceToken: ton.nativeTokenSymbol,
    gasLimit: ton.gasLimit,
    gasCost: String(ton.gasCost),
  };
}
