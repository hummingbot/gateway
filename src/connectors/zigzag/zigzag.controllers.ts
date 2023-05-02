import { ZigZagish, ZigZagTrade } from '../../services/common-interfaces';
import { Ethereumish, Tokenish } from '../../services/common-interfaces';
import { Token } from '@uniswap/sdk-core';
import { TokenInfo } from '../../chains/ethereum/ethereum-base';
import Decimal from 'decimal.js-light';
import { Transaction, utils, Wallet } from 'ethers';
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
  LOAD_WALLET_ERROR_MESSAGE,
  LOAD_WALLET_ERROR_CODE,
} from '../../services/error-handler';
import { latency, gasCostInEthString } from '../../services/base';
import {
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { logger } from '../../services/logger';

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
  let baseToken, quoteToken, rawAmount;
  if (req.side === 'SELL') {
    baseToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.base);
    quoteToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.quote);
    rawAmount = utils.parseUnits(req.amount, baseToken.decimals);
  } else {
    baseToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.quote);
    quoteToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.base);
    rawAmount = utils.parseUnits(req.amount, quoteToken.decimals);
  }

  let tradePrice;

  try {
    const tradeInfo = await zigzagish.estimate(
      baseToken,
      quoteToken,
      rawAmount,
      req.side.toLowerCase()
    );
    tradePrice = tradeInfo.newSwapPrice;
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
    rawAmount: rawAmount.toString(),
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
  let baseToken, quoteToken, rawAmount;
  if (req.side === 'SELL') {
    baseToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.base);
    quoteToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.quote);
    rawAmount = utils.parseUnits(req.amount, baseToken.decimals);
  } else {
    baseToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.quote);
    quoteToken = getFullTokenFromSymbol(ethereumish, zigzagish, req.base);
    rawAmount = utils.parseUnits(req.amount, quoteToken.decimals);
  }

  const limitPrice = req.limitPrice;

  // Get wallet
  let wallet: Wallet;
  try {
    wallet = await ethereumish.getWallet(req.address);
  } catch (err) {
    logger.error(`Wallet ${req.address} not available.`);
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }

  // Get route data
  const tradeInfo: ZigZagTrade = await zigzagish.estimate(
    baseToken,
    quoteToken,
    rawAmount,
    req.side.toLowerCase()
  );
  const price: number = tradeInfo.newSwapPrice;

  //  Basic price check
  if (
    req.side === 'BUY' &&
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
  } else if (
    req.side === 'SELL' &&
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

  // Price info log
  logger.info(
    `Expected execution price is ${price.toString()}, ` +
      `limit price is ${limitPrice}.`
  );

  // Execute trade
  const tx: Transaction = await zigzagish.executeTrade(
    wallet.address,
    tradeInfo,
    rawAmount,
    req.side === 'BUY'
  );

  const gasPrice: number = ethereumish.gasPrice;

  // Save Tx
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
    rawAmount: rawAmount.toString(),
    price: price.toString(),
    gasPrice: gasPrice,
    gasPriceToken: ethereumish.nativeTokenSymbol,
    gasLimit: ethereumish.gasLimitTransaction,
    gasCost: gasCostInEthString(gasPrice, ethereumish.gasLimitTransaction),
    nonce: tx.nonce,
    txHash: tx.hash,
  };
}
