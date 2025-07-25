import { Keypair, VersionedTransaction, Transaction, MessageV0 } from '@solana/web3.js';

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
      estimateGas: jest.fn().mockResolvedValue(2000),
      simulateTransaction: jest.fn().mockResolvedValue(undefined),
      sendAndConfirmRawTransaction: jest.fn().mockResolvedValue({
        confirmed: true,
        signature: 'mock-signature',
        txData: { meta: { fee: 5000 } },
      }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [-0.999, -149.85], // Base and quote token changes (negative for spending)
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'mock-transaction-id-123';
    const mockRaydiumInstance = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWallet,
        isHardwareWallet: false,
      }),
      signTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      setOwner: jest.fn().mockResolvedValue(undefined),
      getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue(mockTxId),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn().mockResolvedValue({
            transaction: new VersionedTransaction(
              new MessageV0({
                header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
                staticAccountKeys: [],
                recentBlockhash: 'test-blockhash',
                compiledInstructions: [],
                addressTableLookups: [],
              }),
            ),
          }),
        },
        cpmm: {
          addLiquidity: jest.fn().mockResolvedValue({
            transaction: new VersionedTransaction(
              new MessageV0({
                header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
                staticAccountKeys: [],
                recentBlockhash: 'test-blockhash',
                compiledInstructions: [],
                addressTableLookups: [],
              }),
            ),
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

    // Verify prepareWallet was called instead of setOwner
    expect(mockRaydiumInstance.prepareWallet).toHaveBeenCalledWith(mockWalletAddress);
    expect(mockRaydiumInstance.prepareWallet).toHaveBeenCalledTimes(1);

    // Verify the response
    expect(body).toHaveProperty('signature', 'mock-signature');
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('fee');
    expect(body.data).toHaveProperty('baseTokenAmountAdded');
    expect(body.data).toHaveProperty('quoteTokenAmountAdded');
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
      estimateGas: jest.fn().mockResolvedValue(2000),
      simulateTransaction: jest.fn().mockResolvedValue(undefined),
      sendAndConfirmRawTransaction: jest.fn().mockResolvedValue({
        confirmed: true,
        signature: 'mock-signature',
        txData: { meta: { fee: 5000 } },
      }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [-1, -150],
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'mock-transaction-id-456';
    const mockRaydiumInstance = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWallet,
        isHardwareWallet: false,
      }),
      signTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      setOwner: jest.fn().mockResolvedValue(undefined),
      getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue(mockTxId),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn().mockResolvedValue({
            transaction: new VersionedTransaction(
              new MessageV0({
                header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
                staticAccountKeys: [],
                recentBlockhash: 'test-blockhash',
                compiledInstructions: [],
                addressTableLookups: [],
              }),
            ),
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
    expect(mockRaydiumInstance.prepareWallet).toHaveBeenCalledWith(mockWalletAddress);
  });

  it('should handle wallet not found error', async () => {
    const mockSolanaInstance = {
      getToken: jest.fn((token) => {
        if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
        if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      getWallet: jest.fn().mockRejectedValue(new Error('Wallet not found')),
      estimateGas: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      prepareWallet: jest.fn().mockRejectedValue(new Error('Wallet not found')),
      signTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      setOwner: jest.fn(),
      getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
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
    // prepareWallet was called and threw the error
    expect(mockRaydiumInstance.prepareWallet).toHaveBeenCalledWith('invalid-wallet');
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
      estimateGas: jest.fn().mockResolvedValue(2000),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWallet,
        isHardwareWallet: false,
      }),
      signTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      setOwner: jest.fn().mockResolvedValue(undefined),
      getAmmPoolInfo: jest.fn().mockResolvedValue(null),
      getPoolfromAPI: jest.fn().mockResolvedValue(null),
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
    expect(mockRaydiumInstance.prepareWallet).toHaveBeenCalledWith(mockWalletAddress);
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
      estimateGas: jest.fn().mockResolvedValue(2000),
      simulateTransaction: jest.fn().mockResolvedValue(undefined),
      sendAndConfirmRawTransaction: jest.fn().mockResolvedValue({
        confirmed: true,
        signature: 'mock-signature',
        txData: { meta: { fee: 5000 } },
      }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [-1, -150],
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockTxId = 'mock-transaction-id-789';
    const mockAddLiquidityFunc = jest.fn().mockResolvedValue({
      transaction: new VersionedTransaction(
        new MessageV0({
          header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
          staticAccountKeys: [],
          recentBlockhash: 'test-blockhash',
          compiledInstructions: [],
          addressTableLookups: [],
        }),
      ),
    });

    const mockRaydiumInstance = {
      prepareWallet: jest.fn().mockResolvedValue({
        wallet: mockWallet,
        isHardwareWallet: false,
      }),
      signTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
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
    expect(mockRaydiumInstance.prepareWallet).toHaveBeenCalledWith(mockWalletAddress);

    // Verify that addLiquidity was called with the custom compute units
    const addLiquidityCall = mockAddLiquidityFunc.mock.calls[0];
    expect(addLiquidityCall[0].computeBudgetConfig.units).toBe(customComputeUnits);
  });

  it('should verify prepareWallet is called before SDK operations', async () => {
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
      estimateGas: jest.fn().mockResolvedValue(2000),
      simulateTransaction: jest.fn().mockResolvedValue(undefined),
      sendAndConfirmRawTransaction: jest.fn().mockResolvedValue({
        confirmed: true,
        signature: 'mock-signature',
        txData: { meta: { fee: 5000 } },
      }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [-1, -150],
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    let prepareWalletCallOrder = 0;
    let getAmmPoolInfoCallOrder = 0;
    let callCounter = 0;

    const mockRaydiumInstance = {
      prepareWallet: jest.fn().mockImplementation(() => {
        prepareWalletCallOrder = ++callCounter;
        return Promise.resolve({
          wallet: mockWallet,
          isHardwareWallet: false,
        });
      }),
      signTransaction: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
      setOwner: jest.fn(),
      getAmmPoolInfo: jest.fn().mockImplementation(() => {
        getAmmPoolInfoCallOrder = ++callCounter;
        return Promise.resolve(mockAmmPoolInfo);
      }),
      getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
      executeTransaction: jest.fn().mockResolvedValue('mock-tx-id'),
      raydiumSDK: {
        liquidity: {
          addLiquidity: jest.fn().mockResolvedValue({
            transaction: new VersionedTransaction(
              new MessageV0({
                header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
                staticAccountKeys: [],
                recentBlockhash: 'test-blockhash',
                compiledInstructions: [],
                addressTableLookups: [],
              }),
            ),
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

    // Verify prepareWallet was called before getAmmPoolInfo
    expect(prepareWalletCallOrder).toBeLessThan(getAmmPoolInfoCallOrder);
    expect(prepareWalletCallOrder).toBe(1);
    expect(getAmmPoolInfoCallOrder).toBe(2);
  });
});
