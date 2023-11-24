import { utils } from 'ethers';
import { MarketInfo, PriceLevel } from '../../services/common-interfaces';
import {
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
} from './dexalot.constants';
import { MarketInfoStruct, OrderInfoStruct } from './dexalot.interfaces';

export const fromUtf8 = (txt: string): string => {
  return utils.formatBytes32String(txt);
};

export const toUtf8 = (txt: utils.BytesLike): string => {
  return utils.parseBytes32String(txt);
};

export const parseMarkerInfo = (marketInfo: MarketInfoStruct) => {
  return {
    baseSymbol: toUtf8(marketInfo.baseSymbol),
    quoteSymbol: toUtf8(marketInfo.quoteSymbol),
    buyBookId: toUtf8(marketInfo.buyBookId),
    sellBookId: toUtf8(marketInfo.sellBookId),
    minTradeAmount: marketInfo.minTradeAmount.toString(),
    maxTradeAmount: marketInfo.maxTradeAmount.toString(),
    auctionPrice: marketInfo.auctionPrice.toString(),
    auctionMode: marketInfo.auctionMode,
    makerRate: marketInfo.makerRate / 10000, // https://github.com/Dexalot/contracts/blob/1ec4b732b06dd2a25fe666cfde5b619af5b6f20b/contracts/TradePairs.sol#L43
    takerRate: marketInfo.takerRate / 10000, // https://github.com/Dexalot/contracts/blob/1ec4b732b06dd2a25fe666cfde5b619af5b6f20b/contracts/TradePairs.sol#L43
    baseDecimals: marketInfo.baseDecimals,
    baseDisplayDecimals: marketInfo.baseDisplayDecimals,
    quoteDecimals: marketInfo.quoteDecimals,
    quoteDisplayDecimals: marketInfo.quoteDisplayDecimals,
    allowedSlippagePercent: marketInfo.allowedSlippagePercent,
    addOrderPaused: marketInfo.addOrderPaused,
    pairPaused: marketInfo.pairPaused,
    postOnly: marketInfo.postOnly,
  };
};

export const parseOrderInfo = (orderInfo: OrderInfoStruct) => {
  return {
    id: orderInfo.id,
    clientOrderId: orderInfo.clientOrderId,
    tradePairId: orderInfo.tradePairId,
    price: orderInfo.price.toString(),
    totalAmount: orderInfo.totalAmount.toString(),
    quantity: orderInfo.quantity.toString(),
    quantityFilled: orderInfo.quantityFilled.toString(),
    totalFee: orderInfo.totalFee.toString(),
    traderaddress: orderInfo.traderaddress,
    side: Object.keys(OrderSide)[
      Object.values(OrderSide).indexOf(orderInfo.side)
    ],
    type1:
      Object.keys(OrderType)[Object.values(OrderType).indexOf(orderInfo.type1)],
    type2:
      Object.keys(TimeInForce)[
        Object.values(TimeInForce).indexOf(orderInfo.type1)
      ],
    status:
      Object.keys(OrderStatus)[
        Object.values(OrderStatus).indexOf(orderInfo.status)
      ],
  };
};

export const createBook = (
  rawBook: string[][],
  timestamps: string[],
  marketInfo: MarketInfo
): PriceLevel[] => {
  const book: PriceLevel[] = [];
  if (rawBook[0].length === timestamps.length) {
    for (let val = 0; val < rawBook[0].length; val++) {
      book.push({
        price: utils
          .formatUnits(rawBook[0][val], marketInfo.quoteDecimals)
          .toString(),
        quantity: utils
          .formatUnits(rawBook[1][val], marketInfo.baseDecimals)
          .toString(),
        timestamp: Number(timestamps[val]),
      });
    }
  }
  return book;
};
