import { Solana } from '../../chains/solana/solana';
import { Jupiter } from './jupiter';
import {
  PriceRequest,
  TradeRequest,
  TradeResponse,
} from '../../amm/amm.requests';
import axios from 'axios';
import { JupiterPriceResponse } from './jupiter.request';
import { logger } from '../../services/logger';
import Decimal from 'decimal.js-light';
import {
  HttpException,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency } from '../../services/base';
export async function getPairData(base: string, quote: string) {
  const baseURL = `https://api.jup.ag/price/v2?ids=${base},${quote}&showExtraInfo=true`;
  const response = await axios.get<JupiterPriceResponse>(baseURL);
  return response.data;
}

export async function jupiterPrice(
  solana: Solana,
  jupiter: Jupiter,
  req: PriceRequest,
) {
  const data = await jupiter.price(req);
  return {
    ...data,
    network: solana.network,
    gasPriceToken: solana.nativeTokenSymbol,
    gasCost: '0',
  };
}

export async function jupiterTrade(
  solana: Solana,
  jupiter: Jupiter,
  req: TradeRequest,
): Promise<TradeResponse> {
  const startTimestamp: number = Date.now();
  const { address } = req;
  const keypair = await solana.getAccountFromAddress(address);
  const limitPrice = req.limitPrice;
  const trade = await jupiter.price(<PriceRequest>req);
  const estimatedPrice = trade.expectedPrice;
  logger.info(
    `Expected execution price is ${estimatedPrice}, ` +
      `limit price is ${limitPrice}.`,
  );
  keypair.publicKey;
  if (req.side === 'BUY') {
    if (limitPrice && new Decimal(estimatedPrice).gt(new Decimal(limitPrice))) {
      logger.error('Swap price exceeded limit price.');
      throw new HttpException(
        500,
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
        500,
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
          estimatedPrice,
          limitPrice,
        ),
        SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
      );
    }
  }
  const tx = await jupiter.trade(trade.trade, keypair);
  return {
    network: solana.network,
    timestamp: startTimestamp,
    latency: latency(startTimestamp, Date.now()),
    base: req.base,
    quote: req.quote,
    amount: req.amount,
    rawAmount: req.amount,
    expectedIn: String(trade.expectedAmount),
    price: String(estimatedPrice),
    gasPrice: 10,
    gasPriceToken: solana.nativeTokenSymbol,
    gasLimit: tx.computeUnitLimit,
    gasCost: String(10),
    txHash: tx.txid,
  };
}
