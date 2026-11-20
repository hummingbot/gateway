import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { ZeroX } from '../../../../src/connectors/0x/0x';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';
import { parseWire } from '../../../utils/wire';

jest.mock('../../../../src/chains/ethereum/ethereum');
jest.mock('../../../../src/connectors/0x/0x');

const RealZeroX = jest.requireActual('../../../../src/connectors/0x/0x').ZeroX;

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { quoteSwapRoute } = await import('../../../../src/trading/trading-router-routes/quoteSwap');
  await server.register(quoteSwapRoute);
  return server;
};

const TAKER = '0x1234567890123456789012345678901234567890';

const mockWETH = {
  symbol: 'WETH',
  address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  decimals: 18,
};

const mockUSDC = {
  symbol: 'USDC',
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  decimals: 6,
};

const mockQuoteResponse = {
  sellToken: mockWETH.address,
  buyToken: mockUSDC.address,
  sellAmount: '100000000000000000', // 0.1 WETH
  buyAmount: '150000000', // 150 USDC
  estimatedPriceImpact: '0.001',
  to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  data: '0x1234567890',
  value: '0',
};

// The 0x API is the only thing faked: the connector's own amount parsing and
// formatting run for real, so the numbers in the response are Gateway's.
const mockZeroX = (apiResponse: any) => {
  const zeroX = {
    parseTokenAmount: RealZeroX.prototype.parseTokenAmount,
    formatTokenAmount: RealZeroX.prototype.formatTokenAmount,
    getQuote: jest.fn().mockResolvedValue(apiResponse),
    getPrice: jest.fn().mockResolvedValue(apiResponse),
  };
  (ZeroX.getInstance as jest.Mock).mockResolvedValue(zeroX);
  return zeroX;
};

const quote = (server: any, query: Record<string, string>) =>
  server.inject({
    method: 'GET',
    url: '/quote-swap',
    query: {
      chainNetwork: 'ethereum-mainnet',
      connector: '0x',
      baseToken: 'WETH',
      quoteToken: 'USDC',
      amount: '0.1',
      slippagePct: '0.5',
      ...query,
    },
  });

describe('GET /quote-swap (0x)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const tokens: Record<string, any> = { WETH: mockWETH, USDC: mockUSDC };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({ getToken: jest.fn(async (s: string) => tokens[s]) });
    (Ethereum.getWalletAddressExample as jest.Mock).mockResolvedValue(TAKER);
  });

  it('SELL asks 0x for a firm quote selling the base amount, and prices the output', async () => {
    const zeroX = mockZeroX(mockQuoteResponse);

    const response = await quote(server, { side: 'SELL', indicativePrice: 'false' });

    expect(response.statusCode).toBe(200);
    expect(zeroX.getQuote).toHaveBeenCalledWith({
      sellToken: mockWETH.address,
      buyToken: mockUSDC.address,
      takerAddress: TAKER,
      slippagePercentage: 0.005,
      skipValidation: false,
      sellAmount: '100000000000000000',
    });
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      tokenIn: mockWETH.address,
      tokenOut: mockUSDC.address,
      amountIn: 0.1,
      amountOut: 150,
      price: 1500,
      priceImpactPct: 0.1,
    });
    expect(body.minAmountOut).toBeCloseTo(149.25, 10);
    expect(body.quoteId).not.toBe('indicative-price');
  });

  it('BUY asks 0x for the base amount as buyAmount, and bounds the input', async () => {
    const zeroX = mockZeroX({
      ...mockQuoteResponse,
      sellToken: mockUSDC.address,
      buyToken: mockWETH.address,
      sellAmount: '150000000',
      buyAmount: '100000000000000000',
    });

    const response = await quote(server, { side: 'BUY', indicativePrice: 'false' });

    expect(response.statusCode).toBe(200);
    expect(zeroX.getQuote).toHaveBeenCalledWith({
      sellToken: mockUSDC.address,
      buyToken: mockWETH.address,
      takerAddress: TAKER,
      slippagePercentage: 0.005,
      skipValidation: false,
      buyAmount: '100000000000000000',
    });
    const body = parseWire(response.body);
    expect(body).toMatchObject({
      tokenIn: mockUSDC.address,
      tokenOut: mockWETH.address,
      amountIn: 150,
      amountOut: 0.1,
      price: 1500,
    });
    expect(body.maxAmountIn).toBeCloseTo(150.75, 10);
  });

  it('should return 400 if token not found', async () => {
    mockZeroX(mockQuoteResponse);

    const response = await quote(server, { baseToken: 'INVALID', side: 'SELL' });

    expect(response.statusCode).toBe(400);
    expect(parseWire(response.body).message).toContain('Token not found');
  });

  it('should return indicative price when indicativePrice=true', async () => {
    const zeroX = mockZeroX(mockQuoteResponse);

    const response = await quote(server, { side: 'SELL', indicativePrice: 'true' });

    expect(response.statusCode).toBe(200);
    const body = parseWire(response.body);
    expect(zeroX.getPrice).toHaveBeenCalled();
    expect(zeroX.getQuote).not.toHaveBeenCalled();
    expect(body).toHaveProperty('quoteId', 'indicative-price');
    expect(body).toMatchObject({ amountIn: 0.1, amountOut: 150 });
    expect(body).not.toHaveProperty('expirationTime');
  });

  it('should default to indicative price when indicativePrice not specified', async () => {
    const zeroX = mockZeroX(mockQuoteResponse);

    const response = await quote(server, { side: 'SELL' });

    expect(response.statusCode).toBe(200);
    expect(zeroX.getPrice).toHaveBeenCalled();
    expect(zeroX.getQuote).not.toHaveBeenCalled();
    expect(parseWire(response.body)).toHaveProperty('quoteId', 'indicative-price');
  });
});
