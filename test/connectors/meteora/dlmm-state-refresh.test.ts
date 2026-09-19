import DLMM from '@meteora-ag/dlmm';

import { Solana } from '../../../src/chains/solana/solana';
import { Meteora } from '../../../src/connectors/meteora/meteora';

jest.mock('../../../src/chains/solana/solana');
jest.mock('@meteora-ag/dlmm', () => ({
  __esModule: true,
  default: { create: jest.fn() },
  getPriceOfBinByBinId: jest.fn(),
}));
jest.mock('../../../src/connectors/meteora/meteora.config', () => ({
  MeteoraConfig: { config: { slippagePct: 1, strategyType: 0 } },
}));

// DLMM.create() reads `lbPair` once and the SDK never refreshes it again on its own, but
// almost every read goes through it: getBinsAroundActiveBin centers the pool-info window on
// `lbPair.activeId`, swapQuote prices from that id and from `lbPair.vParameters`, and
// initializePositionAndAddLiquidityByStrategy bakes the id into the instruction as
// `active_id`. A Gateway that had been up for hours therefore served a fresh price next to
// a bins window frozen around whatever the active bin was when it first touched the pool —
// and once the drift passed the window, the bins stopped containing the active bin at all.
//
// Pinned here: the cached instance is refetched once its state ages past the TTL, one
// refetch serves every caller waiting on it, and a failed refetch surfaces instead of
// handing back state nobody can tell is stale.

const POOL = '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6';
const TTL_MS = 5000;

let now: number;
let onChainActiveId: number;
let refetchStates: jest.Mock;
let pendingRefetch: { resolve: () => void; reject: (e: Error) => void } | null;

/** Mirrors the SDK: refetchStates() overwrites the cached lbPair from the chain. */
const primeDlmm = () => {
  const pool: any = { lbPair: { activeId: onChainActiveId } };
  refetchStates = jest.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        pendingRefetch = {
          resolve: () => {
            pool.lbPair = { activeId: onChainActiveId };
            resolve();
          },
          reject,
        };
      }),
  );
  pool.refetchStates = refetchStates;
  (DLMM.create as jest.Mock).mockResolvedValue(pool);
  return pool;
};

/** Settles whatever refetch the call under test kicked off, then awaits it. */
const settle = async <T>(call: Promise<T>): Promise<T> => {
  await Promise.resolve();
  const refetch = pendingRefetch;
  pendingRefetch = null;
  refetch?.resolve();
  return call;
};

const freshMeteora = async () => {
  (Meteora as any)._instances = {};
  (Solana.getInstance as jest.Mock).mockResolvedValue({ connection: {}, network: 'mainnet-beta' });
  const meteora = await Meteora.getInstance('mainnet-beta');
  await settle(meteora.getDlmmPool(POOL));
  return meteora;
};

describe('meteora cached DLMM state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_700_000_000_000;
    onChainActiveId = -5908;
    pendingRefetch = null;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    primeDlmm();
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not refetch a pool whose state is still inside the TTL', async () => {
    const meteora = await freshMeteora();
    expect(refetchStates).toHaveBeenCalledTimes(1); // the one at creation

    onChainActiveId = -5837;
    now += TTL_MS - 1;
    const pool = await settle(meteora.getDlmmPool(POOL));

    expect(refetchStates).toHaveBeenCalledTimes(1);
    expect(pool.lbPair.activeId).toBe(-5908);
  });

  it('follows the active bin once the cached state ages past the TTL', async () => {
    const meteora = await freshMeteora();

    onChainActiveId = -5837;
    now += TTL_MS;
    const pool = await settle(meteora.getDlmmPool(POOL));

    expect(refetchStates).toHaveBeenCalledTimes(2);
    // What getBinsAroundActiveBin centers on, and what a position instruction carries.
    expect(pool.lbPair.activeId).toBe(onChainActiveId);
  });

  it('serves concurrent callers from a single refetch', async () => {
    const meteora = await freshMeteora();

    onChainActiveId = -5837;
    now += TTL_MS;
    const calls = Promise.all([meteora.getDlmmPool(POOL), meteora.getDlmmPool(POOL), meteora.getDlmmPool(POOL)]);
    const pools = await settle(calls);

    expect(refetchStates).toHaveBeenCalledTimes(2); // creation + one shared refresh
    expect(pools.map((p) => p.lbPair.activeId)).toEqual([-5837, -5837, -5837]);
  });

  it('surfaces a failed refetch rather than returning state it cannot vouch for', async () => {
    const meteora = await freshMeteora();

    now += TTL_MS;
    const failing = meteora.getDlmmPool(POOL);
    await Promise.resolve();
    const refetch = pendingRefetch!;
    pendingRefetch = null;
    refetch.reject(new Error('429 Too Many Requests'));
    await expect(failing).rejects.toThrow('429 Too Many Requests');

    // The failure must not wedge the pool: the next caller retries.
    onChainActiveId = -5837;
    const pool = await settle(meteora.getDlmmPool(POOL));
    expect(refetchStates).toHaveBeenCalledTimes(3);
    expect(pool.lbPair.activeId).toBe(-5837);
  });
});
