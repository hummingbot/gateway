import { VersionedTransaction, MessageV0 } from '@solana/web3.js';

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
      // Read at import time by the trading routes to build the chainNetwork enum.
      getSupportedChainNetworks: jest.fn().mockReturnValue(['solana-devnet', 'solana-mainnet-beta']),
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
  const { addLiquidityRoute } = await import('../../../../src/trading/trading-amm-routes/add');
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

const mockVersionedTransaction = () =>
  new VersionedTransaction(
    new MessageV0({
      header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
      staticAccountKeys: [],
      recentBlockhash: 'test-blockhash',
      compiledInstructions: [],
      addressTableLookups: [],
    }),
  );

// Build a Solana mock that uses the wallet-type-agnostic chokepoint
const buildSolanaMock = (overrides: any = {}) => ({
  getToken: jest.fn((token) => {
    if (token === 'SOL' || token === mockSOL.address) return Promise.resolve(mockSOL);
    if (token === 'USDC' || token === mockUSDC.address) return Promise.resolve(mockUSDC);
    return Promise.resolve(null);
  }),
  estimateGasPrice: jest.fn().mockResolvedValue(2000),
  sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({
    signature: 'mock-signature',
    fee: 0.000005,
  }),
  connection: {
    getTransaction: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
  },
  getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
  extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
    balanceChanges: [-0.999, -149.85],
  }),
  ...overrides,
});

const buildRaydiumMock = (overrides: any = {}) => ({
  setOwner: jest.fn().mockResolvedValue(undefined),
  getAmmPoolInfo: jest.fn().mockResolvedValue(mockAmmPoolInfo),
  getPoolfromAPI: jest.fn().mockResolvedValue([mockPoolInfo, mockPoolKeys]),
  raydiumSDK: {
    liquidity: {
      addLiquidity: jest.fn().mockResolvedValue({ transaction: mockVersionedTransaction() }),
    },
    cpmm: {
      addLiquidity: jest.fn().mockResolvedValue({ transaction: mockVersionedTransaction() }),
    },
  },
  ...overrides,
});

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
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 149.85,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.35,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = buildRaydiumMock();
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
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

    // Owner is set to the wallet public key (wallet-type-agnostic), then sent via the chokepoint.
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();
    expect(mockSolanaInstance.sendAndConfirmTransactionForWallet).toHaveBeenCalledTimes(1);
    expect(mockSolanaInstance.sendAndConfirmTransactionForWallet.mock.calls[0][1]).toBe(mockWalletAddress);

    expect(body).toHaveProperty('signature', 'mock-signature');
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('fee');

    // The values, not just the keys. A deposit's wallet delta is negative — the mock
    // returns the live one, [-0.999, -149.85] — and `…Added` reports how much went in,
    // so these are the magnitudes. Asserting only that the keys exist accepted the
    // negatives that were reaching the event table.
    expect(body.data.baseTokenAmountAdded).toBeCloseTo(0.999, 9);
    expect(body.data.quoteTokenAmountAdded).toBeCloseTo(149.85, 9);
  });

  // Named for the defect: hummingbot-api stores data.baseTokenAmountAdded verbatim, so a
  // negative here becomes a negative ADD_LIQUIDITY row, and summing the event table nets
  // a round trip on this connector while double-counting it on every other one.
  it('reports a deposit as a positive amount whichever way the wallet moved', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 0.01,
      quoteTokenAmount: 0.848971,
      baseTokenAmountMax: 0.0101,
      quoteTokenAmountMax: 0.857,
      lpTokenAmount: 1,
    });

    (Solana.getInstance as jest.Mock).mockResolvedValue(
      buildSolanaMock({
        // The exact deltas of the live add in GW-17.
        extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [-0.01, -0.848971] }),
      }),
    );
    (Raydium.getInstance as jest.Mock).mockResolvedValue(buildRaydiumMock());

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 0.01,
        quoteTokenAmount: 0.848971,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.baseTokenAmountAdded).toBe(0.01);
    expect(body.data.quoteTokenAmountAdded).toBe(0.848971);
  });

  it('should handle base-limited liquidity addition', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = buildSolanaMock({
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [-1, -150] }),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = buildRaydiumMock();
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 200, // More than proportional
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();
  });

  it('should return an error when sending the transaction fails', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = buildSolanaMock({
      sendAndConfirmTransactionForWallet: jest.fn().mockRejectedValue(new Error('Send failed')),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = buildRaydiumMock();
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(500);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();
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

    const mockSolanaInstance = buildSolanaMock();
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockRaydiumInstance = buildRaydiumMock({
      getAmmPoolInfo: jest.fn().mockResolvedValue(null),
      getPoolfromAPI: jest.fn().mockResolvedValue(null),
    });
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWalletAddress,
        poolAddress: 'invalid-pool',
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();
  });

  it('should use default compute units', async () => {
    const { quoteLiquidity } = require('../../../../src/connectors/raydium/amm-routes/quoteLiquidity');
    quoteLiquidity.mockResolvedValue({
      baseLimited: true,
      baseTokenAmount: 1,
      quoteTokenAmount: 150,
      baseTokenAmountMax: 1.01,
      quoteTokenAmountMax: 151.5,
      lpTokenAmount: 12.24,
    });

    const mockSolanaInstance = buildSolanaMock({
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [-1, -150] }),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockAddLiquidityFunc = jest.fn().mockResolvedValue({ transaction: mockVersionedTransaction() });
    const mockRaydiumInstance = buildRaydiumMock({
      raydiumSDK: {
        liquidity: { addLiquidity: mockAddLiquidityFunc },
        cpmm: { addLiquidity: jest.fn() },
      },
    });
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
        walletAddress: mockWalletAddress,
        poolAddress: mockPoolAddress,
        baseTokenAmount: 1,
        quoteTokenAmount: 150,
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockRaydiumInstance.setOwner).toHaveBeenCalled();

    // Verify that addLiquidity was called with the default compute units (400000)
    const addLiquidityCall = mockAddLiquidityFunc.mock.calls[0];
    expect(addLiquidityCall[0].computeBudgetConfig.units).toBe(400000); // Using hardcoded COMPUTE_UNITS
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

    const mockSolanaInstance = buildSolanaMock({
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [-1, -150] }),
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    let setOwnerCallOrder = 0;
    let getAmmPoolInfoCallOrder = 0;
    let callCounter = 0;

    const mockRaydiumInstance = buildRaydiumMock({
      setOwner: jest.fn().mockImplementation(() => {
        setOwnerCallOrder = ++callCounter;
        return Promise.resolve(undefined);
      }),
      getAmmPoolInfo: jest.fn().mockImplementation(() => {
        getAmmPoolInfoCallOrder = ++callCounter;
        return Promise.resolve(mockAmmPoolInfo);
      }),
    });
    (Raydium.getInstance as jest.Mock).mockResolvedValue(mockRaydiumInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/add',
      body: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'raydium',
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
