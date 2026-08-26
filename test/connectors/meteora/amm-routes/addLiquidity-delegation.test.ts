import { openPosition } from '../../../../src/connectors/meteora/amm-routes/openPosition';

// Opening a DAMM v2 position is its own on-chain call (it mints the position NFT and
// locks rent), so it lives in openPosition. addLiquidity without a position address
// still opens one rather than failing or picking an existing position silently — it
// delegates, and passes the position's address and rent through, so the caller who
// just paid to open it is told which position it is (GW-6).

jest.mock('../../../../src/connectors/meteora/amm-routes/openPosition', () => ({
  openPosition: jest.fn(),
}));

const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POOL = 'FAKEpoolAddress1111111111111111111111111111';

describe('meteora AMM addLiquidity — new-position delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates to openPosition when no position address is given', async () => {
    (openPosition as jest.Mock).mockResolvedValue({
      signature: 'sig-open',
      status: 1,
      data: {
        fee: 0.00001,
        positionAddress: 'FAKEpositionAddress11111111111111111111111',
        positionRent: 0.0575,
        baseTokenAmountAdded: 0.1,
        quoteTokenAmountAdded: 20,
      },
    });

    const { addLiquidity } = await import('../../../../src/connectors/meteora/amm-routes/addLiquidity');
    const result = await addLiquidity('mainnet-beta', WALLET, POOL, 0.1, 20, 1);

    expect(openPosition).toHaveBeenCalledWith('mainnet-beta', WALLET, POOL, 0.1, 20, 1);
    expect(result).toEqual({
      signature: 'sig-open',
      status: 1,
      data: {
        fee: 0.00001,
        positionAddress: 'FAKEpositionAddress11111111111111111111111',
        positionRent: 0.0575,
        baseTokenAmountAdded: 0.1,
        quoteTokenAmountAdded: 20,
      },
    });
  });

  it('passes a pending open through without inventing data', async () => {
    (openPosition as jest.Mock).mockResolvedValue({ signature: 'sig-pending', status: 0 });

    const { addLiquidity } = await import('../../../../src/connectors/meteora/amm-routes/addLiquidity');
    const result = await addLiquidity('mainnet-beta', WALLET, POOL, 0.1, 20, 1);

    expect(result).toEqual({ signature: 'sig-pending', status: 0 });
  });
});
