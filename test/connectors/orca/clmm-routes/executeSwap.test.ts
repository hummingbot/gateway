import { swapInstructions } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { Transaction } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';

import { Solana } from '../../../../src/chains/solana/solana';
import { executeSwap } from '../../../../src/connectors/orca/clmm-routes/executeSwap';
import { Orca } from '../../../../src/connectors/orca/orca';

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
      getWhirlpool: jest.fn().mockResolvedValue({ tokenMintA: SOL, tokenMintB: USDC }),
    });
    (fetchWhirlpool as jest.Mock).mockResolvedValue({ data: { tokenMintA: SOL, tokenMintB: USDC } });
    (fetchAllMint as jest.Mock).mockResolvedValue([{ data: { decimals: 9 } }, { data: { decimals: 6 } }]);
  });

  it('builds an exact-input SELL and delegates signing to the Solana layer', async () => {
    (swapInstructions as jest.Mock).mockResolvedValue({
      instructions: [{ programAddress: PROGRAM, accounts: [], data: new Uint8Array([1]) }],
      quote: { tokenIn: 1_000_000_000n, tokenEstOut: 63_900_000n, tokenMinOut: 63_000_000n },
    });

    const result = await executeSwap('mainnet-beta', WALLET, POOL, 'SOL', 'SELL', 1, 1);
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

    const result = await executeSwap('mainnet-beta', WALLET, POOL, 'SOL', 'BUY', 1, 1);
    expect(result.data.amountIn).toBe(64.1);
    expect(result.data.amountOut).toBe(1);
    expect((swapInstructions as jest.Mock).mock.calls[0][1]).toEqual({
      outputAmount: 1_000_000_000n,
      mint: SOL,
    });
  });
});
