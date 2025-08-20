export const mockPriceResponse = {
  chainId: 1,
  price: '1805.294117647058823529',
  estimatedPriceImpact: '0.01',
  value: '0',
  gasPrice: '25000000000',
  gas: '150000',
  estimatedGas: '150000',
  protocolFee: '0',
  minimumProtocolFee: '0',
  buyTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  buyAmount: '180529411764',
  sellTokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  sellAmount: '100000000000000000',
  sources: [
    { name: 'Uniswap_V3', proportion: '0.7' },
    { name: 'SushiSwap', proportion: '0.3' },
  ],
  allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  sellTokenToEthRate: '1',
  buyTokenToEthRate: '0.0005534',
  expectedSlippage: null,
};

export const mockQuoteResponse = {
  ...mockPriceResponse,
  guaranteedPrice: '1787.241176470588235294',
  to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  data: '0x415565b00000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000000000016345785d8a000000000000000000000000000000000000000000000000000000000002a0523d3c0000000000000000000000000000000000000000000000000000000000000000',
  orders: [],
  fees: {
    zeroExFee: {
      feeType: 'gas',
      feeToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      feeAmount: '0',
      billingType: 'on-chain',
    },
  },
  auxiliaryChainData: {},
};

export const mockTokenNotFoundError = {
  response: {
    status: 400,
    data: {
      code: 100,
      reason: 'Validation Failed',
      validationErrors: [
        {
          field: 'sellToken',
          code: 1004,
          reason: 'Token not supported',
        },
      ],
    },
  },
};

export const mockInsufficientLiquidityError = {
  response: {
    status: 400,
    data: {
      code: 100,
      reason: 'Insufficient liquidity',
      validationErrors: [
        {
          field: 'buyAmount',
          code: 1006,
          reason: 'INSUFFICIENT_ASSET_LIQUIDITY',
        },
      ],
    },
  },
};
