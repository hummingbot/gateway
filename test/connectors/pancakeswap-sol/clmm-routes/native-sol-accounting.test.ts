import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { PancakeswapSol } from '../../../../src/connectors/pancakeswap-sol/pancakeswap-sol';
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

const solanaMock = (txData: any) => ({
  connection: { getAccountInfo: jest.fn().mockResolvedValue({ data: Buffer.alloc(200) }) },
  getToken: jest.fn((t: string) => Promise.resolve(t === SOL.address ? SOL : t === USDC.address ? USDC : null)),
  getWallet: jest.fn().mockResolvedValue({ publicKey: WALLET }),
  estimateGasPrice: jest.fn().mockResolvedValue(0.001),
  simulateWithErrorHandling: jest.fn().mockResolvedValue(undefined),
  throwIfLandedWithError: jest.fn().mockResolvedValue(undefined),
  sendAndConfirmRawTransaction: jest.fn().mockResolvedValue({ confirmed: true, signature: 'close-sig', txData }),
  extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [nativeChange, USDC_FROM_THE_POOL] }),
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
