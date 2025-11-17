import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
  }),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/connectors/meteora/clmm-routes/positionsOwned');
  await server.register(positionsOwnedRoute);
  return server;
};

const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';

const mockPositions = [
  {
    address: 'position1address',
    poolAddress: '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3',
    baseTokenAddress: 'So11111111111111111111111111111111111111112',
    quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    baseTokenAmount: 0.5,
    quoteTokenAmount: 100,
    baseFeeAmount: 0.001,
    quoteFeeAmount: 0.2,
    lowerBinId: 1000,
    upperBinId: 2000,
    lowerPrice: 150,
    upperPrice: 250,
    price: 200,
  },
  {
    address: 'position2address',
    poolAddress: 'anotherPoolAddress',
    baseTokenAddress: 'So11111111111111111111111111111111111111112',
    quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    baseTokenAmount: 1.0,
    quoteTokenAmount: 200,
    baseFeeAmount: 0.002,
    quoteFeeAmount: 0.4,
    lowerBinId: 1500,
    upperBinId: 2500,
    lowerPrice: 180,
    upperPrice: 220,
    price: 200,
  },
];

describe('GET /positions-owned', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();

    // Mock Solana.getInstance
    const mockSolana = {
      getPositionCache: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    // Mock Meteora.getInstance
    const mockMeteora = {
      getAllPositionsForWallet: jest.fn().mockResolvedValue(mockPositions),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return all positions for a wallet', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0]).toHaveProperty('address');
    expect(body[0]).toHaveProperty('poolAddress');
    expect(body[0]).toHaveProperty('baseTokenAddress');
    expect(body[0]).toHaveProperty('quoteTokenAddress');
    expect(body[0]).toHaveProperty('baseTokenAmount');
    expect(body[0]).toHaveProperty('quoteTokenAmount');
    expect(body[0]).toHaveProperty('lowerPrice');
    expect(body[0]).toHaveProperty('upperPrice');
  });

  it('should return empty array when wallet has no positions', async () => {
    const mockMeteora = {
      getAllPositionsForWallet: jest.fn().mockResolvedValue([]),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('should return 400 for invalid wallet address', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
        walletAddress: 'invalid-address',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 when walletAddress is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should use default network if not provided', async () => {
    const mockMeteora = {
      getAllPositionsForWallet: jest.fn().mockResolvedValue(mockPositions),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteora);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(Meteora.getInstance).toHaveBeenCalledWith(expect.any(String));
  });
});
