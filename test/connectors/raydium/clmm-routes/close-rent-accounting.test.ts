import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { Raydium } from '../../../../src/connectors/raydium/raydium';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');

// A 100% removal closes the position account and its NFT account in the same transaction,
// so their rent lands in the same native balance change as the withdrawal. Reporting the
// raw change called that rent liquidity — the defect GW-31 found on Meteora, present here
// too because the arithmetic was the same.

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POSITION = 'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq';
const SOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const USDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };

const POSITION_RENT = 2_231_280;
const NFT_ACCOUNT_RENT = 2_039_280;
const RENT = POSITION_RENT + NFT_ACCOUNT_RENT;
const SOL_FROM_THE_POOL = 50_000_000; // 0.05 SOL
const USDC_FROM_THE_POOL = 8.5;
const TX_FEE = 10_000;

const closeTxData = {
  meta: {
    fee: TX_FEE,
    preBalances: [1_000_000_000, POSITION_RENT, NFT_ACCOUNT_RENT],
    postBalances: [1_000_000_000 + RENT + SOL_FROM_THE_POOL - TX_FEE, 0, 0],
    preTokenBalances: [{ accountIndex: 2, mint: POSITION, uiTokenAmount: { amount: '1' } }],
    postTokenBalances: [],
  },
};

// Rent + withdrawal in one number, which is what the chain reports and what the route
// has to take apart.
const nativeChange = (RENT + SOL_FROM_THE_POOL) / 1e9;

const setup = () => {
  (Raydium.getInstance as jest.Mock).mockResolvedValue({
    setOwner: jest.fn(),
    getClmmPosition: jest.fn().mockResolvedValue({
      poolId: { toBase58: () => 'pool' },
      liquidity: new BN(1000),
    }),
    getClmmPoolfromAPI: jest
      .fn()
      .mockResolvedValue([
        { mintA: { address: SOL.address, symbol: 'SOL' }, mintB: { address: USDC.address, symbol: 'USDC' } },
        {},
      ]),
    raydiumSDK: { clmm: { decreaseLiquidity: jest.fn().mockResolvedValue({ transaction: {} }) } },
  });

  const solana = {
    estimateGasPrice: jest.fn().mockResolvedValue(0.001),
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'close-sig' }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue(closeTxData),
    getToken: jest.fn((t: string) => Promise.resolve(t === SOL.address ? SOL : USDC)),
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges: [nativeChange, USDC_FROM_THE_POOL] }),
  };
  (Solana.getInstance as jest.Mock).mockResolvedValue(solana);
  return solana;
};

describe('raydium CLMM removeLiquidity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports the withdrawal, not the rent that came back with it', async () => {
    setup();
    const { removeLiquidity } = await import('../../../../src/connectors/raydium/clmm-routes/removeLiquidity');

    const result = await removeLiquidity('mainnet-beta', WALLET, POSITION, 100, true);

    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(SOL_FROM_THE_POOL / 1e9, 9);
    expect(result.data?.baseTokenAmountRemoved).not.toBeCloseTo(nativeChange, 9);
  });

  it('leaves the non-native side alone, which carries no rent', async () => {
    setup();
    const { removeLiquidity } = await import('../../../../src/connectors/raydium/clmm-routes/removeLiquidity');

    const result = await removeLiquidity('mainnet-beta', WALLET, POSITION, 100, true);

    expect(result.data?.quoteTokenAmountRemoved).toBeCloseTo(USDC_FROM_THE_POOL, 9);
  });

  it('changes nothing for a partial removal, which closes no account', async () => {
    setup();
    const noAccountsClosed = {
      meta: { fee: TX_FEE, preBalances: [1_000_000_000], postBalances: [1_050_000_000], preTokenBalances: [] },
    };
    const solana = await (Solana.getInstance as jest.Mock)('mainnet-beta');
    solana.getConfirmedTransactionData.mockResolvedValue(noAccountsClosed);
    solana.extractBalanceChangesAndFee.mockResolvedValue({ balanceChanges: [0.05, USDC_FROM_THE_POOL] });

    const { removeLiquidity } = await import('../../../../src/connectors/raydium/clmm-routes/removeLiquidity');
    const result = await removeLiquidity('mainnet-beta', WALLET, POSITION, 50);

    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(0.05, 9);
  });
});

describe('raydium CLMM closePosition', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not book the reclaimed rent as fee income', async () => {
    // The fee is derived by difference — the whole balance change less the liquidity the
    // removal reported — so the two have to be measured the same way. Now that the
    // removal nets the closed accounts out, this one must too; measuring one net and the
    // other gross would turn 0.00427056 SOL of rent into fee income on every close.
    const solana = setup();
    (solana as any).extractClmmBalanceChanges = jest.fn().mockResolvedValue({
      baseTokenChange: nativeChange,
      quoteTokenChange: USDC_FROM_THE_POOL,
      rent: RENT / 1e9,
      accountSol: RENT / 1e9,
    });

    const { closePosition } = await import('../../../../src/connectors/raydium/clmm-routes/closePosition');
    const result = await closePosition('mainnet-beta', WALLET, POSITION);

    expect(result.data?.baseFeeAmountCollected).toBeCloseTo(0, 9);
    expect(result.data?.positionRentRefunded).toBeCloseTo(RENT / 1e9, 9);
  });
});
