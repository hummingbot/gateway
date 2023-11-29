import Decimal from 'decimal.js-light';
import BigNumber from "bignumber.js";
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
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
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
} from '../../services/error-handler';
import { latency } from '../../services/base';
import { Tezosish } from '../../services/common-interfaces';
import { logger } from '../../services/logger';
import {
  EstimateGasResponse,
  PriceRequest,
  PriceResponse,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import { TezosToolkit } from '@taquito/taquito';
import { OperationContentsAndResultTransaction } from '@taquito/rpc';
import { QuipuSwap } from './quipuswap';
import { Token, TradeInfo } from './utils/shared/types';
import { Trade } from 'swap-router-sdk';


async function estimateTradeGasCost(
  tezosish: Tezosish,
  quipuswap: QuipuSwap,
  trade: Trade,
  caller?: string
) {
  let wallet: TezosToolkit;
  try {
    wallet = await tezosish.getWallet(caller, undefined, true);
  } catch (err) {
    logger.error(`Tezos: wallet ${caller} not available.`);
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }

  const swapParams = await quipuswap.getSwapParams(wallet, trade);
  const batchEstimate = await wallet.estimate.batch(swapParams);

  let gasCost = 0, gasLimitTransaction = 0;
  batchEstimate.forEach(estimate => {
    gasCost += estimate.totalCost;
    gasLimitTransaction += estimate.gasLimit;
  });
  const gasPrice = tezosish.gasPrice / 10 ** 6;
  return { gasCost, gasLimitTransaction, gasPrice };
}

export function getQuipuTrade(
  quipuswap: QuipuSwap,
  req: PriceRequest
) {
  const baseToken: Token = getFullTokenFromSymbol(
    quipuswap,
    req.base
  );
  const requestAmount = new BigNumber(
    BigNumber(req.amount).toFixed(baseToken.metadata.decimals).replace('.', '')
  );

  let expectedTrade: TradeInfo;
  let expectedAmount: BigNumber;
  if (req.side === 'BUY') {
    expectedTrade = quipuswap.estimateBuyTrade(
      req.quote,
      req.base,
      requestAmount,
      req.allowedSlippage
    );
    expectedAmount = expectedTrade.inputAmount;
  } else {
    expectedTrade = quipuswap.estimateBuyTrade(
      req.base,
      req.quote,
      requestAmount,
      req.allowedSlippage
    );
    expectedAmount = expectedTrade.outputAmount;
  }

  return { expectedTrade, expectedAmount };
}

export async function price(
  tezosish: Tezosish,
  quipuswap: QuipuSwap,
  req: PriceRequest
): Promise<PriceResponse> {
  const startTimestamp: number = Date.now();
  let expectedTrade: TradeInfo;
  let expectedAmount: BigNumber;
  try {
    ({ expectedTrade, expectedAmount } = getQuipuTrade(quipuswap, req));
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

  const { gasCost, gasLimitTransaction, gasPrice } = await estimateTradeGasCost(
    tezosish,
    quipuswap,
    expectedTrade.trade
  );

  const baseToken: Token = getFullTokenFromSymbol(quipuswap, req.base);
  const quoteToken: Token = getFullTokenFromSymbol(quipuswap, req.quote);

  return {
    network: tezosish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.contractAddress,
    quote: quoteToken.contractAddress,
    amount: new Decimal(req.amount).toFixed(baseToken.metadata.decimals),
    rawAmount: new Decimal(req.amount).toFixed(baseToken.metadata.decimals).replace('.', ''),
    expectedAmount: new Decimal(expectedAmount.toString()).toFixed(quoteToken.metadata.decimals),
    price: new Decimal(expectedTrade.price.toString()).toFixed(8),
    gasPrice: gasPrice / 10 ** 6,
    gasPriceToken: tezosish.nativeTokenSymbol,
    gasLimit: gasLimitTransaction,
    gasCost: new Decimal(gasCost).dividedBy(10 ** 6).toFixed(6),
  };
}

export async function trade(
  tezosish: Tezosish,
  quipuswap: QuipuSwap,
  req: TradeRequest
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();
  const limitPrice = req.limitPrice;

  let expectedTrade: TradeInfo;
  let expectedAmount: BigNumber;
  try {
    ({ expectedTrade, expectedAmount } = getQuipuTrade(quipuswap, req));
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`QuipuSwap: could not get trade info - ${e.message}`);
      throw new HttpException(
        500,
        TRADE_FAILED_ERROR_MESSAGE + e.message,
        TRADE_FAILED_ERROR_CODE
      );
    } else {
      logger.error('QuipuSwap: unknown error trying to get trade info');
      throw new HttpException(
        500,
        UNKNOWN_ERROR_MESSAGE,
        UNKNOWN_ERROR_ERROR_CODE
      );
    }
  }

  const { gasCost, gasLimitTransaction, gasPrice } = await estimateTradeGasCost(
    tezosish,
    quipuswap,
    expectedTrade.trade,
    req.address
  );

  const baseToken = getFullTokenFromSymbol(quipuswap, req.base);
  const quoteToken = getFullTokenFromSymbol(quipuswap, req.quote);

  if (req.side === 'BUY') {
    const price = expectedTrade.price;
    logger.info(
      `Expected execution price is ${price.toString()}, ` +
      `limit price is ${limitPrice}.`
    );
    if (
      limitPrice &&
      price.gt(new BigNumber(limitPrice))
    ) {
      logger.error('QuipuSwap: swap price exceeded limit price for buy trade');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
          price.toString(),
          limitPrice
        ),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE
      );
    }

    const tx = await quipuswap.executeTrade(tezosish.provider, expectedTrade.trade);

    logger.info(
      `Trade has been executed, txHash is ${tx.hash}, gasPrice is ${gasPrice}.`
    );

    return {
      network: tezosish.chain,
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      base: baseToken.contractAddress,
      quote: quoteToken.contractAddress,
      amount: new Decimal(req.amount).toFixed(baseToken.metadata.decimals),
      rawAmount: new Decimal(req.amount).toFixed(baseToken.metadata.decimals).replace('.', ''),
      expectedIn: new Decimal(expectedAmount.toString()).toFixed(quoteToken.metadata.decimals),
      price: new Decimal(price.toString()).toSignificantDigits(8).toString(),
      gasPrice: gasPrice / 10 ** 6,
      gasPriceToken: tezosish.nativeTokenSymbol,
      gasLimit: gasLimitTransaction,
      gasCost: new Decimal(gasCost).dividedBy(10 ** 6).toFixed(6),
      txHash: tx.hash,
      nonce: parseInt((tx.operations[0] as OperationContentsAndResultTransaction).counter),
    };
  } else {
    const price = expectedTrade.price;
    logger.info(
      `Expected execution price is ${price.toString()}, ` +
      `limit price is ${limitPrice}.`
    );
    if (
      limitPrice &&
      price.lt(new BigNumber(limitPrice))
    ) {
      logger.error('QuipuSwap: swap price lower than limit price for sell trade');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
          price,
          limitPrice
        ),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE
      );
    }

    const tx = await quipuswap.executeTrade(tezosish.provider, expectedTrade.trade);

    logger.info(
      `Trade has been executed, txHash is ${tx.hash}, gasPrice is ${gasPrice}.`
    );

    return {
      network: tezosish.chain,
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      base: baseToken.contractAddress,
      quote: quoteToken.contractAddress,
      amount: new Decimal(req.amount).toFixed(baseToken.metadata.decimals),
      rawAmount: new Decimal(req.amount).toFixed(baseToken.metadata.decimals).replace('.', ''),
      expectedOut: new Decimal(expectedAmount.toString()).toFixed(quoteToken.metadata.decimals),
      price: new Decimal(price.toString()).toSignificantDigits(8).toString(),
      gasPrice: gasPrice / 10 ** 6,
      gasPriceToken: tezosish.nativeTokenSymbol,
      gasLimit: gasLimitTransaction,
      gasCost: new Decimal(gasCost).dividedBy(10 ** 6).toFixed(6),
      txHash: tx.hash,
      nonce: parseInt((tx.operations[0] as OperationContentsAndResultTransaction).counter),
    };
  }
}

export function getFullTokenFromSymbol(
  quipuswap: QuipuSwap,
  tokenSymbol: string
): Token {
  try {
    return quipuswap.getTokenFromSymbol(tokenSymbol) as Token;
  } catch {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + tokenSymbol,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }
}

export function estimateGas(
  tezosish: Tezosish,
  quipuswap: QuipuSwap
): EstimateGasResponse {
  const gasPrice: number = tezosish.gasPrice / 10 ** 6;
  const gasLimitTransaction: number = tezosish.gasLimitTransaction;
  const gasLimitEstimate: number = quipuswap.gasLimitEstimate;
  return {
    network: tezosish.chain,
    timestamp: Date.now(),
    gasPrice,
    gasPriceToken: tezosish.nativeTokenSymbol,
    gasLimit: gasLimitTransaction,
    gasCost: new BigNumber(Math.ceil(gasPrice * gasLimitEstimate)).dividedBy(10 ** 6).toFixed(6),
  };
}
