import { Keypair } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/chains/solana/solana.utils', () => ({
  getAvailableSolanaNetworks: jest.fn().mockReturnValue(['mainnet-beta', 'devnet']),
}));
jest.mock('../../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue(1), // Default slippage
    }),
  },
}));
jest.mock('../../../../src/services/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { openPositionRoute } = await import('../../../../src/connectors/raydium/clmm-routes/openPosition');
  await server.register(openPositionRoute);
  return server;
};

const mockSOL = {
  symbol: 'SOL',
  address: 'So11111111111111111111111111111111111111112',
  decimals: 9,
};

const mockUSDC = {
  symbol: 'USDC',
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  decimals: 6,
};

const mockPoolAddress = 'clmm-pool-address-123';
const mockWalletAddress = '11111111111111111111111111111111';
const mockWallet = Keypair.generate();

const mockClmmPoolInfo = {
  address: mockPoolAddress,
  baseTokenAddress: mockSOL.address,
  quoteTokenAddress: mockUSDC.address,
  binStep: 10,
  feePct: 0.0025,
  price: 150,
  baseTokenAmount: 1000,
  quoteTokenAmount: 150000,
  activeBinId: 100,
};

const mockApiPoolInfo = {
  id: mockPoolAddress,
  mintA: { address: mockSOL.address, decimals: 9 },
  mintB: { address: mockUSDC.address, decimals: 6 },
  price: 150,
  tickSpacing: 10,
  tickCurrent: 100,
  programId: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
};

describe('POST /open-position', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should open a CLMM position successfully with setOwner called', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'clmm-position-tx-123';
    const mockPositionNftMint = 'position-nft-mint-address';

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      executeTransaction: jest.fn().mockResolvedValue(mockTxId),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({
              txId: mockTxId,
              positionNftMint: mockPositionNftMint,
            }),
          }),
        },
        connection: {
          getEpochInfo: jest.fn().mockResolvedValue({ epoch: 100, slotIndex: 0 }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/open-position',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        lowerPrice: 140,
        upperPrice: 160,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Verify setOwner was called with the wallet
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledTimes(1);

    // Verify the response
    expect(body).toHaveProperty('txId', mockTxId);
    expect(body).toHaveProperty('positionAddress', mockPositionNftMint);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('lowerPrice', 140);
    expect(body).toHaveProperty('upperPrice', 160);
  });

  it('should verify setOwner is called before pool operations', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    let setOwnerCallOrder = 0;
    let getClmmPoolInfoCallOrder = 0;
    let callCounter = 0;

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockImplementation(() => {
        setOwnerCallOrder = ++callCounter;
        return Promise.resolve();
      }),
      getClmmPoolInfo: jest.fn().mockImplementation(() => {
        getClmmPoolInfoCallOrder = ++callCounter;
        return Promise.resolve(mockClmmPoolInfo);
      }),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      executeTransaction: jest.fn().mockResolvedValue('mock-tx-id'),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({
              txId: 'mock-tx-id',
              positionNftMint: 'mock-position-nft',
            }),
          }),
        },
        connection: {
          getEpochInfo: jest.fn().mockResolvedValue({ epoch: 100, slotIndex: 0 }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/open-position',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        lowerPrice: 140,
        upperPrice: 160,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(200);

    // Verify setOwner was called before getClmmPoolInfo
    expect(setOwnerCallOrder).toBeLessThan(getClmmPoolInfoCallOrder);
    expect(setOwnerCallOrder).toBe(1);
    expect(getClmmPoolInfoCallOrder).toBe(2);
  });

  it('should handle wallet not found error', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn(),
      getWallet: jest.fn().mockRejectedValue(new Error('Wallet not found')),
      estimateGasPrice: jest.fn(),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn(),
      getClmmPoolInfo: jest.fn(),
      getClmmPoolfromAPI: jest.fn(),
      executeTransaction: jest.fn(),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn(),
          openPositionFromBase: jest.fn(),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/open-position',
      body: {
        network: 'mainnet-beta',
        walletAddress: 'invalid-wallet',
        poolAddress: mockPoolAddress,
        lowerPrice: 140,
        upperPrice: 160,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(500);
    expect(mockRaydiumInstance.setOwner).not.toHaveBeenCalled();
  });

  it('should handle pool not found error', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(null),
      getClmmPoolfromAPI: jest.fn(),
      executeTransaction: jest.fn(),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn(),
          openPositionFromBase: jest.fn(),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/open-position',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: 'invalid-pool',
        lowerPrice: 140,
        upperPrice: 160,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);
  });

  it('should handle invalid price range', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      executeTransaction: jest.fn(),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: jest.fn(),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/open-position',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        lowerPrice: 160, // Lower price is higher than upper price
        upperPrice: 140,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);
  });

  it('should use custom compute units and priority fee', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockOpenPositionFunc = jest.fn().mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        txId: 'mock-tx-id',
        positionNftMint: 'mock-position-nft',
      }),
    });

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      executeTransaction: jest.fn().mockResolvedValue('mock-tx-id'),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: mockOpenPositionFunc,
        },
        connection: {
          getEpochInfo: jest.fn().mockResolvedValue({ epoch: 100, slotIndex: 0 }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const customComputeUnits = 500000;
    const customPriorityFee = 5000;

    const response = await server.inject({
      method: 'POST',
      url: '/open-position',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        lowerPrice: 140,
        upperPrice: 160,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
        slippagePct: 1,
        computeUnits: customComputeUnits,
        priorityFeePerCU: customPriorityFee,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);

    // Verify that openPositionFromBase was called with the custom compute budget
    const openPositionCall = mockOpenPositionFunc.mock.calls[0];
    expect(openPositionCall[0].computeBudgetConfig.units).toBe(customComputeUnits);
    expect(openPositionCall[0].computeBudgetConfig.microLamports).toBe(customPriorityFee);
  });
});
