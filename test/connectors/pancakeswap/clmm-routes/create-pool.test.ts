import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');

const mockWBNB = { symbol: 'WBNB', address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', decimals: 18 };
const mockUSDT = { symbol: 'USDT', address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 };
const mockWallet = '0x0000000000000000000000000000000000000001';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/pancakeswap/clmm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Pancakeswap V3 CLMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const tokenByLookup: Record<string, any> = {
      WBNB: mockWBNB,
      WETH: mockWBNB,
      ETH: mockWBNB,
      USDT: mockUSDT,
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
      getToken: jest.fn((sym: string) => Promise.resolve(tokenByLookup[sym.toUpperCase()])),
    });
  });

  it('rejects the Uniswap-only 3000 fee tier (invalid on Pancakeswap V3) with a clear 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'bsc',
        walletAddress: mockWallet,
        baseToken: 'WBNB',
        quoteToken: 'USDT',
        fee: 3000, // valid on Uniswap V3, but NOT one of Pancakeswap's 100 / 500 / 2500 / 10000
        initialPrice: 600,
      },
    });

    // Fastify schema validation rejects the out-of-enum fee before the handler runs → 400.
    expect(response.statusCode).toBe(400);
  });

  it('rejects baseToken == quoteToken with a clear 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'bsc',
        walletAddress: mockWallet,
        baseToken: 'WBNB',
        quoteToken: 'WBNB',
        fee: 2500,
        initialPrice: 600,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/different/i);
  });
});
