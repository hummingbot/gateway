import { Token, CurrencyAmount } from '@pancakeswap/sdk';
import { Pair } from '@pancakeswap/v2-sdk';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Pancakeswap } from '../../../../src/connectors/pancakeswap/pancakeswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap.config');
jest.mock('../../../../src/connectors/pancakeswap/pancakeswap');

// The pair contract: the route reads token0/token1 on-chain to orient the swap.
const mockPairContract = { token0: jest.fn(), token1: jest.fn() };
jest.mock('@ethersproject/contracts', () => ({
  ...jest.requireActual('@ethersproject/contracts'),
  Contract: jest.fn(() => mockPairContract),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { makeQuoteSwapRoute } = await import('../../../../src/trading/pool-swap-routes');
  await server.register(makeQuoteSwapRoute('amm'));
  return server;
};

const WBNB = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WBNB');
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC');
const POOL = '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc';

// 1,000 WBNB against 1,500,000 USDC. PancakeSwap v2's fee is 0.25%, so the expected
// amounts are the constant-product formula with a 9975/10000 input, in raw units:
//   SELL 0.1 WBNB: out = 1e17·9975·1.5e12 / (1e21·10000 + 1e17·9975) = 149610076
//   BUY  0.1 WBNB: in  = 1.5e12·1e17·10000 / ((1e21 − 1e17)·9975) + 1 = 150390979
const pair = new Pair(
  CurrencyAmount.fromRawAmount(WBNB, '1000000000000000000000'),
  CurrencyAmount.fromRawAmount(USDC, '1500000000000'),
);

const quote = (server: any, query: Record<string, string>) =>
  server.inject({
    method: 'GET',
    url: '/quote-swap',
    query: {
      chainNetwork: 'ethereum-mainnet',
      connector: 'pancakeswap',
      poolAddress: POOL,
      baseToken: 'WBNB',
      quoteToken: 'USDC',
      amount: '0.1',
      slippagePct: '1',
      ...query,
    },
  });

describe('GET /quote-swap (pancakeswap amm)', () => {
  let server: any;
  let pancakeswap: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPairContract.token0.mockResolvedValue(WBNB.address);
    mockPairContract.token1.mockResolvedValue(USDC.address);

    const tokens: Record<string, Token> = {
      WBNB,
      USDC,
      [WBNB.address]: WBNB,
      [USDC.address]: USDC,
    };
    pancakeswap = {
      getToken: jest.fn(async (symbolOrAddress: string) => tokens[symbolOrAddress] ?? null),
      getV2Pool: jest.fn().mockResolvedValue(pair),
    };
    (Pancakeswap.getInstance as jest.Mock).mockResolvedValue(pancakeswap);
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      provider: { getGasPrice: jest.fn().mockResolvedValue(BigNumber.from('20000000000')) },
      ready: () => true,
    });
  });

  it('SELL prices the exact base input against the pair reserves', async () => {
    const response = await quote(server, { side: 'SELL' });

    expect(response.statusCode).toBe(200);
    expect(pancakeswap.getV2Pool).toHaveBeenCalledWith(WBNB, USDC, POOL);
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      poolAddress: POOL,
      tokenIn: WBNB.address,
      tokenOut: USDC.address,
      amountIn: 0.1,
      amountOut: 149.610076,
      maxAmountIn: 0.1,
      slippagePct: 1,
    });
    // 1% slippage, as the PancakeSwap SDK applies it: floor(149610076 / 1.01)
    expect(body.minAmountOut).toBe(148.128788);
    expect(body.price).toBeCloseTo(1496.10076, 8);
  });

  it('BUY prices the exact base output, and bounds the input by the slippage', async () => {
    const response = await quote(server, { side: 'BUY' });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      tokenIn: USDC.address,
      tokenOut: WBNB.address,
      amountIn: 150.390979,
      amountOut: 0.1,
      minAmountOut: 0.1,
    });
    // 1% slippage: floor(150390979 · 1.01)
    expect(body.maxAmountIn).toBe(151.894888);
    expect(body.price).toBeCloseTo(1503.90979, 8);
  });

  it('refuses a base token it cannot resolve', async () => {
    const response = await quote(server, { baseToken: 'INVALID', side: 'SELL' });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body).message).toBe('Token not found: INVALID');
    expect(pancakeswap.getV2Pool).not.toHaveBeenCalled();
  });
});
