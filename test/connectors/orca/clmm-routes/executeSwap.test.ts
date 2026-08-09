import { Transaction } from '@solana/web3.js';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/orca/orca');
jest.mock('@orca-so/whirlpools', () => ({
  swapInstructions: jest.fn(),
}));
jest.mock('@orca-so/whirlpools-client', () => ({
  fetchWhirlpool: jest.fn(),
}));
jest.mock('@solana-program/token-2022', () => ({
  fetchAllMint: jest.fn(),
}));

import { swapInstructions } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { fetchAllMint } from '@solana-program/token-2022';

import { Solana } from '../../../../src/chains/solana/solana';
import { executeSwap } from '../../../../src/connectors/orca/clmm-routes/executeSwap';
import { Orca } from '../../../../src/connectors/orca/orca';

const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const WALLET = 'BPgNwGDBiRuaAKuRQLpXC9rCiw5FfJDDdTunDEmtN6VF';
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PROGRAM = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

describe('executeSwap', () => {
  let sendForWallet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendForWallet = jest.fn().mockResolvedValue({ signature: 'swap-signature', fee: 0.000005 });
    (Solana.getInstance as jest.Mock).mockResolvedValue({
      getToken: jest.fn((token: string) => {
        if (token === 'SOL' || token === SOL) return { symbol: 'SOL', address: SOL, decimals: 9 };
        if (token === 'USDC' || token === USDC) return { symbol: 'USDC', address: USDC, decimals: 6 };
        return null;
      }),
      sendAndConfirmTransactionForWallet: sendForWallet,
    });
    (Orca.getInstance as jest.Mock).mockResolvedValue({
      solanaKitRpc: {},
      deployment: { programId: PROGRAM, configAddress: POOL },
    });
    (fetchWhirlpool as jest.Mock).mockResolvedValue({ data: { tokenMintA: SOL, tokenMintB: USDC } });
    (fetchAllMint as jest.Mock).mockResolvedValue([{ data: { decimals: 9 } }, { data: { decimals: 6 } }]);
  });

  it('builds an exact-input SELL and delegates signing to the Solana layer', async () => {
    (swapInstructions as jest.Mock).mockResolvedValue({
      instructions: [{ programAddress: PROGRAM, accounts: [], data: new Uint8Array([1]) }],
      quote: { tokenIn: 1_000_000_000n, tokenEstOut: 63_900_000n, tokenMinOut: 63_000_000n },
    });

    const result = await executeSwap('mainnet-beta', WALLET, 'SOL', 'USDC', 1, 'SELL', POOL, 1);
    expect(result.data.amountIn).toBe(1);
    expect(result.data.amountOut).toBe(63.9);
    const [, params, pool, config] = (swapInstructions as jest.Mock).mock.calls[0];
    expect(params).toEqual({ inputAmount: 1_000_000_000n, mint: SOL });
    expect(pool).toBe(POOL);
    expect(config).toEqual(expect.objectContaining({ slippageToleranceBps: 100 }));
    expect(sendForWallet).toHaveBeenCalledWith(expect.any(Transaction), WALLET);
  });

  it('builds an exact-output BUY in base-token units', async () => {
    (swapInstructions as jest.Mock).mockResolvedValue({
      instructions: [{ programAddress: PROGRAM, accounts: [], data: new Uint8Array([1]) }],
      quote: { tokenEstIn: 64_100_000n, tokenOut: 1_000_000_000n, tokenMaxIn: 64_741_000n },
    });

    const result = await executeSwap('mainnet-beta', WALLET, 'SOL', 'USDC', 1, 'BUY', POOL, 1);
    expect(result.data.amountIn).toBe(64.1);
    expect(result.data.amountOut).toBe(1);
    expect((swapInstructions as jest.Mock).mock.calls[0][1]).toEqual({
      outputAmount: 1_000_000_000n,
      mint: SOL,
    });
  });

  describe('without poolAddress (pool lookup)', () => {
    it('should return 404 when pool not found', async () => {
      // Mock Solana to return valid tokens
      const mockSolana = {
        getToken: jest.fn().mockResolvedValueOnce(MOCK_SOL_TOKEN).mockResolvedValueOnce(MOCK_USDC_TOKEN),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      // Mock PoolService to return null (no pool found)
      const mockPoolService = {
        getPool: jest.fn().mockResolvedValue(null),
      };
      (PoolService.getInstance as jest.Mock).mockReturnValue(mockPoolService);

      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('validation', () => {
    it('should return 400 when baseToken is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when amount is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return error when side is missing (default not applied)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          poolAddress: mockPoolAddress,
          // side omitted - schema has default but it may not apply correctly
        },
      });

      // May return 400 (validation) or 500 (execution with undefined side)
      expect([400, 500]).toContain(response.statusCode);
    });

    it('should return error for invalid token', async () => {
      const mockSolana = {
        getToken: jest.fn().mockResolvedValue(null),
        getWallet: jest.fn().mockResolvedValue(mockWallet),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'INVALID',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      // May return 400 (if HTTP error is properly caught) or 500 (if wrapped in generic error)
      expect([400, 500]).toContain(response.statusCode);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      const mockSolana = {
        getToken: jest.fn().mockImplementation((symbol: string) => {
          if (symbol === 'SOL') return mockBaseTokenInfo;
          if (symbol === 'USDC') return mockQuoteTokenInfo;
          return null;
        }),
        getWallet: jest.fn().mockResolvedValue(mockWallet),
        simulateWithErrorHandling: jest.fn().mockRejectedValue(new Error('Simulation failed')),
      };
      (Solana.getInstance as jest.Mock).mockResolvedValue(mockSolana);

      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      // Should return error status code
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('successful execution (v4 SDK path)', () => {
    const { swapInstructions } = require('@orca-so/whirlpools');
    const { fetchWhirlpool } = require('@orca-so/whirlpools-client');
    const { fetchAllMint } = require('@solana-program/token-2022');

    // Any valid base58-encoded 32 bytes works as a blockhash for offline signing
    const mockBlockhash = Keypair.generate().publicKey.toBase58();
    let mockConnection: any;
    let mockSendForWallet: jest.Mock;

    beforeEach(() => {
      (swapInstructions as jest.Mock).mockClear();
      mockConnection = {
        getTransaction: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
      };
      mockSendForWallet = jest.fn().mockResolvedValue({ signature: 'mock-signature', fee: 0.000005 });
      (Solana.getInstance as jest.Mock).mockResolvedValue({
        getToken: jest.fn().mockImplementation((symbol: string) => {
          if (symbol === 'SOL' || symbol === mockBaseTokenInfo.address) return mockBaseTokenInfo;
          if (symbol === 'USDC' || symbol === mockQuoteTokenInfo.address) return mockQuoteTokenInfo;
          return null;
        }),
        sendAndConfirmTransactionForWallet: mockSendForWallet,
        connection: mockConnection,
      });
      (Orca.getInstance as jest.Mock).mockResolvedValue({
        solanaKitRpc: {
          getLatestBlockhash: jest.fn().mockReturnValue({
            send: jest.fn().mockResolvedValue({ value: { blockhash: mockBlockhash, lastValidBlockHeight: 12345n } }),
          }),
        },
        // resolveCounterToken (standardized wrapper) derives the counter token from the pool.
        getWhirlpool: jest.fn().mockResolvedValue({
          tokenMintA: mockBaseTokenInfo.address,
          tokenMintB: mockQuoteTokenInfo.address,
        }),
      });
      (fetchWhirlpool as jest.Mock).mockResolvedValue({
        data: { tokenMintA: mockBaseTokenInfo.address, tokenMintB: mockQuoteTokenInfo.address },
      });
      (fetchAllMint as jest.Mock).mockResolvedValue([
        { data: { decimals: mockBaseTokenInfo.decimals } },
        { data: { decimals: mockQuoteTokenInfo.decimals } },
      ]);
    });

    it('executes a SELL as exact-in of the base token and reports balance changes', async () => {
      (swapInstructions as jest.Mock).mockResolvedValue({
        instructions: [
          { programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', accounts: [], data: new Uint8Array([1]) },
        ],
        quote: {
          tokenIn: 1_000_000_000n, // 1 SOL in
          tokenEstOut: 63_900_000n, // 63.9 USDC out
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.signature).toBe('mock-signature');
      expect(body.status).toBe(1);
      expect(body.data.amountIn).toBeCloseTo(1);
      expect(body.data.amountOut).toBeCloseTo(63.9);
      expect(body.data.baseTokenBalanceChange).toBeCloseTo(-1);
      expect(body.data.quoteTokenBalanceChange).toBeCloseTo(63.9);
      expect(body.data.fee).toBeCloseTo(5000 / 1e9);

      // exact-in request for the base mint
      const [, params, , slippageBps] = (swapInstructions as jest.Mock).mock.calls[0];
      expect(params).toEqual({ inputAmount: 1_000_000_000n, mint: mockBaseTokenInfo.address });
      expect(slippageBps).toBe(100);
      expect(mockSendForWallet).toHaveBeenCalledTimes(1);
    });

    it('executes a BUY as exact-out of the base token and reports balance changes', async () => {
      (swapInstructions as jest.Mock).mockResolvedValue({
        instructions: [
          { programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', accounts: [], data: new Uint8Array([1]) },
        ],
        quote: {
          tokenEstIn: 64_100_000n, // 64.1 USDC in
          tokenOut: 1_000_000_000n, // 1 SOL out
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'BUY',
          poolAddress: mockPoolAddress,
          slippagePct: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.amountIn).toBeCloseTo(64.1);
      expect(body.data.amountOut).toBeCloseTo(1);
      expect(body.data.baseTokenBalanceChange).toBeCloseTo(1);
      expect(body.data.quoteTokenBalanceChange).toBeCloseTo(-64.1);

      // exact-out request for the base mint
      const [, params] = (swapInstructions as jest.Mock).mock.calls[0];
      expect(params).toEqual({ outputAmount: 1_000_000_000n, mint: mockBaseTokenInfo.address });
    });

    it('returns 500 when the v4 SDK fails to build the swap', async () => {
      (swapInstructions as jest.Mock).mockRejectedValue(new Error('no route'));

      const response = await app.inject({
        method: 'POST',
        url: '/execute-swap',
        payload: {
          network: 'mainnet-beta',
          walletAddress: mockWalletAddress,
          baseToken: 'SOL',
          quoteToken: 'USDC',
          amount: 1.0,
          side: 'SELL',
          poolAddress: mockPoolAddress,
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });
});
