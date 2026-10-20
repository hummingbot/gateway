import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { PancakeswapSol } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/trading/clmm/positions-owned');
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

  it('looks up only the NFT accounts, from both token programs', async () => {
    const tokenAccount = (mint: string, decimals: number, uiAmount: number) => ({
      account: { data: { parsed: { info: { tokenAmount: { decimals, uiAmount }, mint } } } },
    });
    const mockConnection = {
      getParsedTokenAccountsByOwner: jest
        .fn()
        // SPL Token: one position NFT, one USDC balance of exactly 1 and one of 150.
        .mockResolvedValueOnce({
          value: [
            tokenAccount('nftmint1', 0, 1),
            tokenAccount('usdc-mint-balance-one', 6, 1),
            tokenAccount('usdc-mint-balance', 6, 150),
          ],
        })
        // Token2022: where PancakeSwap mints its position NFTs.
        .mockResolvedValueOnce({ value: [tokenAccount('nftmint2', 0, 1)] }),
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
    const positionsByMint: Record<string, any> = { nftmint1: mockPositions[0], nftmint2: mockPositions[1] };
    const mockPancakeswapSol = {
      getPositionInfo: jest.fn(async (mint: string) => positionsByMint[mint] ?? null),
    };
    (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue(mockPancakeswapSol);

    const response = await app.inject({
      method: 'GET',
      url: '/positions-owned',
      query: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).map((p: any) => p.address)).toEqual(['nftmint1', 'nftmint2']);
    // The fungible balances never reach the position lookup, whatever their amount.
    expect(mockPancakeswapSol.getPositionInfo.mock.calls.map(([mint]) => mint)).toEqual(['nftmint1', 'nftmint2']);
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
        walletAddress: 'invalid-address',
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'pancakeswap-sol',
        walletAddress: mockWalletAddress,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(1);
    expect(body[0]).toHaveProperty('address', 'nftmint1');
  });
});
