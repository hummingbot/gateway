import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { PancakeswapSol } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/positionsOwned');
  await server.register(positionsOwnedRoute);
  return server;
};

const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';

const mockPositions = [
  {
    address: 'nftmint1',
    poolAddress: 'DJNtGuBGEQiUCWE8F981M2C3ZghZt2XLD8f2sQdZ6rsZ',
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
    address: 'nftmint2',
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

const mockTokenAccounts = {
  value: [
    {
      account: {
        data: {
          parsed: {
            info: {
              tokenAmount: { decimals: 0, amount: '1', uiAmount: 1 },
              mint: 'nftmint1',
            },
          },
        },
      },
    },
    {
      account: {
        data: {
          parsed: {
            info: {
              tokenAmount: { decimals: 0, amount: '1', uiAmount: 1 },
              mint: 'nftmint2',
            },
          },
        },
      },
    },
  ],
};

describe('GET /positions-owned', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return all positions for a wallet across all pools', async () => {
    // Mock Solana.getInstance - needs to handle TWO calls to getParsedTokenAccountsByOwner
    const mockConnection = {
      getParsedTokenAccountsByOwner: jest
        .fn()
        .mockResolvedValueOnce(mockTokenAccounts) // SPL Token program
        .mockResolvedValueOnce({ value: [] }), // Token2022 program
    };
    const mockSolana = {
      connection: mockConnection,
      getPositionCache: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    // Mock PancakeswapSol.getInstance
    const mockPancakeswapSol = {
      getPositionInfo: jest.fn().mockResolvedValueOnce(mockPositions[0]).mockResolvedValueOnce(mockPositions[1]),
    };
    (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswapSol);

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
    expect(body[0]).toHaveProperty('address', 'nftmint1');
    expect(body[0]).toHaveProperty('poolAddress');
    expect(body[1]).toHaveProperty('address', 'nftmint2');
  });

  it('should return empty array when wallet has no NFT positions', async () => {
    const mockConnection = {
      getParsedTokenAccountsByOwner: jest
        .fn()
        .mockResolvedValueOnce({ value: [] }) // SPL Token program
        .mockResolvedValueOnce({ value: [] }), // Token2022 program
    };
    const mockSolana = {
      connection: mockConnection,
      getPositionCache: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

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

  it('should skip non-PancakeSwap NFTs', async () => {
    const mockConnection = {
      getParsedTokenAccountsByOwner: jest
        .fn()
        .mockResolvedValueOnce(mockTokenAccounts) // SPL Token program
        .mockResolvedValueOnce({ value: [] }), // Token2022 program
    };
    const mockSolana = {
      connection: mockConnection,
      getPositionCache: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    const mockPancakeswapSol = {
      getPositionInfo: jest
        .fn()
        .mockResolvedValueOnce(mockPositions[0]) // First is PancakeSwap position
        .mockResolvedValueOnce(null), // Second is not a PancakeSwap position
    };
    (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswapSol);

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
    expect(body.length).toBe(1);
    expect(body[0]).toHaveProperty('address', 'nftmint1');
  });
});
