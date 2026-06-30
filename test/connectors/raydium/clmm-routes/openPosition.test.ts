import { Keypair, VersionedTransaction, MessageV0 } from '@solana/web3.js';

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

// Mock the quotePosition function
jest.mock('../../../../src/connectors/raydium/clmm-routes/quotePosition', () => ({
  quotePosition: jest.fn().mockResolvedValue({
    baseLimited: true,
    baseTokenAmount: 1,
    quoteTokenAmount: 150,
    baseTokenAmountMax: 1.01,
    quoteTokenAmountMax: 151.5,
  }),
}));

// Mock TickUtils
jest.mock('@raydium-io/raydium-sdk-v2', () => ({
  ...jest.requireActual('@raydium-io/raydium-sdk-v2'),
  TickUtils: {
    getPriceAndTick: jest.fn(() => ({ tick: 100, price: 150 })),
  },
  TxVersion: { V0: 0 },
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

// A confirmed transaction result returned by connection.getTransaction
const mockTxData = { meta: { fee: 5000 } };

// Build a fresh Solana instance mock matching the wallet-type-agnostic route flow.
const buildSolanaMock = (overrides: Record<string, any> = {}) => ({
  getToken: jest.fn((token) => {
    if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
    if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
    return Promise.resolve(null);
  }),
  estimateGasPrice: jest.fn().mockResolvedValue(2000),
  sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({
    signature: 'mock-signature',
    fee: 5000,
  }),
  connection: {
    getTransaction: jest.fn().mockResolvedValue(mockTxData),
  },
  extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
    balanceChanges: [-0.002, -1, -150],
  }),
  extractClmmBalanceChanges: jest.fn().mockResolvedValue({
    baseTokenChange: -1,
    quoteTokenChange: -150,
    rent: 0.002,
  }),
  getPositionCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
  }),
  ...overrides,
});

const buildVersionedTransaction = () =>
  new VersionedTransaction(
    new MessageV0({
      header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
      staticAccountKeys: [],
      recentBlockhash: 'test-blockhash',
      compiledInstructions: [],
      addressTableLookups: [],
    }),
  );

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

  it('should open a CLMM position successfully', async () => {
    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockPositionNftMint = 'position-nft-mint-address';
    const mockTransaction = buildVersionedTransaction();
    const mockSigners = [Keypair.generate()];

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({ currentPrice: 150 }),
      findDefaultPool: jest.fn(),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: jest.fn().mockResolvedValue({
            transaction: mockTransaction,
            extInfo: { nftMint: { toBase58: () => mockPositionNftMint } },
            signers: mockSigners,
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

    // The SDK owner is set to the wallet's public key (wallet-type-agnostic).
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledTimes(1);

    // The build + send goes through the chokepoint, passing the SDK position-NFT signers.
    expect(mockSolanaInstance.sendAndConfirmTransactionForWallet).toHaveBeenCalledWith(
      mockTransaction,
      mockWalletAddress,
      mockSigners,
    );
    expect(mockSolanaInstance.connection.getTransaction).toHaveBeenCalledWith(
      'mock-signature',
      expect.objectContaining({ commitment: 'confirmed', maxSupportedTransactionVersion: 0 }),
    );

    // Verify the response
    expect(body).toHaveProperty('signature', 'mock-signature');
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('positionAddress', mockPositionNftMint);
    expect(body.data).toHaveProperty('fee');
    expect(body.data).toHaveProperty('positionRent');
    expect(body.data).toHaveProperty('baseTokenAmountAdded');
    expect(body.data).toHaveProperty('quoteTokenAmountAdded');
  });

  it('should set the owner before pool operations', async () => {
    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    let setOwnerCallOrder = 0;
    let getClmmPoolfromAPICallOrder = 0;
    let callCounter = 0;

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockImplementation(() => {
        setOwnerCallOrder = ++callCounter;
        return Promise.resolve(undefined);
      }),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockImplementation(() => {
        getClmmPoolfromAPICallOrder = ++callCounter;
        return Promise.resolve([mockApiPoolInfo, {}]);
      }),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({ currentPrice: 150 }),
      findDefaultPool: jest.fn(),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: jest.fn().mockResolvedValue({
            transaction: buildVersionedTransaction(),
            extInfo: { nftMint: { toBase58: () => 'mock-position-nft' } },
            signers: [],
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

    // Verify setOwner was called before getClmmPoolfromAPI
    expect(setOwnerCallOrder).toBeLessThan(getClmmPoolfromAPICallOrder);
    expect(setOwnerCallOrder).toBe(1);
    expect(getClmmPoolfromAPICallOrder).toBe(2);
  });

  it('should handle invalid wallet address error', async () => {
    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn(),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
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

    // An invalid wallet address fails when constructing the PublicKey owner.
    expect(response.statusCode).toBe(500);
  });

  it('should handle pool not found error', async () => {
    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue(null),
      getClmmPoolfromRPC: jest.fn(),
      findDefaultPool: jest.fn(),
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
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();
  });

  it('should handle invalid price range', async () => {
    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({ currentPrice: 150 }),
      findDefaultPool: jest.fn(),
      raydiumSDK: {
        clmm: {
          getPriceAndTick: jest.fn().mockReturnValue({ tick: 100 }),
          openPositionFromBase: jest.fn().mockResolvedValue({
            transaction: buildVersionedTransaction(),
            extInfo: { nftMint: { toBase58: () => 'mock-position-nft' } },
            signers: [],
          }),
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
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();
  });

  it('should use default compute units and dynamic priority fee', async () => {
    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockOpenPositionFunc = jest.fn().mockResolvedValue({
      transaction: buildVersionedTransaction(),
      extInfo: { nftMint: { toBase58: () => 'mock-position-nft' } },
      signers: [],
    });

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getClmmPoolInfo: jest.fn().mockResolvedValue(mockClmmPoolInfo),
      getClmmPoolfromAPI: jest.fn().mockResolvedValue([mockApiPoolInfo, {}]),
      getClmmPoolfromRPC: jest.fn().mockResolvedValue({ currentPrice: 150 }),
      findDefaultPool: jest.fn(),
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
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();

    // Verify that openPositionFromBase was called with the default compute budget
    const openPositionCall = mockOpenPositionFunc.mock.calls[0];
    expect(openPositionCall[0].computeBudgetConfig.units).toBe(500000); // Using hardcoded COMPUTE_UNITS
    expect(openPositionCall[0].computeBudgetConfig.microLamports).toBe(2000000000); // Dynamic priority fee from estimateGasPrice * 1e6
  });
});
