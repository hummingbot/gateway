export const mockWETH = {
  chainId: 8453,
  symbol: 'WETH',
  name: 'Wrapped Ether',
  address: '0x4200000000000000000000000000000000000006',
  decimals: 18,
};

export const mockUSDC = {
  chainId: 8453,
  symbol: 'USDC',
  name: 'USD Coin',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
};

export const FIBROUS_ROUTER_ADDRESS = '0x274602a953847d807231d2370072f5f4e4594b44';

/** Builds a `/route` style response for a given input/output pair. */
export const buildRouteResponse = (
  inputAmount: string,
  outputAmount: string,
  inputToken = mockWETH,
  outputToken = mockUSDC,
) => ({
  success: true as const,
  routeId: 'c0ffee00-dead-beef-cafe-000000000001',
  inputToken: {
    address: inputToken.address,
    name: inputToken.name,
    decimals: inputToken.decimals,
    price: 1888.4,
    extra_data: null,
  },
  inputAmount,
  outputToken: {
    address: outputToken.address,
    name: outputToken.name,
    decimals: outputToken.decimals,
    price: 0.9999,
    extra_data: null,
  },
  outputAmount,
  estimatedGasUsed: '0',
  estimatedGasUsedInUsd: 0,
  route: [
    {
      percent: '100%',
      swaps: [
        [
          {
            protocol: 63,
            poolName: 'MockPool',
            poolAddress: '0xaD4aDf89BC3A02B7B90D875fa3aB2091FF189452',
            fromTokenAddress: inputToken.address,
            toTokenAddress: outputToken.address,
            percent: '100%',
            extraData: null,
          },
        ],
      ],
    },
  ],
  time: 0.2,
  meta: { apiVersion: '2.0', timestamp: '2026-07-28T12:00:00.000Z' },
});

/** Builds a `/calldata` style response matching the router `swap` signature. */
export const buildCalldataResponse = (
  amountIn: string,
  amountOut: string,
  minReceived: string,
  destination: string,
  tokenIn = mockWETH.address,
  tokenOut = mockUSDC.address,
) => ({
  routeId: 'c0ffee00-dead-beef-cafe-000000000001',
  route: {
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    amount_out: amountOut,
    min_received: minReceived,
    destination,
    swap_type: 2,
  },
  swap_parameters: [
    {
      token_in: tokenIn,
      token_out: tokenOut,
      rate: '1000000',
      protocol_id: '63',
      pool_address: '0xaD4aDf89BC3A02B7B90D875fa3aB2091FF189452',
      swap_type: 2,
      extra_data: '0x0000000000000000000000000000000000000000000000000000000000000000',
    },
  ],
  router_address: FIBROUS_ROUTER_ADDRESS,
  meta: { apiVersion: '2.0', timestamp: '2026-07-28T12:00:00.000Z' },
});
