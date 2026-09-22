import { closePosition } from '../../../../src/connectors/meteora/amm-routes/closePosition';

// Closing a DAMM v2 position is its own on-chain call: it withdraws the liquidity AND
// closes the position account, which is what returns the rent. Withdrawing all the
// liquidity without closing leaves an empty position NFT holding that rent, and nothing
// later reclaims it — on a small position the rent is more than the liquidity.
//
// So removeLiquidity at 100% delegates to closePosition rather than doing its own
// withdrawal. A partial removal must not, because the position stays open and there is
// no rent to return.

jest.mock('../../../../src/connectors/meteora/amm-routes/closePosition', () => ({
  closePosition: jest.fn(),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POOL = 'FAKEpoolAddress1111111111111111111111111111';
const POSITION = 'FAKEpositionAddress11111111111111111111111';

const CLOSED = {
  signature: 'sig-close',
  status: 1,
  data: {
    fee: 0.00001,
    positionRentRefunded: 0.0099,
    baseTokenAmountRemoved: 3000,
    quoteTokenAmountRemoved: 0.0053,
  },
};

describe('meteora AMM removeLiquidity — full-removal delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to closePosition at 100%, so the rent comes back', async () => {
    (closePosition as jest.Mock).mockResolvedValue(CLOSED);

    const { removeLiquidity } = await import('../../../../src/connectors/meteora/amm-routes/removeLiquidity');
    const result = await removeLiquidity('mainnet-beta', WALLET, POOL, POSITION, 100, 1);

    expect(closePosition).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, POSITION, 1);
    expect(result).toEqual(CLOSED);
    // The refund is the whole point of the delegation: a plain withdrawal reports no
    // such field, so its presence is what distinguishes the two paths.
    expect(result.data?.positionRentRefunded).toBe(0.0099);
  });

  it('does not delegate below 100% — the position stays open and refunds nothing', async () => {
    const { removeLiquidity } = await import('../../../../src/connectors/meteora/amm-routes/removeLiquidity');

    // The partial path reaches the chain, which is not available here. What matters is
    // that it got past the delegation branch rather than being answered by the mock.
    await expect(removeLiquidity('mainnet-beta', WALLET, POOL, POSITION, 50, 1)).rejects.toBeDefined();
    expect(closePosition).not.toHaveBeenCalled();
  });

  it.each([0.0001, 25, 99.9999])('does not delegate at %s%%', async (pct) => {
    const { removeLiquidity } = await import('../../../../src/connectors/meteora/amm-routes/removeLiquidity');
    await expect(removeLiquidity('mainnet-beta', WALLET, POOL, POSITION, pct, 1)).rejects.toBeDefined();
    expect(closePosition).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range percentage before either path', async () => {
    const { removeLiquidity } = await import('../../../../src/connectors/meteora/amm-routes/removeLiquidity');
    for (const pct of [0, -1, 100.1]) {
      await expect(removeLiquidity('mainnet-beta', WALLET, POOL, POSITION, pct, 1)).rejects.toThrow(
        /percentageToRemove must be between 0 and 100/,
      );
    }
    expect(closePosition).not.toHaveBeenCalled();
  });
});
