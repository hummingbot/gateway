import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/trading/clmm/positions-owned');
  await server.register(positionsOwnedRoute);
  return server;
};

const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';

const mockPosition1NFT = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';
const mockPosition2NFT = '8YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G6';

const mockPositions = [
  {
    address: mockPosition1NFT,
    poolAddress: '61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht',
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
    address: mockPosition2NFT,
    poolAddress: 'anotherPoolAddress',
    baseTokenAddress: 'So11111111111111111111111111111111111111112',
    quoteTokenAddress: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
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

const requestPositions = (app: any, walletAddress: string) =>
  app.inject({
    method: 'GET',
    url: '/positions-owned',
    query: {
      chainNetwork: 'solana-mainnet-beta',
      connector: 'raydium',
      walletAddress,
    },
  });

const mockRaydiumWith = (getPositionsForWalletAddress: jest.Mock) => {
  const mockRaydium = { getPositionsForWalletAddress, prepareWallet: jest.fn(), setOwner: jest.fn() };
  (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);
  return mockRaydium;
};

describe('GET /positions-owned', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();

    const mockSolana = {
      connection: {},
      getPositionCache: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return all positions for a wallet across all pools', async () => {
    mockRaydiumWith(jest.fn().mockResolvedValue(mockPositions));

    const response = await requestPositions(app, mockWalletAddress);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0]).toHaveProperty('address', mockPosition1NFT);
    expect(body[0]).toHaveProperty('poolAddress');
    expect(body[1]).toHaveProperty('address', mockPosition2NFT);
  });

  it('should look positions up by address, without a wallet stored in Gateway', async () => {
    const mockRaydium = mockRaydiumWith(jest.fn().mockResolvedValue(mockPositions));

    const response = await requestPositions(app, mockWalletAddress);

    expect(response.statusCode).toBe(200);
    expect(mockRaydium.getPositionsForWalletAddress).toHaveBeenCalledWith(mockWalletAddress);
    expect(mockRaydium.prepareWallet).not.toHaveBeenCalled();
    expect(mockRaydium.setOwner).not.toHaveBeenCalled();
  });

  it('should return empty array when wallet has no positions', async () => {
    mockRaydiumWith(jest.fn().mockResolvedValue([]));

    const response = await requestPositions(app, mockWalletAddress);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('should return 400 for invalid wallet address', async () => {
    mockRaydiumWith(jest.fn().mockResolvedValue([]));

    const response = await requestPositions(app, 'invalid-address');

    expect(response.statusCode).toBe(400);
  });
});
