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

export const OrderType = {
  MARKET: 0,
  LIMIT: 1,
  STOP: 2, // not used
  STOPLIMIT: 3, // not used
};

export const TimeInForce = {
  GTC: 0, // Good Till Cancel,
  FOK: 1, // Fill or Kill - requires immediate full fill or reverts
  IOC: 2, // Immediate or Cancel - gets any fills & then canceled Remaining will not go in the orderbook
  PO: 3, // Post Only - Requires to go in the orderbook without any fills or reverts
};
