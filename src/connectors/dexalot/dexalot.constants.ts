import { utils } from 'ethers';
import { MarketInfo, PriceLevel } from '../../services/common-interfaces';
import { MarketInfoStruct, OrderInfoStruct } from './dexalot.interfaces';

export const OrderStatus = {
  NEW: 0,
  REJECTED: 1, // not used
  PARTIAL: 2,
  FILLED: 3,
  CANCELED: 4,
  EXPIRED: 5, // not used
  KILLED: 6,
};

export const OrderSide: any = {
  BUY: 0,
  SELL: 1,
};

export const OrderType1 = {
  MARKET: 0,
  LIMIT: 1,
  STOP: 2, // not used
  STOPLIMIT: 3, // not used
};

export const OrderType2 = {
  GTC: 0, // Good Till Cancel,
  FOK: 1, // Fill or Kill - requires immediate full fill or reverts
  IOC: 2, // Immediate or Cancel - gets any fills & then canceled Remaining will not go in the orderbook
  PO: 3, // Post Only - Requires to go in the orderbook without any fills or reverts
};

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
      Object.keys(OrderType1)[
        Object.values(OrderType1).indexOf(orderInfo.type1)
      ],
    type2:
      Object.keys(OrderType2)[
        Object.values(OrderType2).indexOf(orderInfo.type1)
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
