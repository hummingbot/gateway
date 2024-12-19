import {
  HttpException,
  UniswapishPriceError,
  PRICE_FAILED_ERROR_MESSAGE,
  PRICE_FAILED_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_CODE,
  TRADE_FAILED_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
  INSUFFICIENT_FUNDS_ERROR_CODE,
  INSUFFICIENT_FUNDS_ERROR_MESSAGE,
  NETWORK_ERROR_CODE,
  NETWORK_ERROR_MESSAGE,
  AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE,
  AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency } from '../../services/base';
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { Dedust } from './dedust';
import { Ton } from '../../chains/ton/ton';
import { logger } from '../../services/logger';
import Decimal from 'decimal.js-light';

export const price = async (
  ton: Ton,
  dedust: Dedust,
  req: PriceRequest,
): Promise<PriceResponse> => {
  const startTimestamp: number = Date.now();

  // Check if services are initialized
  if (!ton.ready() || !dedust.ready()) {
    throw new HttpException(
      503,
      SERVICE_UNITIALIZED_ERROR_MESSAGE('TON or Dedust'),
      SERVICE_UNITIALIZED_ERROR_CODE,
    );
  }

  let trade;
  try {
    trade = await dedust.estimateTrade(req);
  } catch (e) {
    if (e instanceof UniswapishPriceError) {
      throw new HttpException(500, e.message, PRICE_FAILED_ERROR_CODE);
    }
    if (e instanceof Error) {
      if (e.message.includes('insufficient funds')) {
        throw new HttpException(
          400,
          INSUFFICIENT_FUNDS_ERROR_MESSAGE,
          INSUFFICIENT_FUNDS_ERROR_CODE,
        );
      }
      if (e.message.includes('network')) {
        throw new HttpException(503, NETWORK_ERROR_MESSAGE, NETWORK_ERROR_CODE);
      }
      if (e.message.includes('min amount')) {
        throw new HttpException(
          400,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE,
        );
      }
      throw new HttpException(
        500,
        PRICE_FAILED_ERROR_MESSAGE + e.message,
        PRICE_FAILED_ERROR_CODE,
      );
    }
    throw new HttpException(
      500,
      UNKNOWN_ERROR_MESSAGE,
      UNKNOWN_ERROR_ERROR_CODE,
    );
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
  dedust: Dedust,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();

  // Check if services are initialized
  if (!ton.ready() || !dedust.ready()) {
    throw new HttpException(
      503,
      SERVICE_UNITIALIZED_ERROR_MESSAGE('TON or Dedust'),
      SERVICE_UNITIALIZED_ERROR_CODE,
    );
  }

  const limitPrice = req.limitPrice;

  let trade;
  try {
    trade = await dedust.estimateTrade(<PriceRequest>req);
  } catch (e) {
    if (e instanceof UniswapishPriceError) {
      throw new HttpException(500, e.message, TRADE_FAILED_ERROR_CODE);
    }
    if (e instanceof Error) {
      if (e.message.includes('insufficient funds')) {
        throw new HttpException(
          400,
          INSUFFICIENT_FUNDS_ERROR_MESSAGE,
          INSUFFICIENT_FUNDS_ERROR_CODE,
        );
      }
      if (e.message.includes('network')) {
        throw new HttpException(503, NETWORK_ERROR_MESSAGE, NETWORK_ERROR_CODE);
      }
      if (e.message.includes('min amount')) {
        throw new HttpException(
          400,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE,
        );
      }
      throw new HttpException(
        500,
        TRADE_FAILED_ERROR_MESSAGE + e.message,
        TRADE_FAILED_ERROR_CODE,
      );
    }
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE + UNKNOWN_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE,
    );
  }

  const estimatedPrice = trade.expectedPrice;
  logger.info(
    `Expected execution price is ${estimatedPrice}, ` +
      `limit price is ${limitPrice}.`,
  );

  // Price validation against limit price
  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(estimatedPrice).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        400,
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
        400,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
          estimatedPrice,
          limitPrice,
        ),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
      );
    }
  }

  // Execute the trade
  let txResult;
  try {
    txResult = await dedust.executeTrade(
      req.address,
      trade.trade,
      req.side === 'BUY',
    );

    if (!txResult.success) {
      throw new HttpException(
        500,
        txResult.error || TRADE_FAILED_ERROR_MESSAGE,
        TRADE_FAILED_ERROR_CODE,
      );
    }

    logger.info(`${req.side} swap has been executed.`);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('insufficient funds')) {
        throw new HttpException(
          400,
          INSUFFICIENT_FUNDS_ERROR_MESSAGE,
          INSUFFICIENT_FUNDS_ERROR_CODE,
        );
      }
      if (e.message.includes('network')) {
        throw new HttpException(503, NETWORK_ERROR_MESSAGE, NETWORK_ERROR_CODE);
      }
      if (e.message.includes('min amount')) {
        throw new HttpException(
          400,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE,
        );
      }
      throw new HttpException(
        500,
        TRADE_FAILED_ERROR_MESSAGE + e.message,
        TRADE_FAILED_ERROR_CODE,
      );
    }
    throw new HttpException(
      500,
      TRADE_FAILED_ERROR_MESSAGE + UNKNOWN_ERROR_MESSAGE,
      TRADE_FAILED_ERROR_CODE,
    );
  }

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
    txHash: txResult.txId,
  };
}

export async function estimateGas(
  ton: Ton,
  dedust: Dedust,
): Promise<EstimateGasResponse> {
  // Check if services are initialized
  if (!ton.ready() || !dedust.ready()) {
    throw new HttpException(
      503,
      SERVICE_UNITIALIZED_ERROR_MESSAGE('TON or Dedust'),
      SERVICE_UNITIALIZED_ERROR_CODE,
    );
  }

  return {
    network: ton.network,
    timestamp: Date.now(),
    gasPrice: ton.gasPrice,
    gasPriceToken: ton.nativeTokenSymbol,
    gasLimit: ton.gasLimit,
    gasCost: String(ton.gasCost),
  };
}
