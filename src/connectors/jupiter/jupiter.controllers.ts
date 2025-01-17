import { TokenInfo } from '@solana/spl-token-registry';
import { Solanaish } from '../../chains/solana/solana';
import { Jupiter } from './jupiter';
import {
  PriceRequest,
  TradeRequest,
  TradeResponse,
  EstimateGasResponse,
} from '../../amm/amm.requests';
import {
  HttpException,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency } from '../../services/base';
import { logger } from '../../services/logger';
import { Wallet } from '@coral-xyz/anchor';
import Decimal from 'decimal.js-light';
import { QuoteResponse } from '@jup-ag/api';

export interface TradeInfo {
  baseToken: TokenInfo;
  quoteToken: TokenInfo;
  requestAmount: number;
  expectedPrice: number;
  expectedAmount: number;
}

export async function getTradeInfo(
  solanaish: Solanaish,
  jupiter: Jupiter,
  baseAsset: string,
  quoteAsset: string,
  amount: number,
  tradeSide: string,
  allowedSlippage?: string,
): Promise<TradeInfo> {
  const baseToken: TokenInfo = solanaish.getTokenForSymbol(baseAsset);
  const quoteToken: TokenInfo = solanaish.getTokenForSymbol(quoteAsset);
  const requestAmount = Math.floor(amount * 10 ** baseToken.decimals);

  const slippagePct = allowedSlippage ? Number(allowedSlippage) : jupiter.getSlippagePct();

  let quote: QuoteResponse;
  if (tradeSide === 'BUY') {
    quote = await jupiter.getQuote(
      quoteToken.symbol,
      baseToken.symbol,
      amount,
      slippagePct,
      false, // not restricting to direct routes
      false, // not using legacy transactions
      'ExactOut'
      );
  } else {
    quote = await jupiter.getQuote(
      baseToken.symbol,
      quoteToken.symbol,
      amount,
      slippagePct,
      false, // not restricting to direct routes
      false, // not using legacy transactions
      'ExactIn'
    );
  }
  
  const baseAmount = tradeSide === 'BUY'
    ? Number(quote.outAmount) / (10 ** baseToken.decimals)
    : Number(quote.inAmount) / (10 ** baseToken.decimals)
  const quoteAmount = tradeSide === 'BUY'
    ? Number(quote.inAmount) / (10 ** quoteToken.decimals)
    : Number(quote.outAmount) / (10 ** quoteToken.decimals)

  const expectedPrice = Number(quoteAmount) / Number(baseAmount);
  const expectedAmount = Number(quoteAmount);

  return {
    baseToken,
    quoteToken,
    requestAmount,
    expectedPrice,
    expectedAmount,
  };
}

export async function price(
  solanaish: Solanaish,
  jupiter: Jupiter,
  req: PriceRequest,
) {
  const startTimestamp: number = Date.now();

  let tradeInfo: TradeInfo;
  try {
    tradeInfo = await getTradeInfo(
      solanaish,
      jupiter,
      req.base,
      req.quote,
      Number(req.amount),
      req.side,
      req.allowedSlippage,
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

  const { baseToken, quoteToken, requestAmount, expectedPrice, expectedAmount } = tradeInfo;

  return {
    network: solanaish.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.address,
    quote: quoteToken.address,
    amount: new Decimal(req.amount).toFixed(baseToken.decimals),
    rawAmount: requestAmount.toString(),
    expectedAmount: expectedAmount.toString(),
    price: expectedPrice.toString(),
    gasPrice: 0,
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasLimit: 0,
    gasCost: '0',
  };
}

export async function trade(
  solanaish: Solanaish,
  jupiter: Jupiter,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();

  const limitPrice = req.limitPrice;
  const keypair = await solanaish.getWallet(req.address);
  const wallet = new Wallet(keypair as any);

  let tradeInfo: TradeInfo;
  try {
    tradeInfo = await getTradeInfo(
      solanaish,
      jupiter,
      req.base,
      req.quote,
      Number(req.amount),
      req.side,
      req.allowedSlippage,
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
  const { baseToken, quoteToken, requestAmount, expectedPrice, expectedAmount } = tradeInfo;
  const slippagePct = req.allowedSlippage ? Number(req.allowedSlippage) : jupiter.getSlippagePct();

  // Check limit price conditions
  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(expectedPrice).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(expectedPrice, limitPrice),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
      );
    }
  } else {
    if (limitPrice && new Decimal(expectedPrice).lt(new Decimal(limitPrice))) {
      logger.error('Swap price lower than limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(expectedPrice, limitPrice),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
      );
    }
  }

  // Execute swap with correct input/output tokens based on trade side
  const swapResult = await jupiter.executeSwap(
    wallet,
    req.side === 'BUY' ? quoteToken.symbol : baseToken.symbol, // inputToken
    req.side === 'BUY' ? baseToken.symbol : quoteToken.symbol,  // outputToken
    req.side === 'BUY' ? Number(expectedAmount) : Number(req.amount), // amount
    slippagePct
  );

  // Simplified logging
  logger.info(`Swap executed: ${swapResult.signature} - Input: ${swapResult.totalInputSwapped} ${req.side === 'BUY' ? quoteToken.symbol : baseToken.symbol}, Output: ${swapResult.totalOutputSwapped} ${req.side === 'BUY' ? baseToken.symbol : quoteToken.symbol}`);

  const response: TradeResponse = {
    network: solanaish.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.address,
    quote: quoteToken.address,
    amount: new Decimal(req.amount).toFixed(baseToken.decimals),
    rawAmount: requestAmount.toString(),
    gasPrice: 0,
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasLimit: 0,
    gasCost: String(swapResult.fee),
    txHash: swapResult.signature,
    price: expectedPrice.toString(),
  };

  if (req.side === 'BUY') {
    return {
      ...response,
      expectedIn: swapResult.totalInputSwapped.toString(),
    };
  } else {
    return {
      ...response,
      expectedOut: swapResult.totalOutputSwapped.toString(),
    };
  }
}

export async function estimateGas(
  solanaish: Solanaish,
  jupiter: Jupiter,
): Promise<EstimateGasResponse> {
  // TODO: get gas price from the network
  return {
    network: solanaish.network,
    timestamp: Date.now(),
    gasPrice: 0,
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasLimit: 0,
    gasCost: jupiter.gasCost.toString(),
  };
}
