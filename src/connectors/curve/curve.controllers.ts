import Decimal from 'decimal.js-light';
import {
  HttpException,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
import { gasCostInEthString, latency } from '../../services/base';
import { logger } from '../../services/logger';
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { Ethereumish, Uniswapish } from '../../services/common-interfaces';
import { Curve } from './curve';
import {
  getFullTokenFromSymbol,
  txWriteData,
} from '../uniswap/uniswap.controllers';
import { Token } from '@uniswap/sdk';
import { BigNumber } from 'ethers';

async function getTradeInfo(
  chain: Ethereumish,
  curve: Curve,
  req: PriceRequest | TradeRequest
) {
  let trade,
    price: string = '0';
  try {
    const baseToken = <Token>(
      getFullTokenFromSymbol(chain, curve as unknown as Uniswapish, req.base)
    );
    const quoteToken = <Token>(
      getFullTokenFromSymbol(chain, curve as unknown as Uniswapish, req.quote)
    );
    trade = await curve.estimateSellTrade(
      baseToken,
      quoteToken,
      BigNumber.from(req.amount)
    );
    price = String(Number(trade.expectedAmount) / Number(req.amount));
    if (req.side === 'BUY') {
      const quoteAmount = trade.expectedAmount;
      trade = await curve.estimateBuyTrade(
        quoteToken,
        baseToken,
        BigNumber.from(trade.expectedAmount)
      );
      price = String(Number(quoteAmount) / Number(trade.expectedAmount));
    }
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
  return { trade, price };
}
export async function price(
  chain: Ethereumish,
  curve: Curve,
  req: PriceRequest
): Promise<PriceResponse> {
  const startTimestamp: number = Date.now();
  const { trade, price } = await getTradeInfo(chain, curve, req);
  return {
    network: chain.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedAmount: String(trade.expectedAmount),
    price: price,
    gasPrice: chain.gasPrice,
    gasPriceToken: chain.nativeTokenSymbol,
    gasLimit: chain.gasLimitTransaction,
    gasCost: gasCostInEthString(chain.gasPrice, chain.gasLimitTransaction),
  };
}

export async function trade(
  chain: Ethereumish,
  curve: Curve,
  req: TradeRequest
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();

  const { wallet, maxFeePerGasBigNumber, maxPriorityFeePerGasBigNumber } =
    await txWriteData(
      chain,
      req.address,
      req.maxFeePerGas,
      req.maxPriorityFeePerGas
    );

  const limitPrice = req.limitPrice;
  const { trade, price } = await getTradeInfo(chain, curve, req);

  logger.info(
    `Expected execution price is ${price}, ` + `limit price is ${limitPrice}.`
  );

  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(price).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(price, limitPrice),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE
      );
    }
  } else {
    if (limitPrice && new Decimal(price).lt(new Decimal(limitPrice))) {
      logger.error('Swap price lower than limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(price, limitPrice),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE
      );
    }
  }
  const tx = await curve.executeTrade(
    wallet,
    trade.trade,
    chain.gasPrice,
    chain.gasLimitTransaction,
    req.nonce,
    maxFeePerGasBigNumber,
    maxPriorityFeePerGasBigNumber,
    req.allowedSlippage
  );

  logger.info(`${req.side} swap has been executed.`);

  return {
    network: chain.chainName,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedIn: String(trade.expectedAmount),
    price: String(price),
    gasPrice: chain.gasPrice,
    gasPriceToken: chain.nativeTokenSymbol,
    gasLimit: chain.gasLimitTransaction,
    gasCost: gasCostInEthString(chain.gasPrice, chain.gasLimitTransaction),
    txHash: tx,
  };
}

export async function estimateGas(
  chain: Ethereumish,
  _curve: Curve
): Promise<EstimateGasResponse> {
  return {
    network: chain.chainName,
    timestamp: Date.now(),
    gasPrice: chain.gasPrice,
    gasPriceToken: chain.nativeTokenSymbol,
    gasLimit: chain.gasLimitTransaction,
    gasCost: gasCostInEthString(chain.gasPrice, chain.gasLimitTransaction),
  };
}
