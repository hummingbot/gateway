import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../../src/chains/solana/solana';
import { MeteoraDamm } from '../../../../src/connectors/meteora/meteora-damm';

jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/meteora/meteora-damm');
jest.mock('../../../../src/connectors/meteora/meteora.config', () => ({
  MeteoraConfig: { config: { slippagePct: 1 } },
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POOL = new PublicKey('11111111111111111111111111111112');
const POSITION = new PublicKey('SysvarRent111111111111111111111111111111111');
const POSITION_NFT_ACCOUNT = new PublicKey('SysvarC1ock11111111111111111111111111111111');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

const RENT_LAMPORTS = 57_500_000; // 0.0575 SOL
const TX_FEE_LAMPORTS = 10_000;

const poolState = {
  tokenAMint: USDC,
  tokenBMint: WSOL,
  sqrtMinPrice: new BN(1),
  sqrtMaxPrice: new BN(1000),
  sqrtPrice: new BN(100),
  collectFeeMode: 0,
  tokenAAmount: new BN(1000),
  tokenBAmount: new BN(1000),
  liquidity: new BN(1000),
};

const removeAllLiquidityAndClosePosition = jest.fn();

const setup = ({ vested = new BN(0) }: { vested?: BN } = {}) => {
  (MeteoraDamm.getInstance as jest.Mock).mockResolvedValue({
    getPoolState: jest.fn().mockResolvedValue(poolState),
    getUserPositions: jest.fn().mockResolvedValue([
      {
        position: POSITION,
        positionNftAccount: POSITION_NFT_ACCOUNT,
        positionState: { unlockedLiquidity: new BN(500), vestedLiquidity: vested },
      },
    ]),
    getCurrentPoint: jest.fn().mockReturnValue(new BN(1)),
    cpAmm: {
      getWithdrawQuote: jest.fn().mockReturnValue({ outAmountA: new BN(100), outAmountB: new BN(100) }),
      getAllVestingsByPosition: jest.fn().mockResolvedValue([]),
      removeAllLiquidityAndClosePosition,
    },
  });

  (Solana.getInstance as jest.Mock).mockResolvedValue({
    connection: {
      getSlot: jest.fn().mockResolvedValue(1),
      getBlockTime: jest.fn().mockResolvedValue(1_700_000_000),
    },
    sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig-close' }),
    getConfirmedTransactionData: jest.fn().mockResolvedValue({
      transaction: {
        message: {
          getAccountKeys: () => ({ get: (i: number) => [new PublicKey(WALLET), POSITION][i] }),
        },
      },
      meta: {
        fee: TX_FEE_LAMPORTS,
        preBalances: [1_000_000_000, RENT_LAMPORTS],
        postBalances: [1_057_490_000, 0],
      },
    }),
    // Base is USDC (25 out), quote is wrapped SOL (0.5 out). The SOL figure also
    // carries the rent refund, which the connector backs out. It does NOT carry the
    // transaction fee: extractBalanceChangesAndFee adds that back for the fee payer
    // and reports it separately, so this fixture encodes that contract — if it ever
    // changes, this test fails rather than the amounts silently drifting by a fee.
    extractBalanceChangesAndFee: jest.fn().mockResolvedValue({
      balanceChanges: [25, 0.5 + 0.0575],
    }),
  });
};

describe('meteora AMM closePosition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    removeAllLiquidityAndClosePosition.mockResolvedValue({});
  });

  it('reports the rent refunded when the position account closes', async () => {
    setup();
    const { closePosition } = await import('../../../../src/connectors/meteora/amm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POOL.toBase58(), POSITION.toBase58(), 1);

    expect(result.status).toBe(1);
    // The position account's pre-close balance IS the rent that comes back.
    expect(result.data?.positionRentRefunded).toBeCloseTo(0.0575);
    expect(result.data?.fee).toBeCloseTo(TX_FEE_LAMPORTS / 1e9);
  });

  it('closes the account rather than just withdrawing — which is what earns the refund', async () => {
    setup();
    const { closePosition } = await import('../../../../src/connectors/meteora/amm-routes/closePosition');

    await closePosition('mainnet-beta', WALLET, POOL.toBase58(), POSITION.toBase58(), 1);

    expect(removeAllLiquidityAndClosePosition).toHaveBeenCalledWith(
      expect.objectContaining({ position: POSITION, positionNftAccount: POSITION_NFT_ACCOUNT }),
    );
  });

  it('backs the rent refund out of a native-token side', async () => {
    setup();
    const { closePosition } = await import('../../../../src/connectors/meteora/amm-routes/closePosition');

    const result = await closePosition('mainnet-beta', WALLET, POOL.toBase58(), POSITION.toBase58(), 1);

    // The wallet's WSOL-side change was liquidity + rent; only the liquidity is reported.
    expect(result.data?.quoteTokenAmountRemoved).toBeCloseTo(0.5);
    // The non-native side needs no adjustment.
    expect(result.data?.baseTokenAmountRemoved).toBeCloseTo(25);
  });

  it('refuses to close a position that still holds vested liquidity', async () => {
    setup({ vested: new BN(100) });
    const { closePosition } = await import('../../../../src/connectors/meteora/amm-routes/closePosition');

    await expect(closePosition('mainnet-beta', WALLET, POOL.toBase58(), POSITION.toBase58(), 1)).rejects.toThrow(
      /vested \(locked\) liquidity/,
    );
    expect(removeAllLiquidityAndClosePosition).not.toHaveBeenCalled();
  });

  it('reports pending without rent data when the transaction has not confirmed', async () => {
    setup();
    const solana = await (Solana.getInstance as jest.Mock)('mainnet-beta');
    solana.getConfirmedTransactionData.mockResolvedValue(null);

    const { closePosition } = await import('../../../../src/connectors/meteora/amm-routes/closePosition');
    const result = await closePosition('mainnet-beta', WALLET, POOL.toBase58(), POSITION.toBase58(), 1);

    expect(result).toEqual({ signature: 'sig-close', status: 0 });
  });
});
