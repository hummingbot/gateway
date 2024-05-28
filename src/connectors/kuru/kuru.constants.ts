export const OrderStatus = {
  CANCELED: 0,
  FILLED: 1,
  OPEN: 2,
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

export const MarginAccount = '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853';

export const Markets = {
  'SOL-USDC': '0xBffBa2d75440205dE93655eaa185c12D52d42D10',
  'BTC-USDC': '',
};

export const Assets = {
  SOL: {
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    decimals: 18,
  },
  USDC: {
    address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    decimals: 18,
  },
  ETH: {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
  },
};
