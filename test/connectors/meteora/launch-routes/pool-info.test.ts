/**
 * meteora-dbc pool info: the view computed from a pool state (curve progress,
 * spot price from the sqrt price, fee counters in UI units), and the selector
 * rules of getPoolInfo (poolAddress XOR baseMint).
 */
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { MeteoraDbc } from '../../../../src/connectors/meteora/meteora-dbc';

const CONFIG = PublicKey.unique();
const POOL = PublicKey.unique();
const CREATOR = PublicKey.unique();
const MINT = PublicKey.unique();
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// sqrtPrice = 2^64 * sqrt(price_raw) with price_raw = 1e-3 (quote lamports per base unit)
// → in UI terms (6 base decimals, 9 quote decimals) price = 1e-3 * 1e6 / 1e9 = 1e-6.
const SQRT_PRICE = new BN('583337266871351808'); // ≈ 2^64 * sqrt(1e-3)

const state: any = {
  poolAddress: POOL,
  pool: {
    poolState: {
      creator: CREATOR,
      quoteReserve: new BN(2_500_000_000),
      sqrtPrice: SQRT_PRICE,
      metrics: { totalTradingBaseFee: new BN(0), totalTradingQuoteFee: new BN(25_000_000) },
      partnerQuoteFee: new BN(10_000_000),
      creatorQuoteFee: new BN(10_000_000),
      protocolQuoteFee: new BN(5_000_000),
    },
  },
  configAddress: CONFIG,
  config: { migrationQuoteThreshold: new BN(10_000_000_000) },
  baseMint: MINT,
  quoteMint: SOL_MINT,
  tokenProgram: TOKEN_2022,
  baseDecimals: 6,
  quoteDecimals: 9,
  isMigrated: false,
};

const poolInfo = (MeteoraDbc.prototype as any).poolInfo as (this: unknown, s: unknown) => any;
const spotPrice = (MeteoraDbc.prototype as any).spotPrice as (this: unknown, s: unknown) => number;
const self = { spotPrice };

describe('MeteoraDbc.poolInfo', () => {
  it('reports curve progress, price, and fees in UI units', () => {
    const info = poolInfo.call(self, state);
    expect(info).toMatchObject({
      poolAddress: POOL.toBase58(),
      config: CONFIG.toBase58(),
      creator: CREATOR.toBase58(),
      baseMint: MINT.toBase58(),
      quoteMint: SOL_MINT.toBase58(),
      tokenProgram: TOKEN_2022.toBase58(),
      isMigrated: false,
      quoteReserve: 2.5,
      migrationQuoteThreshold: 10,
      migrationProgress: 0.25,
      sqrtPrice: SQRT_PRICE.toString(),
      totalTradingBaseFee: 0,
      totalTradingQuoteFee: 0.025,
      partnerQuoteFee: 0.01,
      creatorQuoteFee: 0.01,
      protocolQuoteFee: 0.005,
      baseDecimals: 6,
      quoteDecimals: 9,
    });
    expect(info.price).toBeCloseTo(1e-6, 12);
  });

  it('clamps progress to 1 and reports 1 for a migrated pool', () => {
    const over = { ...state, pool: { poolState: { ...state.pool.poolState, quoteReserve: new BN(12_000_000_000) } } };
    expect(poolInfo.call(self, over).migrationProgress).toBe(1);
    const migrated = {
      ...state,
      isMigrated: true,
      pool: { poolState: { ...state.pool.poolState, quoteReserve: new BN(0) } },
    };
    expect(poolInfo.call(self, migrated)).toMatchObject({ isMigrated: true, migrationProgress: 1 });
  });

  it('reports 0 progress for a fresh pool', () => {
    const fresh = { ...state, pool: { poolState: { ...state.pool.poolState, quoteReserve: new BN(0) } } };
    expect(poolInfo.call(self, fresh).migrationProgress).toBe(0);
  });
});

describe('meteora-dbc getPoolInfo selector', () => {
  const fake: any = {
    getPool: jest.fn(async () => state),
    getPoolByBaseMint: jest.fn(async () => state),
    poolInfo: jest.fn(() => ({ ok: true })),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../../../src/connectors/meteora/meteora-dbc', () => ({
      MeteoraDbc: { getInstance: jest.fn(async () => fake) },
    }));
    fake.getPool.mockClear();
    fake.getPoolByBaseMint.mockClear();
  });

  const load = () => require('../../../../src/connectors/meteora/launch-routes/poolInfo').getPoolInfo;

  it('resolves by pool address or by base mint, not both, not neither', async () => {
    const getPoolInfo = load();
    await getPoolInfo('mainnet-beta', { poolAddress: POOL.toBase58() });
    expect(fake.getPool).toHaveBeenCalledWith(POOL);
    await getPoolInfo('mainnet-beta', { baseMint: MINT.toBase58() });
    expect(fake.getPoolByBaseMint).toHaveBeenCalledWith(MINT);
    await expect(getPoolInfo('mainnet-beta', {})).rejects.toThrow(/Pass poolAddress or baseMint/);
    await expect(
      getPoolInfo('mainnet-beta', { poolAddress: POOL.toBase58(), baseMint: MINT.toBase58() }),
    ).rejects.toThrow(/not both/);
    await expect(getPoolInfo('mainnet-beta', { poolAddress: 'nope' })).rejects.toThrow(/Invalid poolAddress/);
  });
});
