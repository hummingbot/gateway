import { PublicKey } from '@solana/web3.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Meteora } from '../../../../src/connectors/meteora/meteora';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora');
jest.mock('../../../../src/services/pool-service', () => ({
  PoolService: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockResolvedValue({
        address: 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq',
      }),
    }),
  },
}));
jest.mock('../../../../src/chains/solana/solana.config', () => ({
  ...jest.requireActual('../../../../src/chains/solana/solana.config'),
  getSolanaChainConfig: jest.fn().mockReturnValue({
    defaultNetwork: 'mainnet-beta',
    defaultWallet: '11111111111111111111111111111111',
  }),
}));

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(require('@fastify/sensible'));
  const { makeExecuteSwapRoute } = await import('../../../../src/trading/pool-swap-routes');
  await server.register(makeExecuteSwapRoute('clmm'));
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

const mockTransaction = {
  signature: 'mocktxsignature123',
  sign: jest.fn(),
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
  swap: jest.fn().mockResolvedValue(mockTransaction),
  swapExactOut: jest.fn().mockResolvedValue(mockTransaction),
};

describe('POST /execute-swap', () => {
  let server: any;

  beforeAll(async () => {
    try {
      server = await buildApp();
    } catch (error) {
      console.error('Failed to build app:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute a CLMM swap for SELL side', async () => {
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      // Argument-based (the standardized wrapper derives the counter token, so getToken
      // is called more than twice — an ordered mock would resolve the wrong tokens).
      getToken: jest.fn((t: string) => {
        if (t === 'SOL' || t === mockSOL.address) return Promise.resolve(mockSOL);
        if (t === 'USDC' || t === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      findAssociatedTokenAddress: jest.fn().mockResolvedValue('mock-ata-address'),
      getTxData: jest.fn().mockResolvedValue({
        blockTime: Date.now() / 1000,
        meta: { fee: 5000 },
        transaction: {},
      }),
      sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({
        signature: mockTransaction.signature,
        fee: 0.000005,
      }),
      connection: {
        getTransaction: jest.fn().mockResolvedValue({
          meta: { fee: 5000 },
          blockTime: Date.now() / 1000,
        }),
      },
      getConfirmedTransactionData: jest.fn().mockResolvedValue({
        meta: { fee: 5000 },
        blockTime: Date.now() / 1000,
      }),
      simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
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
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
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
    expect(body.data).toHaveProperty('fee', 0.000005); // Fee in SOL
    expect(body.data).toHaveProperty('baseTokenBalanceChange', -0.1);
    expect(body.data).toHaveProperty('quoteTokenBalanceChange', 14.85);
    expect(body.data).toHaveProperty('tokenIn', mockSOL.address);
    expect(body.data).toHaveProperty('tokenOut', mockUSDC.address);
    // The applied slippage is echoed on the execute response.
    expect(body.data).toHaveProperty('slippagePct', 1);
  });

  it('fails loudly (400 TRANSACTION_FAILED) when the transaction landed on-chain but failed', async () => {
    const { transactionFailed } = jest.requireActual('../../../../src/services/error-handler');
    const extractBalanceChangesAndFee = jest.fn();
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getToken: jest.fn((t: string) => {
        if (t === 'SOL' || t === mockSOL.address) return Promise.resolve(mockSOL);
        if (t === 'USDC' || t === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({
        signature: mockTransaction.signature,
        fee: 0.000005,
      }),
      // The route-level re-fetch surfaces a landed-but-failed transaction as a throw —
      // it must never be reported as CONFIRMED (data exists) or PENDING.
      getConfirmedTransactionData: jest
        .fn()
        .mockRejectedValue(
          transactionFailed(`Transaction ${mockTransaction.signature} landed on-chain but failed: custom error 0x1771`),
        ),
      extractBalanceChangesAndFee,
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    (Meteora.getInstance as jest.Mock).mockResolvedValue({
      getDlmmPool: jest.fn().mockResolvedValue(mockDlmmPool),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: '11111111111111111111111111111111',
        poolAddress: mockPoolAddress,
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/landed on-chain but failed/);
    // The route must not have tried to build a CONFIRMED response.
    expect(extractBalanceChangesAndFee).not.toHaveBeenCalled();
  });

  it('should execute a CLMM swap for BUY side', async () => {
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getToken: jest.fn((t: string) => {
        if (t === 'SOL' || t === mockSOL.address) return Promise.resolve(mockSOL);
        if (t === 'USDC' || t === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null);
      }),
      findAssociatedTokenAddress: jest.fn().mockResolvedValue('mock-ata-address'),
      getTxData: jest.fn().mockResolvedValue({
        blockTime: Date.now() / 1000,
        meta: { fee: 5000 },
        transaction: {},
      }),
      sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({
        signature: mockTransaction.signature,
        fee: 0.000005,
      }),
      connection: {
        getTransaction: jest.fn().mockResolvedValue({
          meta: { fee: 5000 },
          blockTime: Date.now() / 1000,
        }),
      },
      getConfirmedTransactionData: jest.fn().mockResolvedValue({
        meta: { fee: 5000 },
        blockTime: Date.now() / 1000,
      }),
      simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [-15, 0.1], // For BUY: first is USDC (negative), second is SOL (positive)
        fee: 5000,
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);

    const mockMeteoraInstance = {
      getDlmmPool: jest.fn().mockResolvedValue(mockDlmmPool),
      swapQuote2Base: jest.fn().mockResolvedValue({
        swapOutAmount: 100000000, // 0.1 SOL
        swapInAmount: 15000000, // 15 USDC
        quote: {
          ...mockSwapQuote,
          amount: 15000000, // For BUY, amount is the input (USDC)
          minOut: 100000000, // For BUY, minOut is the output (SOL)
        },
        transaction: mockTransaction,
        dlmmPool: mockDlmmPool,
      }),
    };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
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
    expect(body.data).toHaveProperty('amountIn', 15); // USDC in
    expect(body.data).toHaveProperty('amountOut', 0.1); // SOL out
    expect(body.data).toHaveProperty('tokenIn', mockUSDC.address);
    expect(body.data).toHaveProperty('tokenOut', mockSOL.address);
    expect(body.data).toHaveProperty('baseTokenBalanceChange', 0.1); // SOL positive (receiving)
    expect(body.data).toHaveProperty('quoteTokenBalanceChange', -15); // USDC negative (spending)
  });

  it('should return 400 if the base token is not part of the pool', async () => {
    const mockSolanaInstance = {
      getWallet: jest.fn().mockResolvedValue(mockWallet),
      getToken: jest.fn((t: string) => {
        if (t === 'USDC' || t === mockUSDC.address) return Promise.resolve(mockUSDC);
        return Promise.resolve(null); // INVALID resolves to nothing
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolanaInstance);
    const mockMeteoraInstance = { getDlmmPool: jest.fn().mockResolvedValue(mockDlmmPool) };
    (Meteora.getInstance as jest.Mock).mockResolvedValue(mockMeteoraInstance);

    const response = await server.inject({
      method: 'POST',
      url: '/execute-swap',
      payload: {
        chainNetwork: 'solana-mainnet-beta',
        connector: 'meteora',
        walletAddress: '11111111111111111111111111111111',
        poolAddress: mockPoolAddress,
        baseToken: 'INVALID',
        quoteToken: 'USDC',
        amount: 0.1,
        side: 'SELL',
        slippagePct: 1,
      },
    });

    // Standardized wrapper derives the counter token from the pool; an unknown base token that
    // isn't one of the pool's tokens is a bad request (400).
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });
});

describe('fixSwapBitmapExtensionMeta (gateway#639)', () => {
  const DLMM_PROGRAM = new PublicKey('LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo');
  const LB_PAIR = new PublicKey('5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6');
  const EXTENSION = new PublicKey('DArpuuqJxNLRGQ8xq5ebZbobyjxSWWsPq8MqSZ2fUZLE');

  const dlmmIx = (bitmapKey: PublicKey) => ({
    programId: DLMM_PROGRAM,
    keys: [
      { pubkey: LB_PAIR, isSigner: false, isWritable: true },
      { pubkey: bitmapKey, isSigner: false, isWritable: false },
    ],
  });

  it('promotes a real bitmap-extension account to writable (SELL/swap2 path)', async () => {
    const { fixSwapBitmapExtensionMeta } = await import('../../../../src/connectors/meteora/clmm-routes/executeSwap');
    const tx = { instructions: [dlmmIx(EXTENSION)] } as any;

    fixSwapBitmapExtensionMeta(tx);

    expect(tx.instructions[0].keys[1].isWritable).toBe(true);
  });

  it('leaves the program-id "None" placeholder read-only', async () => {
    const { fixSwapBitmapExtensionMeta } = await import('../../../../src/connectors/meteora/clmm-routes/executeSwap');
    const tx = { instructions: [dlmmIx(DLMM_PROGRAM)] } as any;

    fixSwapBitmapExtensionMeta(tx);

    expect(tx.instructions[0].keys[1].isWritable).toBe(false);
  });

  it('ignores non-DLMM instructions (ATA create, wrap SOL)', async () => {
    const { fixSwapBitmapExtensionMeta } = await import('../../../../src/connectors/meteora/clmm-routes/executeSwap');
    const otherIx = {
      programId: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
      keys: [
        { pubkey: LB_PAIR, isSigner: false, isWritable: false },
        { pubkey: EXTENSION, isSigner: false, isWritable: false },
      ],
    };
    const tx = { instructions: [otherIx] } as any;

    fixSwapBitmapExtensionMeta(tx);

    expect(tx.instructions[0].keys[1].isWritable).toBe(false);
  });
});
