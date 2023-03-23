import { ZigZag } from './zigzag';
import { bigNumberWithDecimalToStr } from '../../services/base';
import { Ethereumish } from '../../services/common-interfaces';

import Decimal from 'decimal.js-light';
import { BigNumber } from 'ethers';
import {
  HttpException,
  TOKEN_NOT_SUPPORTED_ERROR_CODE,
  TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
} from '../../services/error-handler';
import { latency, gasCostInEthString } from '../../services/base';
import {
  PriceRequest,
  PriceResponse,
} from '../../amm/amm.requests';

export async function price(
  ethereumish: Ethereumish,
  zigzag: ZigZag,
  req: PriceRequest
): Promise<PriceResponse> {
  const startTimestamp: number = Date.now();
  const baseToken = ethereumish.getTokenBySymbol(req.base);
  const quoteToken = ethereumish.getTokenBySymbol(req.quote);

  if (baseToken === undefined || quoteToken === undefined) {
    throw new HttpException(
      500,
      TOKEN_NOT_SUPPORTED_ERROR_MESSAGE,
      TOKEN_NOT_SUPPORTED_ERROR_CODE
    );
  }

  let expectedAmount;
  let tradePrice;

  try {
    if (req.side === 'BUY') {
      const tradeInfo = await zigzag.estimate(
        baseToken,
        quoteToken,
        BigNumber.from(0),
        BigNumber.from(req.amount),
        'buy'
      );
      expectedAmount = tradeInfo.buyAmount;
      tradePrice = tradeInfo.sellAmount;
    } else {
      const tradeInfo = await zigzag.estimate(
        baseToken,
        quoteToken,
        BigNumber.from(req.amount),
        BigNumber.from(0),
        'sell'
      );

      expectedAmount = tradeInfo.sellAmount;
      tradePrice = tradeInfo.buyAmount;
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
    amount: new Decimal(req.amount).toFixed(baseToken.decimals),
    rawAmount: req.amount.toString(),
    expectedAmount: bigNumberWithDecimalToStr(
      expectedAmount,
      req.side === 'SELL' ? quoteToken.decimals : baseToken.decimals
    ),
    price: bigNumberWithDecimalToStr(
      tradePrice,
      req.side === 'SELL' ? baseToken.decimals : quoteToken.decimals
    ),
    gasPrice: gasPrice,
    gasPriceToken: ethereumish.nativeTokenSymbol,
    gasLimit: gasLimitTransaction,
    gasCost: gasCostInEthString(gasPrice, gasLimitEstimate),
  };
}
