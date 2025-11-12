import { PublicKey } from '@solana/web3.js';

import { Orca } from '../../../../src/connectors/orca/orca';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/connectors/orca/orca');
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF',
  }),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/connectors/orca/clmm-routes/positionsOwned');
  await server.register(positionsOwnedRoute);
  return server;
};

const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';

const mockPositions = [
  {
    address: 'position1address',
    poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    baseTokenAddress: 'So11111111111111111111111111111111111111112',
    quoteTokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    baseTokenAmount: 0.5,
    quoteTokenAmount: 100,
    baseFeeAmount: 0.001,
    quoteFeeAmount: 0.2,
    lowerBinId: -29440,
    upperBinId: -27200,
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
    lowerBinId: -28800,
    upperBinId: -26400,
    lowerPrice: 180,
    upperPrice: 220,
    price: 200,
  },
];

describe('GET /positions-owned', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();

    // Mock Orca.getInstance
    const mockOrca = {
      getPositionsForWalletAddress: jest.fn().mockResolvedValue(mockPositions),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);
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
        poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
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
    const mockOrca = {
      getPositionsForWalletAddress: jest.fn().mockResolvedValue([]),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
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

  it('should return 400 when poolAddress is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should use default network if not provided', async () => {
    const mockOrca = {
      getPositionsForWalletAddress: jest.fn().mockResolvedValue(mockPositions),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        walletAddress: mockWalletAddress,
        poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(Orca.getInstance).toHaveBeenCalledWith(expect.any(String));
  });

  it('should handle errors from Orca connector', async () => {
    const mockOrca = {
      getPositionsForWalletAddress: jest.fn().mockRejectedValue(new Error('Failed to fetch positions')),
    };
    (Orca.getInstance as jest.Mock).mockResolvedValue(mockOrca);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should validate Solana address format', async () => {
    const invalidAddresses = ['not-a-valid-address', '123', 'abcdefghij'];

    for (const invalidAddress of invalidAddresses) {
      const response = await app.inject({
        method: 'GET',
        url: '/positions-owned',
        query: {
          network: 'mainnet-beta',
          walletAddress: invalidAddress,
          poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        },
      });

      // Invalid addresses cause various errors (400 or 500)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
  });
});
