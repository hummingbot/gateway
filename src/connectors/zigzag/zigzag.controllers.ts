import { ZigZagish, ZigZagTrade } from '../../services/common-interfaces';
import { Ethereumish, Tokenish } from '../../services/common-interfaces';
import { Token } from '@uniswap/sdk-core';
import { TokenInfo } from '../../chains/ethereum/ethereum-base';
import Decimal from 'decimal.js-light';
import { BigNumber, Transaction } from 'ethers';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency, gasCostInEthString } from '../../services/base';
import {
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { logger } from '../../services/logger';
import { txWriteData } from '../uniswap/uniswap.controllers';

export function getFullTokenFromSymbol(
  ethereumish: Ethereumish,
  zigzagish: ZigZagish,
  tokenSymbol: string
): Tokenish | Token {
  const tokenInfo: TokenInfo | undefined =
    ethereumish.getTokenBySymbol(tokenSymbol);
  let fullToken: Tokenish | Token | undefined;
  if (tokenInfo) {
    fullToken = zigzagish.getTokenByAddress(tokenInfo.address);
  }
  if (!fullToken)
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + tokenSymbol,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  return fullToken;
}

export async function price(
  ethereumish: Ethereumish,
  zigzagish: ZigZagish,
  req: PriceRequest
): Promise<PriceResponse> {
  const startTimestamp: number = Date.now();
  const baseToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.base);
  const quoteToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.quote);

  let tradePrice;

  try {
    if (req.side === 'BUY') {
      const tradeInfo = await zigzagish.estimate(
        baseToken,
        quoteToken,
        BigNumber.from(0),
        BigNumber.from(req.amount),
        'buy'
      );
      tradePrice = tradeInfo.newSwapPrice;
    } else {
      const tradeInfo = await zigzagish.estimate(
        baseToken,
        quoteToken,
        BigNumber.from(req.amount),
        BigNumber.from(0),
        'sell'
      );

      tradePrice = tradeInfo.newSwapPrice;
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

  const gasLimitTransaction = ethereumish.gasLimitTransaction;
  const gasPrice = ethereumish.gasPrice;
  const gasLimitEstimate = 150688;
  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.address,
    quote: quoteToken.address,
    amount: req.amount,
    rawAmount: req.amount,
    expectedAmount: String(tradePrice * Number(req.amount)),
    price: String(tradePrice),
    gasPrice: gasPrice,
    gasPriceToken: ethereumish.nativeTokenSymbol,
    gasLimit: gasLimitTransaction,
    gasCost: gasCostInEthString(gasPrice, gasLimitEstimate),
  };
}

export async function trade(
  ethereumish: Ethereumish,
  zigzagish: ZigZagish,
  req: TradeRequest
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();
  const baseToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.base);
  const quoteToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.quote);

  const limitPrice = req.limitPrice;
  let tradeInfo: ZigZagTrade, tx: Transaction, price: number;
  const { wallet } = await txWriteData(
    ethereumish,
    req.address,
    req.maxFeePerGas,
    req.maxPriorityFeePerGas
  );

  try {
    if (req.side === 'BUY') {
      tradeInfo = await zigzagish.estimate(
        baseToken,
        quoteToken,
        BigNumber.from(0),
        BigNumber.from(req.amount),
        req.side.toLowerCase()
      );
      price = tradeInfo.newSwapPrice;
      if (
        limitPrice &&
        new Decimal(price.toString()).gt(new Decimal(limitPrice))
      ) {
        logger.error('Swap price exceeded limit price.');
        throw new HttpException(
          500,
          SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
            price.toString(),
            limitPrice
          ),
          SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE
        );
      }

      tx = await zigzagish.executeTrade(wallet, tradeInfo, true);
    } else {
      tradeInfo = await zigzagish.estimate(
        baseToken,
        quoteToken,
        BigNumber.from(req.amount),
        BigNumber.from(0),
        req.side.toLowerCase()
      );
      price = tradeInfo.newSwapPrice;
      logger.info(
        `Expected execution price is ${price.toString()}, ` +
          `limit price is ${limitPrice}.`
      );
      if (
        limitPrice &&
        new Decimal(price.toString()).lt(new Decimal(limitPrice))
      ) {
        logger.error('Swap price lower than limit price.');
        throw new HttpException(
          500,
          SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
            price.toString(),
            limitPrice
          ),
          SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE
        );
      }

      tx = await zigzagish.executeTrade(wallet, tradeInfo, false);
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

  const gasPrice: number = ethereumish.gasPrice;

  if (tx.hash) {
    await ethereumish.txStorage.saveTx(
      ethereumish.chain,
      ethereumish.chainId,
      tx.hash,
      new Date(),
      gasPrice
    );
  }

  logger.info(
    `Trade has been executed, txHash is ${tx.hash}, nonce is ${tx.nonce}, gasPrice is ${gasPrice}.`
  );

  return {
    network: ethereumish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.address,
    quote: quoteToken.address,
    amount: new Decimal(req.amount).toFixed(baseToken.decimals),
    rawAmount: tradeInfo.sellAmount.toString(),
    expectedIn: req.amount,
    price: price.toString(),
    gasPrice: gasPrice,
    gasPriceToken: ethereumish.nativeTokenSymbol,
    gasLimit: ethereumish.gasLimitTransaction,
    gasCost: gasCostInEthString(gasPrice, ethereumish.gasLimitTransaction),
    nonce: tx.nonce,
    txHash: tx.hash,
  };
}
