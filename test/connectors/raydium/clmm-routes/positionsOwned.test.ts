import { PublicKey, Keypair } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { positionsOwnedRoute } = await import('../../../../src/connectors/raydium/clmm-routes/positionsOwned');
  await server.register(positionsOwnedRoute);
  return server;
};

const mockWalletAddress = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
const mockWalletKeypair = Keypair.generate();

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

const mockRaydiumSDK = {
  clmm: {
    getOwnerPositionInfo: jest
      .fn()
      .mockResolvedValue([{ nftMint: new PublicKey(mockPosition1NFT) }, { nftMint: new PublicKey(mockPosition2NFT) }]),
  },
};

describe('GET /positions-owned', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();

    // Mock Solana.getInstance
    const mockSolana = {
      connection: {},
      getPositionCache: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

    // Mock Raydium.getInstance
    const mockRaydium = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWalletKeypair,
        isHardwareWallet: false,
      }),
      setOwner: jest.fn().mockResolvedValue(undefined),
      raydiumSDK: mockRaydiumSDK,
      getPositionInfo: jest.fn().mockResolvedValueOnce(mockPositions[0]).mockResolvedValueOnce(mockPositions[1]),
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return all positions for a wallet across all pools', async () => {
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
    expect(body[0]).toHaveProperty('address', mockPosition1NFT);
    expect(body[0]).toHaveProperty('poolAddress');
    expect(body[1]).toHaveProperty('address', mockPosition2NFT);
  });

  it('should return empty array when wallet has no positions', async () => {
    const mockRaydiumSDKEmpty = {
      clmm: {
        getOwnerPositionInfo: jest.fn().mockResolvedValue([]),
      },
    };

    const mockRaydium = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWalletKeypair,
        isHardwareWallet: false,
      }),
      setOwner: jest.fn().mockResolvedValue(undefined),
      raydiumSDK: mockRaydiumSDKEmpty,
      getPositionInfo: jest.fn(),
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

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

  it('should query multiple program IDs', async () => {
    const mockRaydiumSDKMulti = {
      clmm: {
        getOwnerPositionInfo: jest
          .fn()
          .mockResolvedValueOnce([{ nftMint: new PublicKey(mockPosition1NFT) }])
          .mockResolvedValueOnce([{ nftMint: new PublicKey(mockPosition2NFT) }]),
      },
    };

    const mockRaydium = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWalletKeypair,
        isHardwareWallet: false,
      }),
      setOwner: jest.fn().mockResolvedValue(undefined),
      raydiumSDK: mockRaydiumSDKMulti,
      getPositionInfo: jest.fn().mockResolvedValueOnce(mockPositions[0]).mockResolvedValueOnce(mockPositions[1]),
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

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
    expect(body.length).toBe(2);
  });

  it('should skip positions that fail to fetch info', async () => {
    const mockRaydium = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWalletKeypair,
        isHardwareWallet: false,
      }),
      setOwner: jest.fn().mockResolvedValue(undefined),
      raydiumSDK: mockRaydiumSDK,
      getPositionInfo: jest
        .fn()
        .mockResolvedValueOnce(mockPositions[0])
        .mockRejectedValueOnce(new Error('Failed to fetch')), // Second position fails
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydium);

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
    expect(body[0]).toHaveProperty('address', mockPosition1NFT);
  });
});
