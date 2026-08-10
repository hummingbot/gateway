import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');

const mockWETH = { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 };
const mockUSDC = { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 };
const mockWallet = '0x0000000000000000000000000000000000000001';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/uniswap/clmm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Uniswap V3 CLMM)', () => {
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
      WETH: mockWETH,
      ETH: mockWETH,
      USDC: mockUSDC,
    };
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
      getToken: jest.fn((sym: string) => Promise.resolve(tokenByLookup[sym.toUpperCase()])),
    });
  });

  it('rejects an invalid fee tier with a clear 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'base',
        walletAddress: mockWallet,
        baseToken: 'WETH',
        quoteToken: 'USDC',
        fee: 1234, // not one of 100 / 500 / 3000 / 10000
        initialPrice: 3000,
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
        network: 'base',
        walletAddress: mockWallet,
        baseToken: 'WETH',
        quoteToken: 'WETH',
        fee: 3000,
        initialPrice: 3000,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/different/i);
  });
});
