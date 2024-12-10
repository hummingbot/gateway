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
} from '../../services/error-handler';
import { latency } from '../../services/base';
import { logger } from '../../services/logger';
import { Wallet } from '@coral-xyz/anchor';
import Decimal from 'decimal.js-light';

export async function price(
  solanaish: Solanaish,
  jupiter: Jupiter,
  req: PriceRequest,
) {
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
  
  const expectedPrice = Number(quote.outAmount) / (Number(quote.inAmount) * (10 ** (outputToken.decimals - inputToken.decimals)));

  return {
    timestamp: Date.now(),
    latency: 0, // Will be calculated by the calling function
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: quote.inAmount,
    expectedAmount: quote.outAmount,
    price: expectedPrice.toString(),
    gasPrice: 0.0001,
    gasLimit: 100000,
    expectedPrice: expectedPrice,
    trade: quote,
    network: solanaish.network,
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasCost: '0',
  };
}

export async function trade(
  solanaish: Solanaish,
  jupiter: Jupiter,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();
  const { address } = req;
  const keypair = await solanaish.getKeypairFromPrivateKey(address);
  const wallet = new Wallet(keypair as any);
  const limitPrice = req.limitPrice;
  const quote = await jupiter.getQuote(
    req.base,
    req.quote,
    Number(req.amount),
    undefined, // using default slippage
    false, // not restricting to direct routes
    false // not using legacy transactions
  );
  
  const estimatedPrice = Number(quote.outAmount) / (Number(quote.inAmount));
  
  logger.info(
    `Expected execution price is ${estimatedPrice}, ` +
      `limit price is ${limitPrice}.`,
  );

  // Check limit price conditions
  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(estimatedPrice).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(estimatedPrice, limitPrice),
        SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
      );
    }
  } else {
    if (limitPrice && new Decimal(estimatedPrice).lt(new Decimal(limitPrice))) {
      logger.error('Swap price lower than limit price.');
      throw new HttpException(
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(estimatedPrice, limitPrice),
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
    price: String(estimatedPrice),
    gasPrice: swapResult.fee,
    gasPriceToken: solanaish.nativeTokenSymbol,
    gasLimit: 0, // This is now handled dynamically by Jupiter
    gasCost: String(swapResult.fee),
    txHash: swapResult.signature,
  };
}