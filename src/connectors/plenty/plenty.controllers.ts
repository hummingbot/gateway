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
import { ExpectedTrade, IConfigToken, PlentyTrade } from './plenty.types';
import { OperationContentsAndResultTransaction } from '@taquito/rpc';
import { Plenty } from './plenty';
import { routerSwap } from './utils/router';


async function estimateTradeGasCost(
  tezosish: Tezosish,
  plenty: Plenty,
  plentyTrade: PlentyTrade,
  caller?: string
) {
  const wallet = await tezosish.getWallet(caller, undefined, true);
  const address = await wallet.signer.publicKeyHash();

  const swapParams = await routerSwap(
    tezosish,
    plenty,
    plentyTrade.routeParams.path,
    plentyTrade.routeParams.minimumTokenOut,
    address,
    address,
    plentyTrade.amountIn
  )
  const batchEstimate = await wallet.estimate.batch(swapParams);

  let gasCost = 0, gasLimitTransaction = 0;
  batchEstimate.forEach(estimate => {
    gasCost += estimate.totalCost;
    gasLimitTransaction += estimate.gasLimit;
  });
  const gasPrice = tezosish.gasPrice / 10 ** 6;
  return { gasCost, gasLimitTransaction, gasPrice };
}

export async function txWriteData(
  tezosish: Tezosish,
  address: string,
  maxFeePerGas?: string,
  maxPriorityFeePerGas?: string
): Promise<{
  wallet: TezosToolkit;
  maxFeePerGasBigNumber: BigNumber | undefined;
  maxPriorityFeePerGasBigNumber: BigNumber | undefined;
}> {
  let maxFeePerGasBigNumber: BigNumber | undefined;
  if (maxFeePerGas) {
    maxFeePerGasBigNumber = new BigNumber(maxFeePerGas);
  }
  let maxPriorityFeePerGasBigNumber: BigNumber | undefined;
  if (maxPriorityFeePerGas) {
    maxPriorityFeePerGasBigNumber = new BigNumber(maxPriorityFeePerGas);
  }

  let wallet: TezosToolkit;
  try {
    wallet = await tezosish.getWallet(address);
  } catch (err) {
    logger.error(`Tezos: wallet ${address} not available.`);
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }
  return { wallet, maxFeePerGasBigNumber, maxPriorityFeePerGasBigNumber };
}

export async function getPlentyTrade(
  tezosish: Tezosish,
  plenty: Plenty,
  baseAsset: string,
  quoteAsset: string,
  baseAmount: Decimal,
  tradeSide: string,
  allowedSlippage?: string,
): Promise<ExpectedTrade> {
  const baseToken: IConfigToken = getFullTokenFromSymbol(
    plenty,
    baseAsset
  );
  const quoteToken: IConfigToken = getFullTokenFromSymbol(
    plenty,
    quoteAsset
  );
  const requestAmount = new BigNumber(
    baseAmount.toFixed(baseToken.decimals).replace('.', '')
  );

  let expectedTrade: ExpectedTrade;
  if (tradeSide === 'BUY') {
    expectedTrade = await plenty.estimateBuyTrade(
      tezosish,
      quoteToken,
      baseToken,
      requestAmount,
      allowedSlippage
    );
  } else {
    expectedTrade = await plenty.estimateSellTrade(
      tezosish,
      baseToken,
      quoteToken,
      requestAmount,
      allowedSlippage
    );
  }

  return expectedTrade;
}

export async function price(
  tezosish: Tezosish,
  plenty: Plenty,
  req: PriceRequest
): Promise<PriceResponse> {
  const startTimestamp: number = Date.now();
  let expectedTrade: ExpectedTrade;
  try {
    expectedTrade = await getPlentyTrade(
      tezosish,
      plenty,
      req.base,
      req.quote,
      new Decimal(req.amount),
      req.side,
      req.allowedSlippage
    );
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
    plenty,
    expectedTrade.trade
  );

  const baseToken: IConfigToken = getFullTokenFromSymbol(plenty, req.base);
  const quoteToken: IConfigToken = getFullTokenFromSymbol(plenty, req.quote);

  return {
    network: tezosish.chain,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.address!,
    quote: quoteToken.address!,
    amount: new Decimal(req.amount).toFixed(baseToken.decimals),
    rawAmount: new Decimal(req.amount).toFixed(baseToken.decimals).replace('.', ''),
    expectedAmount: new Decimal(expectedTrade.expectedAmount.toString()).toFixed(quoteToken.decimals),
    price: new Decimal(expectedTrade.trade.executionPrice.toString()).toFixed(8),
    gasPrice: gasPrice / 10 ** 6,
    gasPriceToken: tezosish.nativeTokenSymbol,
    gasLimit: gasLimitTransaction,
    gasCost: new Decimal(gasCost).dividedBy(10 ** 6).toFixed(6),
  };
}

export async function trade(
  tezosish: Tezosish,
  plenty: Plenty,
  req: TradeRequest
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();
  const limitPrice = req.limitPrice;

  let expectedTrade: ExpectedTrade;
  try {
    expectedTrade = await getPlentyTrade(
      tezosish,
      plenty,
      req.base,
      req.quote,
      new Decimal(req.amount),
      req.side,
      req.allowedSlippage,
    );
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`Plenty: could not get trade info - ${e.message}`);
      throw new HttpException(
        500,
        TRADE_FAILED_ERROR_MESSAGE + e.message,
        TRADE_FAILED_ERROR_CODE
      );
    } else {
      logger.error('Plenty: unknown error trying to get trade info');
      throw new HttpException(
        500,
        UNKNOWN_ERROR_MESSAGE,
        UNKNOWN_ERROR_ERROR_CODE
      );
    }
  }

  const { gasCost, gasLimitTransaction, gasPrice } = await estimateTradeGasCost(
    tezosish,
    plenty,
    expectedTrade.trade,
    req.address
  );

  const baseToken = getFullTokenFromSymbol(plenty, req.base);
  const quoteToken = getFullTokenFromSymbol(plenty, req.quote);

  if (req.side === 'BUY') {
    const price = expectedTrade.trade.executionPrice;
    logger.info(
      `Expected execution price is ${price.toString()}, ` +
      `limit price is ${limitPrice}.`
    );
    if (
      limitPrice &&
      price.gt(new BigNumber(limitPrice))
    ) {
      logger.error('Plenty: swap price exceeded limit price');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
          price.toString(),
          limitPrice
        ),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE
      );
    }

    const tx = await plenty.executeTrade(tezosish, expectedTrade.trade);

    logger.info(
      `Trade has been executed, txHash is ${tx.hash}, gasPrice is ${gasPrice}.`
    );

    return {
      network: tezosish.chain,
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      base: baseToken.address!,
      quote: quoteToken.address!,
      amount: new Decimal(req.amount).toFixed(baseToken.decimals),
      rawAmount: new Decimal(req.amount).toFixed(baseToken.decimals).replace('.', ''),
      expectedIn: new Decimal(expectedTrade.expectedAmount.toString()).toFixed(quoteToken.decimals),
      price: new Decimal(price.toString()).toSignificantDigits(8).toString(),
      gasPrice: gasPrice / 10 ** 6,
      gasPriceToken: tezosish.nativeTokenSymbol,
      gasLimit: gasLimitTransaction,
      gasCost: new Decimal(gasCost).dividedBy(10 ** 6).toFixed(6),
      txHash: tx.hash,
      nonce: parseInt((tx.operations[0] as OperationContentsAndResultTransaction).counter),
    };
  } else {
    const price = expectedTrade.trade.executionPrice;
    logger.info(
      `Expected execution price is ${price.toString()}, ` +
      `limit price is ${limitPrice}.`
    );
    if (
      limitPrice &&
      price.lt(new BigNumber(limitPrice))
    ) {
      logger.error('Plenty: swap price lower than limit price');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
          price,
          limitPrice
        ),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE
      );
    }

    const tx = await plenty.executeTrade(tezosish, expectedTrade.trade);

    logger.info(
      `Trade has been executed, txHash is ${tx.hash}, gasPrice is ${gasPrice}.`
    );

    return {
      network: tezosish.chain,
      timestamp: startTimestamp,
      latency: latency(startTimestamp, Date.now()),
      base: baseToken.address!,
      quote: quoteToken.address!,
      amount: new Decimal(req.amount).toFixed(baseToken.decimals),
      rawAmount: new Decimal(req.amount).toFixed(baseToken.decimals).replace('.', ''),
      expectedOut: new Decimal(expectedTrade.expectedAmount.toString()).toFixed(quoteToken.decimals),
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
  plenty: Plenty,
  tokenSymbol: string
): IConfigToken {
  try {
    return plenty.getTokenBySymbol(tokenSymbol) as IConfigToken;
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
  plenty: Plenty
): EstimateGasResponse {
  const gasPrice: number = tezosish.gasPrice / 10 ** 6;
  const gasLimitTransaction: number = tezosish.gasLimitTransaction;
  const gasLimitEstimate: number = plenty.gasLimitEstimate;

  return {
    network: tezosish.chain,
    timestamp: Date.now(),
    gasPrice,
    gasPriceToken: tezosish.nativeTokenSymbol,
    gasLimit: gasLimitTransaction,
    gasCost: new BigNumber(Math.ceil(gasPrice * gasLimitEstimate)).dividedBy(10 ** 6).toFixed(6),
  };
}
