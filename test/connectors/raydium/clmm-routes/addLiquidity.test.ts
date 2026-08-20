/**
 * Adding to an existing Raydium CLMM position reports how much went in.
 *
 * This site passed the raw wallet balance change through, so a deposit — which moves
 * tokens out — was reported as a negative `…Added`. hummingbot-api stores the value
 * verbatim, so the negative reached the event table, where summing the rows nets a round
 * trip on this connector while double-counting it on every connector that reports
 * magnitudes. No route existed to cover this file before.
 */
jest.mock('../../../../src/chains/solana/solana');
jest.mock('../../../../src/connectors/raydium/raydium');
jest.mock('../../../../src/connectors/raydium/clmm-routes/quotePosition', () => ({
  quotePosition: jest.fn(),
}));
jest.mock('../../../../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { Solana } from '../../../../src/chains/solana/solana';
import { addLiquidity } from '../../../../src/connectors/raydium/clmm-routes/addLiquidity';
import { quotePosition } from '../../../../src/connectors/raydium/clmm-routes/quotePosition';
import { Raydium } from '../../../../src/connectors/raydium/raydium';

const SOL = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', decimals: 9 };
const USDC = { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 };
const WALLET = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const POSITION = 'AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA';

// A deposit of 1 SOL and 150 USDC, as the chain reports it: both sides negative.
const buildSolana = (balanceChanges: number[]) => ({
  getToken: jest.fn(async (address: string) => (address === SOL.address ? SOL : USDC)),
  estimateGasPrice: jest.fn().mockResolvedValue(2000),
  sendAndConfirmTransactionForWallet: jest.fn().mockResolvedValue({ signature: 'sig' }),
  getConfirmedTransactionData: jest.fn().mockResolvedValue({ meta: { fee: 5000 } }),
  extractBalanceChangesAndFee: jest.fn().mockResolvedValue({ balanceChanges }),
});

const buildRaydium = () => ({
  setOwner: jest.fn().mockResolvedValue(undefined),
  getPositionInfo: jest.fn().mockResolvedValue({ poolAddress: 'pool-1', lowerPrice: 100, upperPrice: 200 }),
  getClmmPosition: jest.fn().mockResolvedValue({ poolId: { toBase58: () => 'pool-1' } }),
  getClmmPoolfromAPI: jest
    .fn()
    .mockResolvedValue([
      { mintA: { address: SOL.address, decimals: 9 }, mintB: { address: USDC.address, decimals: 6 } },
      {},
    ]),
  raydiumSDK: { clmm: { increasePositionFromBase: jest.fn().mockResolvedValue({ transaction: {} }) } },
});

beforeEach(() => {
  jest.clearAllMocks();
  (quotePosition as jest.Mock).mockResolvedValue({
    baseLimited: true,
    baseTokenAmount: 1,
    quoteTokenAmount: 150,
    baseTokenAmountMax: 1.01,
    quoteTokenAmountMax: 151.5,
  });
});

describe('Raydium CLMM addLiquidity', () => {
  it('reports the deposit as magnitudes, not the wallet delta', async () => {
    // SOL is the base, so the SOL change is read twice — once as the native entry and
    // once as the base — which is how the route indexes a SOL-paired pool.
    (Solana.getInstance as jest.Mock).mockResolvedValue(buildSolana([-1, -150]));
    (Raydium.getInstance as jest.Mock).mockResolvedValue(buildRaydium());

    const result = await addLiquidity('mainnet-beta', WALLET, POSITION, 1, 150);

    expect(result.status).toBe(1);
    expect(result.data.baseTokenAmountAdded).toBe(1);
    expect(result.data.quoteTokenAmountAdded).toBe(150);
  });

  // Adding to a position that already exists locks no new rent, so unlike an open there
  // is nothing to back out — the whole outflow is liquidity.
  it('does not subtract anything from a native-side deposit', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(buildSolana([-0.5, -75]));
    (Raydium.getInstance as jest.Mock).mockResolvedValue(buildRaydium());

    const result = await addLiquidity('mainnet-beta', WALLET, POSITION, 0.5, 75);

    expect(result.data.baseTokenAmountAdded).toBe(0.5);
  });

  it('names the pool the position belongs to', async () => {
    (Solana.getInstance as jest.Mock).mockResolvedValue(buildSolana([-1, -150]));
    (Raydium.getInstance as jest.Mock).mockResolvedValue(buildRaydium());

    const result = await addLiquidity('mainnet-beta', WALLET, POSITION, 1, 150);

    expect(result.data.poolAddress).toBe('pool-1');
  });
});
