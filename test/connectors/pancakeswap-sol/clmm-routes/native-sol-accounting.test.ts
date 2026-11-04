import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import {
  PANCAKESWAP_CLMM_PROGRAM_ID,
  PancakeswapSol,
} from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
import { buildDecreaseLiquidityV2Instruction } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions';
import {
  buildTransactionWithInstructions,
  buildRemoveLiquidityTransaction,
} from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions';

jest.mock('../../../../src/chains/solana/solana');
// Only the instance is mocked: this module also exports the program id the routes derive
// PDAs from, and an auto-mock turns that into undefined.
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol', () => ({
  ...jest.requireActual('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol'),
  PancakeswapSol: { getInstance: jest.fn() },
}));
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions', () => ({
  ...jest.requireActual('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.instructions'),
  buildDecreaseLiquidityV2Instruction: jest.fn().mockResolvedValue({ ix: 'decrease' }),
  buildClosePositionInstruction: jest.fn().mockResolvedValue({ ix: 'close' }),
}));
// buildUnwrapSolInstructions stays real — it is the fix under test. Only the transaction
// assembly around it is stubbed, so the assertions below are about what really gets built.
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions', () => ({
  ...jest.requireActual('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions'),
  buildTransactionWithInstructions: jest.fn().mockResolvedValue({ sign: jest.fn() }),
  buildRemoveLiquidityTransaction: jest.fn().mockResolvedValue({ sign: jest.fn() }),
}));
jest.mock('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser', () => ({
  ...jest.requireActual('../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser'),
  parsePositionData: jest.fn().mockReturnValue({
    poolId: { toString: () => 'pool' },
    tickLowerIndex: -100,
    tickUpperIndex: 100,
    liquidity: new BN(1000),
  }),
}));

const WALLET = 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD';
const POSITION = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq';
const SOL = { symbol: 'SOL', address: NATIVE_MINT.toBase58(), decimals: 9 };
const USDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

// Cy8wiJaS… — the close of the first pancakeswap-sol position ever opened through this
// stack — with the unwrap this file is about applied to it. Lamports as the chain
// reported them, with the WSOL account now closing instead of being left behind.
const NFT_ACCOUNT_RENT = 2_074_080;
const TICK_ARRAY_RENT = 2_846_640;
const POSITION_RENT = 4_231_680;
const WSOL_ACCOUNT_RENT = 2_039_280;
const WSOL_HELD_BEFORE = 719; // dust the wallet already had wrapped
const SOL_FROM_THE_POOL = 8_373_812; // what decrease_liquidity_v2 actually paid out
const USDC_FROM_THE_POOL = 1.033991;
const TX_FEE = 85_000;

const RENT_REFUNDED = NFT_ACCOUNT_RENT + TICK_ARRAY_RENT + POSITION_RENT + WSOL_ACCOUNT_RENT;

const closeTxData = {
  meta: {
    fee: TX_FEE,
    preBalances: [
      2_549_410_306, // the wallet
      NFT_ACCOUNT_RENT,
      TICK_ARRAY_RENT,
      POSITION_RENT,
      WSOL_ACCOUNT_RENT + WSOL_HELD_BEFORE,
    ],
    postBalances: [2_549_410_306 + RENT_REFUNDED + WSOL_HELD_BEFORE + SOL_FROM_THE_POOL - TX_FEE, 0, 0, 0, 0],
    preTokenBalances: [
      { accountIndex: 1, mint: POSITION, uiTokenAmount: { amount: '1' } },
      { accountIndex: 4, mint: NATIVE_MINT.toBase58(), uiTokenAmount: { amount: String(WSOL_HELD_BEFORE) } },
    ],
    postTokenBalances: [],
  },
};

// What extractBalanceChangesAndFee reports for that transaction: the native delta with
// the fee added back, which is rent + dust + the withdrawal all in one number.
const nativeChange = (RENT_REFUNDED + WSOL_HELD_BEFORE + SOL_FROM_THE_POOL) / 1e9;

// A parsed transaction whose two program instructions are, in order, the fee collect
// and the principal decrease. Position is the whole signal: this program moves fees and
// principal through the same instruction unless they are asked for separately, which is
// why the close now sends a zero-liquidity decrease first.
const parsedCloseTx = (feeBase: number, feeQuote: number, principalBase: number, principalQuote: number) => ({
  transaction: {
    message: {
      accountKeys: [{ pubkey: 'user-wsol' }, { pubkey: 'user-usdc' }],
      instructions: [
        { programId: PANCAKESWAP_CLMM_PROGRAM_ID },
        { programId: PANCAKESWAP_CLMM_PROGRAM_ID },
        { programId: { toString: () => 'ComputeBudget111111111111111111111111111111' } },
      ],
    },
  },
  meta: {
    preTokenBalances: [
      { accountIndex: 0, mint: SOL.address, uiTokenAmount: { decimals: 9 } },
      { accountIndex: 1, mint: USDC.address, uiTokenAmount: { decimals: 6 } },
    ],
    postTokenBalances: [],
    innerInstructions: [
      {
        index: 0,
        instructions: [
          {
            parsed: {
              type: 'transfer',
              info: { amount: String(Math.round(feeBase * 1e9)), source: 'vault', destination: 'user-wsol' },
            },
          },
          {
            parsed: {
              type: 'transfer',
              info: { amount: String(Math.round(feeQuote * 1e6)), source: 'vault', destination: 'user-usdc' },
            },
          },
        ],
      },
      {
        index: 1,
        instructions: [
          {
            parsed: {
              type: 'transfer',
              info: { amount: String(Math.round(principalBase * 1e9)), source: 'vault', destination: 'user-wsol' },
            },
          },
          {
            parsed: {
              type: 'transfer',
              info: { amount: String(Math.round(principalQuote * 1e6)), source: 'vault', destination: 'user-usdc' },
            },
          },
        ],
      },
    ],
  },
});

const solanaMock = (txData: any, parsedTx: any = { meta: {} }) => ({
  connection: { getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.alloc(200) }) },
  getToken: jest.fn((t: string) => Promise.resolve(t === SOL.address ? SOL : t === USDC.address ? USDC : null)),
  getWallet: jest.fn().mockResolvedValue({ publicKey: WALLET }),
  estimateGasPrice: jest.fn().mockResolvedValue(0.001),
  simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
  throwIfLandedWithError: jest.fn().mockResolvedValue(undefined),
  sendAndConfirmRawTransaction: jest.fn().mockResolvedValue({ confirmed: true, signature: 'close-sig', txData }),
  extractBalanceChangesAndFee: jest
    .fn()
    .mockResolvedValue({ balanceChanges: [nativeChange, USDC_FROM_THE_POOL], txDetails: parsedTx }),
  // The real instruction, stubbed to something identifiable.
  unwrapSOL: jest.fn().mockReturnValue({ ix: 'closeWsolAccount' }),
});

beforeEach(() => {
  jest.clearAllMocks();
  (buildTransactionWithInstructions as jest.Mock).mockResolvedValue({ sign: jest.fn() });
  (buildRemoveLiquidityTransaction as jest.Mock).mockResolvedValue({ sign: jest.fn() });
  (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue({
    getPositionInfo: jest.fn().mockResolvedValue({
      baseTokenAddress: SOL.address,
      quoteTokenAddress: USDC.address,
      poolAddress: 'pool',
    }),
  });
});

describe('pancakeswap-sol close: the withdrawal reaches the native balance', () => {
  it('unwraps the WSOL the program paid out', async () => {
    const solana = solanaMock(closeTxData);
    (Solana.getInstance as jest.Mock).mockResolvedValue(solana);
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    await closePosition('mainnet-beta', WALLET, POSITION);

    // The close instruction for the wrapped-SOL account has to be last: it can only
    // return what the decrease already put there.
    const instructions = (buildTransactionWithInstructions as jest.Mock).mock.calls[0][2];
    expect(instructions[instructions.length - 1]).toEqual({ ix: 'closeWsolAccount' });
    expect(solana.unwrapSOL).toHaveBeenCalled();
  });

  it('leaves a pool with no native side alone', async () => {
    const solana = solanaMock(closeTxData);
    (Solana.getInstance as jest.Mock).mockResolvedValue(solana);
    (PancakeswapSol.getInstance as jest.Mock).mockResolvedValue({
      getPositionInfo: jest.fn().mockResolvedValue({
        baseTokenAddress: USDC.address,
        quoteTokenAddress: USDC.address,
        poolAddress: 'pool',
      }),
    });
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    await closePosition('mainnet-beta', WALLET, POSITION);

    expect(solana.unwrapSOL).not.toHaveBeenCalled();
  });

  it('reports the SOL the pool paid out, not the rent that came back', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    // What the live close reported here was 0.0091524 — the rent, to the lamport, with
    // the actual withdrawal appearing in no field at all.
    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);
    expect(result.data?.baseTokenAmountRemoved).not.toBeCloseTo(RENT_REFUNDED / 1e9, 9);
  });

  it('reports the rent the closed accounts refunded', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    // Was a hardcoded 0 while 0.0111917 SOL came back.
    expect(result.data?.positionRentRefunded).toBeCloseTo(RENT_REFUNDED / 1e9, 9);
  });

  it('leaves the non-native side untouched', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    // USDC neither wraps nor carries rent; it was the one number the close got right.
    expect(result.data?.quoteTokenAmountRemoved).toBeCloseTo(USDC_FROM_THE_POOL, 9);
  });
});

describe('pancakeswap-sol removeLiquidity and collectFees', () => {
  it('asks the builder to unwrap the pool mints it withdrew', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { removeLiquidity } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/removeLiquidity');

    await removeLiquidity('mainnet-beta', WALLET, POSITION, 50);

    const poolMints = (buildRemoveLiquidityTransaction as jest.Mock).mock.calls[0][6];
    expect(poolMints).toEqual([SOL.address, USDC.address]);
  });

  it('does not report the reclaimed account rent as liquidity removed', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { removeLiquidity } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/removeLiquidity');

    const result = await removeLiquidity('mainnet-beta', WALLET, POSITION, 100);

    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);
  });

  it('does not report the reclaimed account rent as fee income', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { collectFees } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/collectFees');

    const result = await collectFees('mainnet-beta', WALLET, POSITION);

    // Rent arriving in the same native change as a fee would be booked as fee income,
    // which compounds: hummingbot-api sums these across a position's lifetime.
    expect(result.data?.baseFeeAmountCollected).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);
  });
});

describe('pancakeswap-sol close: fees and principal are separate money', () => {
  // The live close reported `baseFeeAmountCollected: 0` next to a principal that
  // contained the fees, because one decrease_liquidity_v2 transfers both. hummingbot-api
  // stores the two in different columns, so fee income on this connector was recorded as
  // zero forever and returned capital read high.
  const FEE_BASE = 0.000123;
  const FEE_QUOTE = 0.45;

  it('collects the fees in an instruction of their own, before removing liquidity', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    await closePosition('mainnet-beta', WALLET, POSITION);

    const decreaseCalls = (buildDecreaseLiquidityV2Instruction as jest.Mock).mock.calls;
    expect(decreaseCalls).toHaveLength(2);
    // First: liquidity 0, which collects fees and touches nothing else.
    expect(decreaseCalls[0][3].isZero()).toBe(true);
    // Then the principal.
    expect(decreaseCalls[1][3].isZero()).toBe(false);
  });

  it('reports what the fee instruction actually paid out', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(
      solanaMock(closeTxData, parsedCloseTx(FEE_BASE, FEE_QUOTE, SOL_FROM_THE_POOL / 1e9, USDC_FROM_THE_POOL)),
    );
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    expect(result.data?.baseFeeAmountCollected).toBeCloseTo(FEE_BASE, 9);
    expect(result.data?.quoteFeeAmountCollected).toBeCloseTo(FEE_QUOTE, 9);
  });

  it('keeps the fees out of the principal', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(
      solanaMock(closeTxData, parsedCloseTx(FEE_BASE, FEE_QUOTE, SOL_FROM_THE_POOL / 1e9, USDC_FROM_THE_POOL)),
    );
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    // The balance change carried both; the principal is what is left after the fees.
    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9 - FEE_BASE, 9);
    expect(result.data?.quoteTokenAmountRemoved).toBeCloseTo(USDC_FROM_THE_POOL - FEE_QUOTE, 9);
  });

  it('leaves the amounts whole when the transaction cannot be read', async () => {
    // No parsed inner instructions: report the total under principal and zero fees,
    // which is exactly what this route did before. A known shape beats a new silence.
    (Solana.getInstance as jest.Mock).mockResolvedValue(solanaMock(closeTxData));
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    expect(result.data?.baseFeeAmountCollected).toBe(0);
    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);
  });
});

describe('pancakeswap-sol missing WSOL ATA handling (#740)', () => {
  it('creates missing recipient ATAs idempotently before DecreaseLiquidityV2 in buildRemoveLiquidityTransaction', async () => {
    const { PublicKey, TransactionInstruction } = await import('@solana/web3.js');
    const { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import(
      '@solana/spl-token'
    );
    const actualTransactions = jest.requireActual(
      '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.transactions',
    );

    const walletPubkey = new PublicKey(WALLET);
    const positionMint = new PublicKey(POSITION);
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, walletPubkey, false, TOKEN_PROGRAM_ID);

    const decreaseIx = new TransactionInstruction({
      programId: PANCAKESWAP_CLMM_PROGRAM_ID,
      keys: [],
      data: Buffer.from([1]),
    });
    const unwrapIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [],
      data: Buffer.from([9]),
    });
    (buildDecreaseLiquidityV2Instruction as jest.Mock).mockResolvedValueOnce(decreaseIx);

    const solana: any = {
      connection: {
        getAccountInfo: jest.fn((pubkey: any) => {
          // Simulate wallet having no WSOL ATA while USDC ATA already exists
          if (pubkey.equals(wsolAta)) return Promise.resolve(null);
          return Promise.resolve({ data: Buffer.alloc(200), owner: TOKEN_PROGRAM_ID });
        }),
        getLatestBlockhash: jest.fn().mockResolvedValue({
          blockhash: '11111111111111111111111111111111',
        }),
      },
      unwrapSOL: jest.fn().mockReturnValue(unwrapIx),
    };

    const ataIxs = await actualTransactions.buildEnsureTokenAccountInstructions(solana, walletPubkey, [
      SOL.address,
      USDC.address,
    ]);
    expect(ataIxs).toHaveLength(1);
    expect(ataIxs[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(ataIxs[0].keys[1].pubkey.equals(wsolAta)).toBe(true);
    // CreateIdempotent instruction discriminator is 1 (0x01)
    expect(ataIxs[0].data).toEqual(Buffer.from([1]));

    const tx = await actualTransactions.buildRemoveLiquidityTransaction(
      solana,
      positionMint,
      walletPubkey,
      new BN(500),
      new BN(0),
      new BN(0),
      [SOL.address, USDC.address],
    );
    expect(tx).toBeDefined();
    expect(solana.unwrapSOL).toHaveBeenCalledWith(walletPubkey);

    // Verify instruction ordering in compiled transaction: ATA creation -> DecreaseLiquidityV2 -> unwrapSOL
    const programIds = tx.message.compiledInstructions.map((ix: any) =>
      tx.message.staticAccountKeys[ix.programIdIndex].toBase58(),
    );
    const ataIxIndex = programIds.indexOf(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
    const decreaseIxIndex = programIds.indexOf(PANCAKESWAP_CLMM_PROGRAM_ID.toBase58());
    const unwrapIxIndex = programIds.indexOf(TOKEN_PROGRAM_ID.toBase58());

    expect(ataIxIndex).toBeGreaterThanOrEqual(0);
    expect(decreaseIxIndex).toBeGreaterThan(ataIxIndex);
    expect(unwrapIxIndex).toBeGreaterThan(decreaseIxIndex);
  });

  it('creates missing WSOL ATA before decreasing liquidity and unwraps at the end when closing a non-empty position', async () => {
    const { PublicKey } = await import('@solana/web3.js');
    const { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import(
      '@solana/spl-token'
    );
    const walletPubkey = new PublicKey(WALLET);
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, walletPubkey, false, TOKEN_PROGRAM_ID);

    const solana = solanaMock(closeTxData);
    solana.connection.getAccountInfo = jest.fn((pubkey: any) => {
      if (pubkey.equals && pubkey.equals(wsolAta)) return Promise.resolve(null);
      return Promise.resolve({ data: Buffer.alloc(200) });
    });
    (Solana.getInstance as jest.Mock).mockResolvedValue(solana);

    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');
    await closePosition('mainnet-beta', WALLET, POSITION);

    const instructions = (buildTransactionWithInstructions as jest.Mock).mock.calls[0][2];
    // 1: create WSOL ATA (idempotent), 2: collect fees decrease, 3: principal decrease, 4: closePosition, 5: unwrapSOL
    expect(instructions).toHaveLength(5);
    expect(instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(instructions[0].keys[1].pubkey.equals(wsolAta)).toBe(true);
    expect(instructions[0].data).toEqual(Buffer.from([1]));
    expect(instructions[instructions.length - 1]).toEqual({ ix: 'closeWsolAccount' });
  });

  it('does not append unwrapSOL when closing an already-empty position (liquidity = 0)', async () => {
    const { parsePositionData } = await import(
      '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol.parser'
    );
    (parsePositionData as jest.Mock).mockReturnValueOnce({
      poolId: { toString: () => 'pool' },
      tickLowerIndex: -100,
      tickUpperIndex: 100,
      liquidity: new BN(0),
    });

    const solana = solanaMock(closeTxData);
    (Solana.getInstance as jest.Mock).mockResolvedValue(solana);

    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');
    await closePosition('mainnet-beta', WALLET, POSITION);

    const instructions = (buildTransactionWithInstructions as jest.Mock).mock.calls[0][2];
    expect(instructions).toEqual([{ ix: 'close' }]);
    expect(solana.unwrapSOL).not.toHaveBeenCalled();
    expect(buildDecreaseLiquidityV2Instruction).not.toHaveBeenCalled();
  });

  it('adds back SOL spent on newly opened non-SOL ATAs when reporting SOL withdrawals and fees', async () => {
    const NEW_ATA_RENT = 2_039_280;
    const txWithOpenedAta = {
      meta: {
        fee: TX_FEE,
        preBalances: [
          2_549_410_306, // wallet
          0, // newly created non-SOL ATA (e.g. USDC ATA)
        ],
        postBalances: [
          2_549_410_306 + SOL_FROM_THE_POOL - NEW_ATA_RENT - TX_FEE,
          NEW_ATA_RENT,
        ],
        preTokenBalances: [],
        postTokenBalances: [
          { accountIndex: 1, mint: USDC.address, uiTokenAmount: { amount: '1033991' } },
        ],
      },
    };
    const netNativeChangeWithAtaRent = (SOL_FROM_THE_POOL - NEW_ATA_RENT) / 1e9;
    const mock = {
      ...solanaMock(txWithOpenedAta),
      extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
        balanceChanges: [netNativeChangeWithAtaRent, USDC_FROM_THE_POOL],
        txDetails: { meta: {} },
      }),
    };
    (Solana.getInstance as jest.Mock).mockResolvedValue(mock);

    const { removeLiquidity } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/removeLiquidity');
    const { collectFees } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/collectFees');
    const { closePosition } = await import('../../../../src/connectors/pancakeswap-sol/clmm-routes/closePosition');

    const removeRes = await removeLiquidity('mainnet-beta', WALLET, POSITION, 100);
    expect(removeRes.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);

    const feeRes = await collectFees('mainnet-beta', WALLET, POSITION);
    expect(feeRes.data?.baseFeeAmountCollected).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);

    const closeRes = await closePosition('mainnet-beta', WALLET, POSITION);
    expect(closeRes.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);
  });
});
