import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { Fibrous } from '../../../../src/connectors/fibrous/fibrous';
import { buildCalldataResponse, buildRouteResponse, mockUSDC, mockWETH } from '../../../mocks/fibrous/route.mock';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/fibrous/fibrous');

const WALLET = '0x1234567890123456789012345678901234567890';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import('../../../../src/connectors/fibrous/router-routes/quoteSwap');
  await server.register(quoteSwapRoute);
  return server;
};

const mockEthereum = (baseToken: any = mockWETH, quoteToken: any = mockUSDC) => {
  (Ethereum.getInstance as jest.Mock).mockResolvedValue({
    getToken: jest.fn().mockResolvedValueOnce(baseToken).mockResolvedValueOnce(quoteToken),
  });
  (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue(WALLET);
};

/** Builds a Fibrous instance mock with the real amount-conversion behaviour. */
const mockFibrous = (overrides: Record<string, any>) => {
  const instance = {
    parseTokenAmount: jest.fn((amount: number, decimals: number) =>
      BigInt(Math.round(amount * 10 ** decimals)).toString(),
    ),
    formatTokenAmount: jest.fn((amount: string, decimals: number) => (Number(amount) / 10 ** decimals).toString()),
    getPriceImpactPct: jest.fn().mockResolvedValue(0.05),
    getGasEstimate: jest.fn().mockReturnValue('500000'),
    getRoute: jest.fn(),
    getRouteForExactOut: jest.fn(),
    getCalldata: jest.fn(),
    buildSwapTransaction: jest.fn(),
    ...overrides,
  };
  (Fibrous.getInstance as jest.Mock).mockResolvedValue(instance);
  return instance;
};

describe('GET /quote-swap (fibrous)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an indicative price without building calldata', async () => {
    mockEthereum();
    const fibrous = mockFibrous({
      getRoute: jest.fn().mockResolvedValue(buildRouteResponse('1000000000000000000', '1888000000')),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
        slippagePct: '1',
        indicativePrice: 'true',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('quoteId', 'indicative-price');
    expect(body).toHaveProperty('amountIn', 1);
    expect(body).toHaveProperty('amountOut', 1888);
    expect(body).toHaveProperty('price', 1888);
    expect(body).toHaveProperty('gasEstimate', '500000');
    expect(body).not.toHaveProperty('expirationTime');
    expect(body).not.toHaveProperty('data');
    expect(fibrous.getCalldata).not.toHaveBeenCalled();
  });

  it('defaults to an indicative price when indicativePrice is omitted', async () => {
    mockEthereum();
    const fibrous = mockFibrous({
      getRoute: jest.fn().mockResolvedValue(buildRouteResponse('1000000000000000000', '1888000000')),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: { network: 'base', baseToken: 'WETH', quoteToken: 'USDC', amount: '1', side: 'SELL' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty('quoteId', 'indicative-price');
    expect(fibrous.getCalldata).not.toHaveBeenCalled();
  });

  it('returns an executable quote with calldata for SELL side', async () => {
    mockEthereum();
    const fibrous = mockFibrous({
      getRoute: jest.fn().mockResolvedValue(buildRouteResponse('1000000000000000000', '1888000000')),
      getCalldata: jest
        .fn()
        .mockResolvedValue(buildCalldataResponse('1000000000000000000', '1888000000', '1869120000', WALLET)),
      buildSwapTransaction: jest.fn().mockReturnValue({ to: '0xRouter', data: '0xdeadbeef', value: '0' }),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '1',
        side: 'SELL',
        slippagePct: '1',
        indicativePrice: 'false',
        takerAddress: WALLET,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.quoteId).not.toBe('indicative-price');
    expect(body).toHaveProperty('expirationTime');
    expect(body).toHaveProperty('data', '0xdeadbeef');
    expect(body).toHaveProperty('to', '0xRouter');
    expect(body).toHaveProperty('allowanceTarget', '0xRouter');
    expect(body.minAmountOut).toBeCloseTo(1888 * 0.99, 6);
    expect(fibrous.getCalldata).toHaveBeenCalledWith(expect.anything(), 1, WALLET);
  });

  it('approximates BUY side via a sell-leg quote and flags it', async () => {
    mockEthereum();
    const fibrous = mockFibrous({
      getRoute: jest
        .fn()
        // sell leg: 1 WETH -> 1888 USDC, which sets the input for the forward leg
        .mockResolvedValueOnce(buildRouteResponse('1000000000000000000', '1888000000', mockWETH, mockUSDC))
        // forward leg: 1888 USDC -> ~1 WETH, the executable quote
        .mockResolvedValueOnce(buildRouteResponse('1888000000', '999000000000000000', mockUSDC, mockWETH)),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '1',
        side: 'BUY',
        slippagePct: '1',
        indicativePrice: 'true',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Sell leg first (base -> quote), then the forward leg (quote -> base)
    expect(fibrous.getRoute).toHaveBeenCalledTimes(2);
    expect(fibrous.getRoute.mock.calls[0][0]).toMatchObject({
      tokenInAddress: mockWETH.address,
      tokenOutAddress: mockUSDC.address,
      amount: '1000000000000000000',
    });
    expect(fibrous.getRoute.mock.calls[1][0]).toMatchObject({
      tokenInAddress: mockUSDC.address,
      tokenOutAddress: mockWETH.address,
      amount: '1888000000',
    });

    expect(body).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body).toHaveProperty('tokenOut', mockWETH.address);
    expect(body).toHaveProperty('amountIn', 1888);
    // amountOut is an estimate, not exactly the requested amount
    expect(body.amountOut).toBeCloseTo(0.999, 6);
    expect(body).toHaveProperty('approximation', true);
    // An approximated BUY is really ExactIn: the input is fixed
    expect(body.maxAmountIn).toBe(1888);
    expect(body.minAmountOut).toBeCloseTo(0.999 * 0.99, 6);
  });

  it('rejects BUY when approximation is disabled', async () => {
    mockEthereum();
    const fibrous = mockFibrous({});

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: {
        network: 'base',
        baseToken: 'WETH',
        quoteToken: 'USDC',
        amount: '1',
        side: 'BUY',
        approximateIfNoExactOut: 'false',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('ExactIn only');
    expect(fibrous.getRoute).not.toHaveBeenCalled();
  });

  it('does not flag a SELL as approximated', async () => {
    mockEthereum();
    mockFibrous({
      getRoute: jest.fn().mockResolvedValue(buildRouteResponse('1000000000000000000', '1888000000')),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: { network: 'base', baseToken: 'WETH', quoteToken: 'USDC', amount: '1', side: 'SELL' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).not.toHaveProperty('approximation');
  });

  it('returns 400 when a token cannot be resolved', async () => {
    mockEthereum(null, mockUSDC);
    mockFibrous({});

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: { network: 'base', baseToken: 'NOPE', quoteToken: 'USDC', amount: '1', side: 'SELL' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  it('surfaces Fibrous API errors as 400', async () => {
    mockEthereum();
    mockFibrous({
      getRoute: jest.fn().mockRejectedValue(new Error('Fibrous API Error: No result found')),
    });

    const response = await server.inject({
      method: 'GET',
      url: '/quote-swap',
      query: { network: 'base', baseToken: 'WETH', quoteToken: 'USDC', amount: '1', side: 'SELL' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('No result found');
  });
});
