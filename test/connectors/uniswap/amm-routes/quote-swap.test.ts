import { Token, CurrencyAmount } from '@uniswap/sdk-core';
import { Pair } from '@uniswap/v2-sdk';
import { BigNumber } from 'ethers';

import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Uniswap } from '../../../../src/connectors/uniswap/uniswap';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/uniswap/uniswap.config');
jest.mock('../../../../src/connectors/uniswap/uniswap');

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

const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH');
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC');
const POOL = '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc';

// 1,000 WETH against 1,500,000 USDC. Expected amounts below are the constant-product
// formula with the 0.3% fee, worked in raw units:
//   SELL 0.1 WETH: out = 1e17·997·1.5e12 / (1e21·1000 + 1e17·997) = 149535091
//   BUY  0.1 WETH: in  = 1.5e12·1e17·1000 / ((1e21 − 1e17)·997) + 1 = 150466401
const pair = new Pair(
  CurrencyAmount.fromRawAmount(WETH, '1000000000000000000000'),
  CurrencyAmount.fromRawAmount(USDC, '1500000000000'),
);

const quote = (server: any, query: Record<string, string>) =>
  server.inject({
    method: 'GET',
    url: '/quote-swap',
    query: {
      chainNetwork: 'ethereum-mainnet',
      connector: 'uniswap',
      poolAddress: POOL,
      baseToken: 'WETH',
      quoteToken: 'USDC',
      amount: '0.1',
      slippagePct: '1',
      ...query,
    },
  });

describe('GET /quote-swap (uniswap amm)', () => {
  let server: any;
  let uniswap: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPairContract.token0.mockResolvedValue(WETH.address);
    mockPairContract.token1.mockResolvedValue(USDC.address);

    const tokens: Record<string, Token> = {
      WETH,
      USDC,
      [WETH.address]: WETH,
      [USDC.address]: USDC,
    };
    uniswap = {
      getToken: jest.fn(async (symbolOrAddress: string) => tokens[symbolOrAddress] ?? null),
      getV2Pool: jest.fn().mockResolvedValue(pair),
    };
    (Uniswap.getInstance as jest.Mock).mockResolvedValue(uniswap);
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      provider: { getGasPrice: jest.fn().mockResolvedValue(BigNumber.from('20000000000')) },
      ready: () => true,
    });
  });

  it('SELL prices the exact base input against the pair reserves', async () => {
    const response = await quote(server, { side: 'SELL' });

    expect(response.statusCode).toBe(200);
    expect(uniswap.getV2Pool).toHaveBeenCalledWith(WETH, USDC, POOL);
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      poolAddress: POOL,
      tokenIn: WETH.address,
      tokenOut: USDC.address,
      amountIn: 0.1,
      amountOut: 149.535091,
      maxAmountIn: 0.1,
      slippagePct: 1,
    });
    // 1% slippage: floor(149535091 · 0.99)
    expect(body.minAmountOut).toBe(148.03974);
    expect(body.price).toBeCloseTo(1495.35091, 8);
  });

  it('BUY prices the exact base output, and bounds the input by the slippage', async () => {
    const response = await quote(server, { side: 'BUY' });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      tokenIn: USDC.address,
      tokenOut: WETH.address,
      amountIn: 150.466401,
      amountOut: 0.1,
      minAmountOut: 0.1,
    });
    // 1% slippage: floor(150466401 · 1.01)
    expect(body.maxAmountIn).toBe(151.971065);
    expect(body.price).toBeCloseTo(1504.66401, 8);
  });

  it('refuses a base token it cannot resolve', async () => {
    const response = await quote(server, { baseToken: 'INVALID', side: 'SELL' });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body).message).toBe('Token not found: INVALID');
    expect(uniswap.getV2Pool).not.toHaveBeenCalled();
  });
});
