import { BigNumber, utils } from 'ethers';

export interface OrderInfoStruct {
  id: string;
  clientOrderId: string;
  tradePairId: string;
  price: BigNumber;
  totalAmount: BigNumber;
  quantity: BigNumber;
  quantityFilled: BigNumber;
  totalFee: BigNumber;
  traderaddress: any;
  side: number;
  type1: number;
  type2: number;
  status: number;
}

export interface MarketInfoStruct {
  baseSymbol: utils.BytesLike;
  quoteSymbol: utils.BytesLike;
  buyBookId: utils.BytesLike;
  sellBookId: utils.BytesLike;
  minTradeAmount: BigNumber;
  maxTradeAmount: BigNumber;
  auctionPrice: BigNumber;
  auctionMode: number;
  makerRate: number;
  takerRate: number;
  baseDecimals: number;
  baseDisplayDecimals: number;
  quoteDecimals: number;
  quoteDisplayDecimals: number;
  allowedSlippagePercent: number;
  addOrderPaused: boolean;
  pairPaused: boolean;
  postOnly: boolean;
}
