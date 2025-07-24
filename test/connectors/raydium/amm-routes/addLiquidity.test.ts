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

// Mock the quoteLiquidity function
jest.mock('../../../../src/connectors/raydium/amm-routes/quoteLiquidity', () => ({
  quoteLiquidity: jest.fn(),
}));

// Mock logger to avoid errors
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
  const { addLiquidityRoute } = await import('../../../../src/connectors/raydium/amm-routes/addLiquidity');
  await server.register(addLiquidityRoute);
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

const mockPoolAddress = '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj';
const mockWalletAddress = '11111111111111111111111111111111';
const mockWallet = Keypair.generate();

const mockPoolInfo = {
  id: mockPoolAddress,
  baseMint: mockSOL.address,
  quoteMint: mockUSDC.address,
  mintA: {
    address: mockSOL.address,
    decimals: 9,
    symbol: 'SOL',
  },
  mintB: {
    address: mockUSDC.address,
    decimals: 6,
    symbol: 'USDC',
  },
  lpMint: {
    address: 'lp-mint-address',
    decimals: 9,
    symbol: 'LP',
  },
  programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
};

const mockPoolKeys = {
  // Mock pool keys
};

const mockAmmPoolInfo = {
  address: mockPoolAddress,
  baseTokenAddress: mockSOL.address,
  quoteTokenAddress: mockUSDC.address,
  feePct: 0.0025,
  price: 150,
  baseTokenAmount: 1000,
  quoteTokenAmount: 150000,
  poolType: 'amm',
  lpMint: {
    address: 'lp-mint-address',
    decimals: 9,
  },
};

describe('POST /add-liquidity', () => {
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

  it('should add liquidity successfully with setOwner called', async () => {
    // Import quoteLiquidity after mocking
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');

    // Mock quoteLiquidity response
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 149.85,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.35,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
      getSignatureByTransaction: jest.fn().mockResolvedValue('mock-signature'),
      getBalanceChanges: jest.fn().mockResolvedValue([0.999, 149.85]), // Base and quote token changes
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'mock-transaction-id-123';
    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue(mockTxId),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ txId: mockTxId }),
          }),
        },
        cpmm: {
          addLiquidity: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ txId: mockTxId }),
          }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add-liquidity',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
        slippagePct: 1,
      },
    });

    if (response.statusCode !== 200) {
      console.error('Response error:', response.body);
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Verify setOwner was called with the wallet
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledTimes(1);

    // Verify the response
    expect(body).toHaveProperty('txId', mockTxId);
    expect(body).toHaveProperty('poolAddress', mockPoolAddress);
    expect(body).toHaveProperty('lpTokenAmount');
    expect(body).toHaveProperty('lpTokenMint');
  });

  it('should handle base-limited liquidity addition', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');

    // Mock quoteLiquidity response for base-limited scenario
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150, // Proportional amount
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
      getSignatureByTransaction: jest.fn().mockResolvedValue('mock-signature'),
      getBalanceChanges: jest.fn().mockResolvedValue([1, 150]),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'mock-transaction-id-456';
    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue(mockTxId),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ txId: mockTxId }),
          }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add-liquidity',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 200, // More than proportional
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);
  });

  it('should handle wallet not found error', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockRejectedValue(new Error('Wallet not found')),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      setOwner: jest.fn(),
      getAmmPoolInfo: jest.fn(),
      getPoolfromAPI: jest.fn(),
      executeTransaction: jest.fn(),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn(),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add-liquidity',
      body: {
        network: 'mainnet-beta',
        walletAddress: 'invalid-wallet',
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(500);
    expect(mockRaydiumInstance.setOwner).not.toHaveBeenCalled();
  });

  it('should handle pool not found error', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

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
      getAmmPoolInfo: jest.fn().mockResolvedValue(null),
      getPoolfromAPI: jest.fn(),
      executeTransaction: jest.fn(),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn(),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add-liquidity',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: 'invalid-pool',
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);
  });

  it('should use custom compute units when provided', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
      getSignatureByTransaction: jest.fn().mockResolvedValue('mock-signature'),
      getBalanceChanges: jest.fn().mockResolvedValue([1, 150]),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'mock-transaction-id-789';
    const mockAddLiquidityFunc = jest.fn().mockReturnValue({
      execute: jest.fn().mockResolvedValue({ txId: mockTxId }),
    });

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockResolvedValue(undefined),
      getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue(mockTxId),
      raydiumSDK: {
        liquidity: {
          addLiquidity: mockAddLiquidityFunc,
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const customComputeUnits = 600000;
    const response = await server.inject({
      method: 'POST',
      url: '/add-liquidity',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
        slippagePct: 1,
        computeUnits: customComputeUnits,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalledWith(mockWallet);

    // Verify that addLiquidity was called with the custom compute units
    const addLiquidityCall = mockAddLiquidityFunc.mock.calls[0];
    expect(addLiquidityCall[0].computeBudgetConfig.units).toBe(customComputeUnits);
  });

  it('should verify setOwner is called before SDK operations', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      estimateGasPrice: jest.fn().mockResolvedValue(2000),
      getSignatureByTransaction: jest.fn().mockResolvedValue('mock-signature'),
      getBalanceChanges: jest.fn().mockResolvedValue([1, 150]),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    let setOwnerCallOrder = 0;
    let getAmmPoolInfoCallOrder = 0;
    let callCounter = 0;

    const mockRaydiumInstance = {
      setOwner: jest.fn().mockImplementation(() => {
        setOwnerCallOrder = ++callCounter;
        return Promise.resolve();
      }),
      getAmmPoolInfo: jest.fn().mockImplementation(() => {
        getAmmPoolInfoCallOrder = ++callCounter;
        return Promise.resolve(mockAmmPoolInfo);
      }),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue('mock-tx-id'),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ txId: 'mock-tx-id' }),
          }),
        },
      },
    };
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add-liquidity',
      body: {
        network: 'mainnet-beta',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(200);

    // Verify setOwner was called before getAmmPoolInfo
    expect(setOwnerCallOrder).toBeLessThan(getAmmPoolInfoCallOrder);
    expect(setOwnerCallOrder).toBe(1);
    expect(getAmmPoolInfoCallOrder).toBe(2);
  });
});
