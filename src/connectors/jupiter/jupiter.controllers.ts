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
  INSUFFICIENT_BASE_TOKEN_BALANCE_ERROR_CODE,
  INSUFFICIENT_BASE_TOKEN_BALANCE_ERROR_MESSAGE,
  INSUFFICIENT_QUOTE_TOKEN_BALANCE_ERROR_CODE,
  INSUFFICIENT_QUOTE_TOKEN_BALANCE_ERROR_MESSAGE,
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
  gasEstimate: EstimateGasResponse;
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

  const gasEstimate = await estimateGas(solanaish, jupiter);

  return {
    baseToken,
    quoteToken,
    requestAmount,
    expectedPrice,
    expectedAmount,
    gasEstimate,
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

  const { baseToken, quoteToken, requestAmount, expectedPrice, expectedAmount, gasEstimate } = tradeInfo;

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
    gasPrice: gasEstimate.gasPrice,
    gasPriceToken: gasEstimate.gasPriceToken,
    gasLimit: gasEstimate.gasLimit,
    gasCost: gasEstimate.gasCost,
  };
}

export async function trade(
  solanaish: Solanaish,
  jupiter: Jupiter,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();
  
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
  
  const { baseToken, quoteToken, requestAmount, expectedPrice, expectedAmount, gasEstimate } = tradeInfo;
  const slippagePct = req.allowedSlippage ? Number(req.allowedSlippage) : jupiter.getSlippagePct();

  // Check limit price conditions
  if (req.side === 'BUY') {
    if (req.limitPrice && new Decimal(expectedPrice).gt(new Decimal(req.limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(expectedPrice, req.limitPrice),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
      );
    }
  } else {
    if (req.limitPrice && new Decimal(expectedPrice).lt(new Decimal(req.limitPrice))) {
      logger.error('Swap price lower than limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(expectedPrice, req.limitPrice),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
      );
    }
  }

  // Add balance check
  if (req.side === 'SELL') {
    const balance = await solanaish.getBalance(keypair, [baseToken.symbol]);
    if (new Decimal(balance[baseToken.symbol]).lt(new Decimal(req.amount))) {
      throw new HttpException(
        500,
        INSUFFICIENT_BASE_TOKEN_BALANCE_ERROR_MESSAGE,
        INSUFFICIENT_BASE_TOKEN_BALANCE_ERROR_CODE
      );
    }
  } else {
    const balance = await solanaish.getBalance(keypair, [quoteToken.symbol]);
    if (new Decimal(balance[quoteToken.symbol]).lt(new Decimal(expectedAmount))) {
      throw new HttpException(
        500,
        INSUFFICIENT_QUOTE_TOKEN_BALANCE_ERROR_MESSAGE,
        INSUFFICIENT_QUOTE_TOKEN_BALANCE_ERROR_CODE
      );
    }
  }

  // Execute swap with correct input/output tokens based on trade side
  const { signature, feeInLamports } = await jupiter.executeSwap(
    wallet,
    req.side === 'BUY' ? quoteToken.symbol : baseToken.symbol,
    req.side === 'BUY' ? baseToken.symbol : quoteToken.symbol,
    req.side === 'BUY' ? Number(expectedAmount) : Number(req.amount),
    slippagePct
  );

  // Updated logging using request parameters
  logger.info(`Swap confirmed: ${signature} - ${req.side} ${req.amount} ${baseToken.symbol} at ${expectedPrice} ${quoteToken.symbol}/${baseToken.symbol}`);

  const response: TradeResponse = {
    network: solanaish.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: baseToken.address,
    quote: quoteToken.address,
    amount: new Decimal(req.amount).toFixed(baseToken.decimals),
    rawAmount: requestAmount.toString(),
    gasPrice: feeInLamports / gasEstimate.gasLimit,
    gasPriceToken: gasEstimate.gasPriceToken,
    gasLimit: gasEstimate.gasLimit,
    gasCost: (feeInLamports / 1e9).toString(),
    txHash: signature,
    price: expectedPrice.toString(),
  };

  if (req.side === 'BUY') {
    return {
      ...response,
      expectedIn: expectedAmount.toString(),
    };
  } else {
    return {
      ...response,
      expectedOut: expectedAmount.toString(),
    };
  }
}

export async function estimateGas(
  solanaish: Solanaish,
  jupiter: Jupiter,
): Promise<EstimateGasResponse> {
  const priorityFeeInMicroLamports = await solanaish.estimatePriorityFees(
    solanaish.connectionPool.getNextConnection().rpcEndpoint
  );
  
  const gasCost = await solanaish.getGasPrice();

  return {
    network: solanaish.network,
    timestamp: Date.now(),
    gasPrice: priorityFeeInMicroLamports,  // in microLamports
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasLimit: solanaish.defaultComputeUnits,
    gasCost: gasCost.toString(),
  };
}
