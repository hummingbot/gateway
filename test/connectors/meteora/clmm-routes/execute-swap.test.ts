import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { executeSwapRoute } = await import('../../../../src/connectors/meteora/clmm-routes/executeSwap');
  await server.register(executeSwapRoute);
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

const mockPoolAddress = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq';

const mockWallet = {
  publicKey: new PublicKey('11111111111111111111111111111111'),
};

const mockSwapQuote = {
  protocolFee: 1000,
  amount: 100000000,
  minOut: 14700000,
  priceImpact: 0.01,
  fee: 250000,
};

const mockDlmmPool = {
  pubkey: new PublicKey(mockPoolAddress),
  tokenX: { publicKey: new PublicKey(mockSOL.address), reserve: 1000000000000 },
  tokenY: { publicKey: new PublicKey(mockUSDC.address), reserve: 150000000000 },
  activeBin: { id: 0, price: 150 },
  getBinArrayForSwap: jest.fn().mockResolvedValue([]),
  swapQuote: jest.fn().mockReturnValue(mockSwapQuote),
  swapQuoteExactOut: jest.fn().mockReturnValue(mockSwapQuote),
  swap: jest.fn().mockResolvedValue({}),
  swapExactOut: jest.fn().mockResolvedValue({}),
};

const mockTransaction = {
  signature: 'mocktxsignature123',
};

describe('POST /execute-swap', () => {
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

  it('should execute a CLMM swap for SELL side', async () => {
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getToken: jest
        .fn()
        .mockResolvedValueOnce(mockSOL)
        .mockResolvedValueOnce(mockUSDC)
        .mockResolvedValueOnce({ ...mockSOL }) // For balance extraction
        .mockResolvedValueOnce({ ...mockUSDC }), // For balance extraction
      findAssociatedTokenAddress: jest.fn().mockResolvedValue('mock-ata-address'),
      getTxData: jest.fn().mockResolvedValue({
        blockTime: Date.now() / 1000,
        meta: { fee: 5000 },
        transaction: {},
      }),
      sendAndConfirmTransaction: jest.fn().mockResolvedValue({
        signature: mockTransaction.signature,
        fee: 5000,
      }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [-0.1, 14.85],
        fee: 5000,
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    (Solana.getWalletAddressExample as jest.Mock).mockResolvedValue('11111111111111111111111111111111');

    const mockMeteoraInstance = {
      getDlmmPool: jest.fn().mockResolvedValue(mockDlmmPool),
      swapBase2Quote: jest.fn().mockResolvedValue({
        swapOutAmount: 14850000,
        swapInAmount: 100000000,
        quote: mockSwapQuote,
        transaction: mockTransaction,
        dlmmPool: mockDlmmPool,
      }),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet-beta',
        walletAddress: '11111111111111111111111111111111',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockTransaction.signature);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 0.1);
    expect(body.data).toHaveProperty('amountOut', 14.85);
    expect(body.data).toHaveProperty('fee', 5000); // Fee in lamports
    expect(body.data).toHaveProperty('baseTokenBalanceChange', -0.1);
    expect(body.data).toHaveProperty('quoteTokenBalanceChange', 14.85);
    expect(body.data).toHaveProperty('tokenIn', mockSOL.address);
    expect(body.data).toHaveProperty('tokenOut', mockUSDC.address);
    expect(body.data).toHaveProperty('activeBinId', 0);
  });

  it('should execute a CLMM swap for BUY side', async () => {
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getToken: jest
        .fn()
        .mockResolvedValueOnce(mockSOL)
        .mockResolvedValueOnce(mockUSDC)
        .mockResolvedValueOnce({ ...mockSOL }) // For balance extraction
        .mockResolvedValueOnce({ ...mockUSDC }), // For balance extraction
      findAssociatedTokenAddress: jest.fn().mockResolvedValue('mock-ata-address'),
      getTxData: jest.fn().mockResolvedValue({
        blockTime: Date.now() / 1000,
        meta: { fee: 5000 },
        transaction: {},
      }),
      sendAndConfirmTransaction: jest.fn().mockResolvedValue({
        signature: mockTransaction.signature,
        fee: 5000,
      }),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [0.1, -15],
        fee: 5000,
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockMeteoraInstance = {
      getDlmmPool: jest.fn().mockResolvedValue(mockDlmmPool),
      swapQuote2Base: jest.fn().mockResolvedValue({
        swapOutAmount: 100000000,
        swapInAmount: 15000000,
        quote: mockSwapQuote,
        transaction: mockTransaction,
        dlmmPool: mockDlmmPool,
      }),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet-beta',
        walletAddress: '11111111111111111111111111111111',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'BUY',
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('signature', mockTransaction.signature);
    expect(body).toHaveProperty('status', 1);
    expect(body.data).toHaveProperty('amountIn', 15);
    expect(body.data).toHaveProperty('amountOut', 0.1);
    expect(body.data).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body.data).toHaveProperty('tokenOut', mockSOL.address);
  });

  it('should return 400 if token not found', async () => {
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getToken: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockUSDC),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        network: 'mainnet-beta',
        walletAddress: '11111111111111111111111111111111',
        poolAddress: mockPoolAddress,
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(404); // Returns 404 for 'Token not found'
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});
