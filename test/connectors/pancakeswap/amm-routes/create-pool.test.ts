import { Ethereum } from '../../../../src/chains/ethereum/ethereum';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/ethereum/ethereum');

const mockWETH = { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 };
const mockWallet = '0x0000000000000000000000000000000000000001';

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { createPoolRoute } = await import('../../../../src/connectors/pancakeswap/amm-routes/createPool');
  await server.register(createPoolRoute);
  return server;
};

describe('POST /create-pool (Pancakeswap V2 AMM)', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Ethereum.getInstance as jest.Mock).mockResolvedValue({
      getWallet: jest.fn().mockResolvedValue({ address: mockWallet }),
      // Both sides resolve to WETH so the "only one side can be ETH/WETH" / "must be different" guard fires.
      getToken: jest.fn(() => Promise.resolve(mockWETH)),
    });
  });

  it('rejects an invalid pair where both sides resolve to the same (WETH) token with a 400', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/create-pool',
      payload: {
        network: 'bsc',
        walletAddress: mockWallet,
        baseToken: 'ETH',
        quoteToken: 'WETH',
        baseTokenAmount: 1,
        quoteTokenAmount: 1,
      },
    });

    // ETH and WETH resolve to the same address, so the "must be different" / "one side" guard fires (400, not 500).
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/different|one side/i);
  });
});
