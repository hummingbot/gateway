import { TokenInfo } from '@solana/spl-token-registry';
import { Solanaish } from '../../chains/solana/solana';
import { Jupiter } from './jupiter';
import {
  PriceRequest,
  TradeRequest,
  TradeResponse,
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

  const slippage = allowedSlippage ? Number(allowedSlippage) : jupiter.getSlippage();

  let quote: QuoteResponse;
  if (tradeSide === 'BUY') {
    quote = await jupiter.getQuote(
      quoteToken.symbol,
      baseToken.symbol,
      amount,
      slippage,
      false, // not restricting to direct routes
      false, // not using legacy transactions
      'ExactOut'
      );
  } else {
    quote = await jupiter.getQuote(
      baseToken.symbol,
      quoteToken.symbol,
      amount,
      slippage,
      false, // not restricting to direct routes
      false, // not using legacy transactions
      'ExactIn'
    );
  }

  logger.info(`Quote details:
    inAmount: ${quote.inAmount}
    outAmount: ${quote.outAmount}
    side: ${tradeSide}
    priceImpactPct: ${quote.priceImpactPct}
    slippageBps: ${quote.slippageBps}
    otherAmountThreshold: ${quote.otherAmountThreshold}
    swapMode: ${quote.swapMode}
    contextSlot: ${quote.contextSlot}
    timeTaken: ${quote.timeTaken}`);

  logger.info(`Token details:
    Base Token:
      symbol: ${baseToken.symbol}
      address: ${baseToken.address}
      decimals: ${baseToken.decimals}
    Quote Token:  
      symbol: ${quoteToken.symbol}
      address: ${quoteToken.address} 
      decimals: ${quoteToken.decimals}`);
  
  const baseAmount = tradeSide === 'BUY'
    ? Number(quote.outAmount) / (10 ** baseToken.decimals)
    : Number(quote.inAmount) / (10 ** baseToken.decimals)
  const quoteAmount = tradeSide === 'BUY'
    ? Number(quote.inAmount) / (10 ** quoteToken.decimals)
    : Number(quote.outAmount) / (10 ** quoteToken.decimals)

  logger.info(`Base amount calculation:
    tradeSide: ${tradeSide}
    rawAmount: ${tradeSide === 'BUY' ? quote.outAmount : quote.inAmount}
    tokenDecimals: ${baseToken.decimals}
    calculatedBaseAmount: ${baseAmount}`);
    
  logger.info(`Quote amount calculation:
    tradeSide: ${tradeSide}
    rawAmount: ${tradeSide === 'BUY' ? quote.inAmount : quote.outAmount}
    tokenDecimals: ${quoteToken.decimals}
    calculatedQuoteAmount: ${quoteAmount}`);

  logger.info(`Price calculation:
    numerator: ${quoteAmount}
    denominator: ${baseAmount}
    price: ${Number(quoteAmount)} / ${Number(baseAmount)}
  `);
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

  const quote = await jupiter.getQuote(
    req.base,
    req.quote,
    Number(req.amount),
    undefined, // using default slippage
    false, // not restricting to direct routes
    false // not using legacy transactions
  );

  const inputToken = solanaish.getTokenForSymbol(req.base);
  const outputToken = solanaish.getTokenForSymbol(req.quote);

  if (!inputToken || !outputToken) {
    throw new Error(`Invalid tokens: ${req.base} or ${req.quote}`);
  }
  
  const expectedPrice = req.side === 'BUY'
    ? Number(quote.inAmount) / (Number(quote.outAmount) * (10 ** (inputToken.decimals - outputToken.decimals)))  // How much quote you pay per base
    : Number(quote.outAmount) / (Number(quote.inAmount) * (10 ** (outputToken.decimals - inputToken.decimals))); // How much quote you receive per base
  // const expectedAmount = new Decimal(quote.outAmount).div(new Decimal(10).pow(outputToken.decimals)).toString();
  
  logger.info(
    `Expected execution price is ${expectedPrice}, ` +
      `limit price is ${limitPrice}.`,
  );

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

  // Execute the swap using the new method
  const swapResult = await jupiter.executeSwap(
    wallet,
    req.base,
    req.quote,
    Number(req.amount),
    jupiter.getSlippage()
  );

  return {
    network: solanaish.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedIn: String(quote.outAmount),
    price: String(expectedPrice),
    gasPrice: 0, // Not needed for Solana
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasLimit: 0, // Not needed for Solana
    gasCost: String(swapResult.fee),
    txHash: swapResult.signature,
  };
}