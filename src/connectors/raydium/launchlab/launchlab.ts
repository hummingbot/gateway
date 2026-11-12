/**
 * Raydium LaunchLab: launching a token on Raydium's own platform, and trading
 * its constant-product curve until it graduates to CPMM.
 *
 * The instructions are the SDK's low-level builders (`initializeV2`,
 * `buyExactInInstruction`, …) with every account passed in, never the
 * high-level `raydium.launchpad.*` methods: those fix the SDK's owner as both
 * creator and buyer and read Raydium's HTTP API, and a launch may name a
 * creator other than the key that pays. Everything here is
 * read from the chain.
 *
 * What a launch on Raydium's platform is:
 * - a legacy SPL Token mint, six decimals, Metaplex metadata;
 * - a constant-product curve on Raydium's global config for the quote (SOL or
 *   USDC, `["global_config", quote, 0, 0]`) that sells `totalSellA` of the
 *   supply for `totalFundRaisingB` of the quote, then migrates the rest to a
 *   CPMM pool;
 * - fees on every trade: the global's protocol fee (0.25 %), the platform's
 *   (0.75 %) and the creator's (0.05 %), all in the quote. The creator's
 *   accrues per creator and quote mint in a fee vault `claim_creator_fee`
 *   empties; after graduation the CPMM pool's creator fee is the creator's too.
 */
import {
  CpmmCreatorFeeOn,
  CpmmPoolInfoLayout,
  Curve,
  LaunchConstantProductCurve,
  LaunchpadConfig,
  LaunchpadPool,
  METADATA_PROGRAM_ID,
  PlatformConfig,
  PoolInfoLayout,
  buyExactInInstruction,
  claimCreatorFee,
  collectCreatorFeePermissionlessInInstruction,
  getPdaCpiEvent,
  getPdaCreatorFeeVaultAuth,
  getPdaCreatorVault,
  getPdaLaunchpadAuth,
  getPdaLaunchpadConfigId,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaPlatformVault,
  getLaunchpadPoolMintAProgram,
  getLaunchpadPoolMintBProgram,
  initializeV2,
  sellExactInInstruction,
} from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { httpErrors } from '../../../services/error-handler';

export const LAUNCHLAB_PROGRAM_ID = new PublicKey('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj');
/** Raydium's own LaunchLab platform, which every launch here is made on. */
export const RAYDIUM_LAUNCH_PLATFORM = new PublicKey('4Bu96XjU84XjPDSpveTVf6LYGCkfW5FK7SNkREWcEfV4');
export const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
export const RAYDIUM_CPMM_AUTHORITY = new PublicKey('GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL');
/** USDC, LaunchLab's other constant-product quote. */
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export const LAUNCHLAB_AUTHORITY = getPdaLaunchpadAuth(LAUNCHLAB_PROGRAM_ID).publicKey;
export const LAUNCHLAB_EVENT_AUTHORITY = getPdaCpiEvent(LAUNCHLAB_PROGRAM_ID).publicKey;
export const LAUNCHLAB_CREATOR_FEE_AUTHORITY = getPdaCreatorFeeVaultAuth(LAUNCHLAB_PROGRAM_ID).publicKey;

/** Every token LaunchLab mints has six decimals (`Curve.checkParam`). */
export const LAUNCHLAB_DECIMALS = 6;
/** The curve's shape: constant product (the only one Raydium's globals use). */
const CONSTANT_PRODUCT = 0;
/** `migrate_type`: graduate to CPMM, whose pools carry a creator fee. */
const MIGRATE_TO_CPMM = 'cpmm' as const;

/** A launch's options, in UI units; each has a default. */
export interface LaunchlabLaunchOptions {
  /** Tokens minted, at six decimals. Default a billion; at least the global's
   *  `minSupplyA` (ten million). */
  supply?: number;
  /** The share of the supply the curve sells, in percent. Default 80. */
  sellSharePct?: number;
  /** What the curve raises before it graduates, in the quote. Default 85 SOL,
   *  or 85 SOL's worth of USDC at the chain's SOL price. */
  raise?: number;
}

export const DEFAULT_SUPPLY = 1_000_000_000;
export const DEFAULT_SELL_SHARE_PCT = 80;
export const DEFAULT_RAISE_SOL = 85;

/** Raydium CLMM's SOL/USDC pool (0.04 %), read for SOL's USDC price. */
const SOL_USDC_CLMM_POOL = new PublicKey('3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv');

export type LaunchlabGlobal = ReturnType<typeof LaunchpadConfig.decode>;
export type LaunchlabPlatform = ReturnType<typeof PlatformConfig.decode>;
export type LaunchlabPoolState = ReturnType<typeof LaunchpadPool.decode>;

/**
 * A LaunchLab token's pool, found by its base mint whatever it is quoted in (SOL, USDC,
 * USD1, ...): the program's pool accounts, filtered on `mintA`. A token launches on one
 * curve, so more than one is an error, not a choice.
 */
export async function launchlabPoolByMint(
  connection: Connection,
  mint: PublicKey,
): Promise<{ address: PublicKey; state: LaunchlabPoolState }> {
  const found = await connection.getProgramAccounts(LAUNCHLAB_PROGRAM_ID, {
    filters: [
      { dataSize: LaunchpadPool.span },
      { memcmp: { offset: LaunchpadPool.offsetOf('mintA'), bytes: mint.toBase58() } },
    ],
  });
  if (found.length === 0) throw httpErrors.notFound(`${mint.toBase58()} has no Raydium LaunchLab pool`);
  if (found.length > 1) {
    throw httpErrors.internalServerError(`${mint.toBase58()} has ${found.length} LaunchLab pools; expected one`);
  }
  return { address: found[0].pubkey, state: LaunchpadPool.decode(found[0].account.data) };
}

/** The curve's integer terms, in raw units. */
export interface LaunchlabCurveParams {
  supply: BN;
  totalSellA: BN;
  totalFundRaisingB: BN;
}

/** The global config for a quote mint: `["global_config", quote, curve, index]`. */
export function globalConfigFor(quoteMint: PublicKey): PublicKey {
  return getPdaLaunchpadConfigId(LAUNCHLAB_PROGRAM_ID, quoteMint, CONSTANT_PRODUCT, 0).publicKey;
}

export const poolAddressFor = (baseMint: PublicKey, quoteMint: PublicKey): PublicKey =>
  getPdaLaunchpadPoolId(LAUNCHLAB_PROGRAM_ID, baseMint, quoteMint).publicKey;

export const poolVaultFor = (pool: PublicKey, mint: PublicKey): PublicKey =>
  getPdaLaunchpadVaultId(LAUNCHLAB_PROGRAM_ID, pool, mint).publicKey;

/** Where a trade's platform fee accrues: one vault per platform and quote. */
export const platformFeeVaultFor = (quoteMint: PublicKey, platform: PublicKey = RAYDIUM_LAUNCH_PLATFORM): PublicKey =>
  getPdaPlatformVault(LAUNCHLAB_PROGRAM_ID, platform, quoteMint).publicKey;

/** Where a creator's fee accrues: one vault per creator and quote, across all
 *  its launches. The first buy of a creator's first launch in a quote creates
 *  it, paid by the buyer. */
export const creatorFeeVaultFor = (creator: PublicKey, quoteMint: PublicKey): PublicKey =>
  getPdaCreatorVault(LAUNCHLAB_PROGRAM_ID, creator, quoteMint).publicKey;

export function metadataAccountFor(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

/** The quote a launch names — SOL (wrapped SOL's mint) or USDC — by symbol or address. */
export function launchQuoteMint(quote: string | undefined): PublicKey {
  const q = (quote ?? 'SOL').trim();
  if (q.toUpperCase() === 'SOL' || q.toUpperCase() === 'WSOL' || q === NATIVE_MINT.toBase58()) return NATIVE_MINT;
  if (q.toUpperCase() === 'USDC' || q === USDC_MINT.toBase58()) return USDC_MINT;
  throw httpErrors.badRequest(`A Raydium LaunchLab launch is quoted in SOL or USDC, not ${quote}`);
}

async function account(connection: Connection, address: PublicKey, what: string) {
  const info = await connection.getAccountInfo(address);
  if (!info) throw httpErrors.notFound(`${what} ${address.toBase58()} does not exist on this network`);
  if (!info.owner.equals(LAUNCHLAB_PROGRAM_ID)) {
    throw httpErrors.badRequest(`${what} ${address.toBase58()} is not a LaunchLab account`);
  }
  return info;
}

export async function readGlobal(connection: Connection, address: PublicKey): Promise<LaunchlabGlobal> {
  return LaunchpadConfig.decode((await account(connection, address, 'LaunchLab global config')).data);
}

export async function readPlatform(
  connection: Connection,
  address: PublicKey = RAYDIUM_LAUNCH_PLATFORM,
): Promise<LaunchlabPlatform> {
  return PlatformConfig.decode((await account(connection, address, 'LaunchLab platform')).data);
}

/** A LaunchLab pool, refused unless it is a pool (`PoolState` is also Raydium
 *  CLMM's discriminator, so the owner is what says so). */
export async function readPool(connection: Connection, address: PublicKey): Promise<LaunchlabPoolState> {
  const info = await account(connection, address, 'LaunchLab pool');
  if (info.data.length !== LaunchpadPool.span) {
    throw httpErrors.badRequest(`${address.toBase58()} is a LaunchLab account but not a pool`);
  }
  return LaunchpadPool.decode(info.data);
}

/** SOL's price in USDC, off Raydium's SOL/USDC CLMM pool. */
export async function solUsdcPrice(connection: Connection): Promise<number> {
  const info = await connection.getAccountInfo(SOL_USDC_CLMM_POOL);
  if (!info) throw httpErrors.serviceUnavailable(`Raydium's SOL/USDC pool ${SOL_USDC_CLMM_POOL.toBase58()} is missing`);
  const pool = PoolInfoLayout.decode(info.data);
  if (!pool.mintA.equals(NATIVE_MINT) || !pool.mintB.equals(USDC_MINT)) {
    throw httpErrors.internalServerError(`${SOL_USDC_CLMM_POOL.toBase58()} is not the SOL/USDC pool`);
  }
  const sqrt = new Decimal(pool.sqrtPriceX64.toString()).div(Decimal.pow(2, 64));
  return sqrt
    .pow(2)
    .mul(Decimal.pow(10, pool.mintDecimalsA - pool.mintDecimalsB))
    .toNumber();
}

const raw = (amount: number, decimals: number): BN =>
  new BN(new Decimal(amount).mul(Decimal.pow(10, decimals)).toFixed(0));

/**
 * A launch's curve terms from its options, held to what the global accepts —
 * the same checks `initialize_v2` makes (`Curve.checkParam`), refused here as a
 * 400 rather than a failed transaction. The curve must also sell more than half
 * of the supply: at or below half, a constant-product curve between the two
 * prices has no solution.
 */
export async function launchCurveParams(
  connection: Connection,
  quoteMint: PublicKey,
  global: LaunchlabGlobal,
  options: LaunchlabLaunchOptions,
): Promise<LaunchlabCurveParams> {
  const quoteDecimals = quoteMint.equals(NATIVE_MINT) ? 9 : 6;
  const supply = options.supply ?? DEFAULT_SUPPLY;
  const sellSharePct = options.sellSharePct ?? DEFAULT_SELL_SHARE_PCT;
  let raise = options.raise;
  if (raise === undefined) {
    raise = quoteMint.equals(NATIVE_MINT)
      ? DEFAULT_RAISE_SOL
      : Math.round(DEFAULT_RAISE_SOL * (await solUsdcPrice(connection)));
  }
  // The global's floor, in whole tokens: ten million on both of Raydium's
  // constant-product globals (SOL and USDC) as of 2026-09.
  const minSupply = global.minSupplyA.toNumber();
  if (!Number.isInteger(supply) || supply < minSupply) {
    throw httpErrors.badRequest(
      `supply must be a whole number of tokens, at least LaunchLab's minimum of ${minSupply} (got ${supply})`,
    );
  }
  const minMigratePct = global.minMigrateRateA.toNumber() / 10_000;
  const minSellPct = Math.max(50, global.minSellRateA.toNumber() / 10_000);
  if (!(sellSharePct > minSellPct && sellSharePct <= 100 - minMigratePct)) {
    throw httpErrors.badRequest(
      `sellSharePct must be above ${minSellPct} and at most ${100 - minMigratePct} ` +
        `(the rest, at least ${minMigratePct} %, seeds the graduated pool); got ${sellSharePct}`,
    );
  }
  if (!(raise > 0)) throw httpErrors.badRequest(`raise must be positive (got ${raise})`);
  const params = {
    supply: raw(supply, LAUNCHLAB_DECIMALS),
    totalSellA: raw((supply * sellSharePct) / 100, LAUNCHLAB_DECIMALS),
    totalFundRaisingB: raw(raise, quoteDecimals),
  };
  try {
    Curve.checkParam({
      supply: params.supply,
      totalSell: params.totalSellA,
      totalLockedAmount: new BN(0),
      totalFundRaising: params.totalFundRaisingB,
      decimals: LAUNCHLAB_DECIMALS,
      config: global,
      migrateType: MIGRATE_TO_CPMM,
    });
    freshPool(params, global);
  } catch (e: any) {
    const minRaise = new Decimal(global.minFundRaisingB.toString()).div(Decimal.pow(10, quoteDecimals));
    throw httpErrors.badRequest(
      `LaunchLab's global config refuses these terms (${e?.message ?? e}): supply at least ${minSupply} tokens, ` +
        `raise at least ${minRaise} ${quoteMint.equals(NATIVE_MINT) ? 'SOL' : 'USDC'}`,
    );
  }
  return params;
}

/** A pool as `initialize_v2` leaves it, for quoting a buy in the same transaction. */
export function freshPool(params: LaunchlabCurveParams, global: LaunchlabGlobal) {
  const { a, b } = LaunchConstantProductCurve.getInitParam({
    supply: params.supply,
    totalSell: params.totalSellA,
    totalLockedAmount: new BN(0),
    totalFundRaising: params.totalFundRaisingB,
    migrateFee: global.migrateFee,
  });
  return {
    virtualA: a,
    virtualB: b,
    realA: new BN(0),
    realB: new BN(0),
    totalSellA: params.totalSellA,
    totalFundRaisingB: params.totalFundRaisingB,
  };
}

type CurvePoint = Pick<
  LaunchlabPoolState,
  'virtualA' | 'virtualB' | 'realA' | 'realB' | 'totalSellA' | 'totalFundRaisingB'
>;

const feeRates = (global: LaunchlabGlobal, platform: LaunchlabPlatform) => ({
  protocolFeeRate: global.tradeFeeRate,
  platformFeeRate: platform.feeRate,
  creatorFeeRate: platform.creatorFeeRate,
  shareFeeRate: new BN(0),
  curveType: global.curveType,
  transferFeeConfigA: undefined,
  transferFeeConfigB: undefined,
  slot: 0,
});

/**
 * Tokens a buy of `amountIn` quote gets, after the three fees. A buy past what
 * the curve still sells is filled to its end: `amountIn` then comes back
 * smaller than asked (what the fill actually costs).
 */
export function quoteBuyExactIn(
  pool: CurvePoint,
  global: LaunchlabGlobal,
  platform: LaunchlabPlatform,
  amountIn: BN,
): { amountOut: BN; amountIn: BN; fee: BN } {
  const r = Curve.buyExactIn({ poolInfo: pool, amountB: amountIn, ...feeRates(global, platform) });
  const f = r.splitFee;
  return {
    amountOut: r.amountA.amount,
    amountIn: r.amountB,
    fee: f.protocolFee.add(f.platformFee).add(f.creatorFee).add(f.shareFee),
  };
}

/** Quote a sell of `amountIn` tokens gets, after the three fees. */
export function quoteSellExactIn(
  pool: CurvePoint,
  global: LaunchlabGlobal,
  platform: LaunchlabPlatform,
  amountIn: BN,
): { amountOut: BN; fee: BN } {
  if (amountIn.gt(pool.realA)) {
    throw httpErrors.badRequest(`The curve has sold ${pool.realA.toString()} base units; it cannot buy back more`);
  }
  const r = Curve.sellExactIn({ poolInfo: pool, amountA: amountIn, ...feeRates(global, platform) });
  const f = r.splitFee;
  return { amountOut: r.amountB, fee: f.protocolFee.add(f.platformFee).add(f.creatorFee).add(f.shareFee) };
}

/** Spot price, quote per token, in UI units. */
export function spotPrice(pool: CurvePoint, quoteDecimals: number): Decimal {
  return new Decimal(pool.virtualB.add(pool.realB).toString())
    .div(pool.virtualA.sub(pool.realA).toString())
    .mul(Decimal.pow(10, LAUNCHLAB_DECIMALS - quoteDecimals));
}

/** `initialize_v2` on Raydium's platform. `payer` signs and pays; `creator` is
 *  an argument (it need not sign); the mint keypair signs. */
export function createInstruction(args: {
  payer: PublicKey;
  creator: PublicKey;
  mint: PublicKey;
  quoteMint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  params: LaunchlabCurveParams;
}): TransactionInstruction {
  const pool = poolAddressFor(args.mint, args.quoteMint);
  return initializeV2(
    LAUNCHLAB_PROGRAM_ID,
    args.payer,
    args.creator,
    globalConfigFor(args.quoteMint),
    RAYDIUM_LAUNCH_PLATFORM,
    LAUNCHLAB_AUTHORITY,
    pool,
    args.mint,
    args.quoteMint,
    poolVaultFor(pool, args.mint),
    poolVaultFor(pool, args.quoteMint),
    metadataAccountFor(args.mint),
    TOKEN_PROGRAM_ID,
    LAUNCHLAB_DECIMALS,
    args.name,
    args.symbol,
    args.uri,
    {
      type: 'ConstantCurve',
      totalSellA: args.params.totalSellA,
      migrateType: MIGRATE_TO_CPMM,
      supply: args.params.supply,
      totalFundRaisingB: args.params.totalFundRaisingB,
    },
    new BN(0),
    new BN(0),
    new BN(0),
    CpmmCreatorFeeOn.OnlyTokenB,
  );
}

/**
 * The accounts a trade on one pool names. A pool records its own global,
 * platform and mint programs; a launch on Raydium's platform has Raydium's
 * and SPL Token for both, which `launchTradeAccounts` fills in.
 */
export interface LaunchlabTradeAccounts {
  pool: PublicKey;
  global: PublicKey;
  platform: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseProgram: PublicKey;
  quoteProgram: PublicKey;
  creator: PublicKey;
  /** Pays and signs; owns both token accounts. */
  owner: PublicKey;
  userBase: PublicKey;
  userQuote: PublicKey;
}

/** The base mint's token program, from a pool's `mint_program_flag`. */
export const getLaunchpadPoolBaseProgram = (flag: number): PublicKey => getLaunchpadPoolMintAProgram(flag);

/** A trade's accounts on a pool as it stands on chain, for `owner`'s
 *  associated accounts. */
export function poolTradeAccounts(
  pool: PublicKey,
  state: LaunchlabPoolState,
  owner: PublicKey,
): LaunchlabTradeAccounts {
  const baseProgram = getLaunchpadPoolMintAProgram(state.mintProgramFlag);
  const quoteProgram = getLaunchpadPoolMintBProgram(state.mintProgramFlag);
  return {
    pool,
    global: state.configId,
    platform: state.platformId,
    baseMint: state.mintA,
    quoteMint: state.mintB,
    baseProgram,
    quoteProgram,
    creator: state.creator,
    owner,
    userBase: getAssociatedTokenAddressSync(state.mintA, owner, true, baseProgram),
    userQuote: getAssociatedTokenAddressSync(state.mintB, owner, true, quoteProgram),
  };
}

/** A trade's accounts on a pool this transaction creates on Raydium's
 *  platform, before it is on chain. */
export function launchTradeAccounts(
  mint: PublicKey,
  quoteMint: PublicKey,
  creator: PublicKey,
  owner: PublicKey,
): LaunchlabTradeAccounts {
  return {
    pool: poolAddressFor(mint, quoteMint),
    global: globalConfigFor(quoteMint),
    platform: RAYDIUM_LAUNCH_PLATFORM,
    baseMint: mint,
    quoteMint,
    baseProgram: TOKEN_PROGRAM_ID,
    quoteProgram: TOKEN_PROGRAM_ID,
    creator,
    owner,
    userBase: getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID),
    userQuote: getAssociatedTokenAddressSync(quoteMint, owner, true, TOKEN_PROGRAM_ID),
  };
}

type TradeBuilder = typeof buyExactInInstruction;
function trade(build: TradeBuilder, a: LaunchlabTradeAccounts, amountIn: BN, minOut: BN): TransactionInstruction {
  return build(
    LAUNCHLAB_PROGRAM_ID,
    a.owner,
    LAUNCHLAB_AUTHORITY,
    a.global,
    a.platform,
    a.pool,
    a.userBase,
    a.userQuote,
    poolVaultFor(a.pool, a.baseMint),
    poolVaultFor(a.pool, a.quoteMint),
    a.baseMint,
    a.quoteMint,
    a.baseProgram,
    a.quoteProgram,
    platformFeeVaultFor(a.quoteMint, a.platform),
    creatorFeeVaultFor(a.creator, a.quoteMint),
    amountIn,
    minOut,
    new BN(0),
  );
}

/** `buy_exact_in`, sharing no fee: spend `amountIn` quote for at least `minOut` tokens. */
export const buyInstruction = (a: LaunchlabTradeAccounts, amountIn: BN, minOut: BN) =>
  trade(buyExactInInstruction, a, amountIn, minOut);

/** `sell_exact_in`, sharing no fee: sell `amountIn` tokens for at least `minOut` quote. */
export const sellInstruction = (a: LaunchlabTradeAccounts, amountIn: BN, minOut: BN) =>
  trade(sellExactInInstruction as TradeBuilder, a, amountIn, minOut);

/** `claim_creator_fee`: the creator's fee vault for `quoteMint`, into the
 *  creator's associated account for it, which must already exist — otherwise
 *  the creator pays its rent. */
export function claimCreatorFeeInstruction(creator: PublicKey, quoteMint: PublicKey): TransactionInstruction {
  return claimCreatorFee(
    LAUNCHLAB_PROGRAM_ID,
    creator,
    LAUNCHLAB_CREATOR_FEE_AUTHORITY,
    creatorFeeVaultFor(creator, quoteMint),
    getAssociatedTokenAddressSync(quoteMint, creator, true, TOKEN_PROGRAM_ID),
    quoteMint,
    TOKEN_PROGRAM_ID,
  );
}

/**
 * The CPMM pools holding `baseMint` whose pool creator is `creator` — where a
 * graduated LaunchLab token's creator fees accrue. Found by the pool accounts
 * themselves (the base mint in either slot, since CPMM orders its two mints by
 * key), not derived from a config: the config a pool graduated on is whatever
 * its platform pointed at THEN, and platforms change theirs.
 */
export async function cpmmPoolsCreatedBy(
  connection: Connection,
  baseMint: PublicKey,
  creator: PublicKey,
): Promise<Array<{ address: PublicKey; state: ReturnType<typeof CpmmPoolInfoLayout.decode> }>> {
  const inSlot = (slot: 'mintA' | 'mintB') =>
    connection.getProgramAccounts(RAYDIUM_CPMM_PROGRAM_ID, {
      filters: [
        { dataSize: CpmmPoolInfoLayout.span },
        { memcmp: { offset: CpmmPoolInfoLayout.offsetOf('poolCreator'), bytes: creator.toBase58() } },
        { memcmp: { offset: CpmmPoolInfoLayout.offsetOf(slot), bytes: baseMint.toBase58() } },
      ],
    });
  const found = [...(await inSlot('mintA')), ...(await inSlot('mintB'))];
  return found.map(({ pubkey, account }) => ({ address: pubkey, state: CpmmPoolInfoLayout.decode(account.data) }));
}

/**
 * CPMM's `collect_creator_fee_permissionless`: the graduated pool's creator
 * fee, paid into the creator's associated accounts for both mints (created,
 * if missing, at `payer`'s expense). The creator does not sign.
 */
export function collectCpmmCreatorFeeInstruction(
  payer: PublicKey,
  pool: PublicKey,
  state: ReturnType<typeof CpmmPoolInfoLayout.decode>,
): TransactionInstruction {
  const creator = state.poolCreator;
  return collectCreatorFeePermissionlessInInstruction(
    RAYDIUM_CPMM_PROGRAM_ID,
    payer,
    creator,
    RAYDIUM_CPMM_AUTHORITY,
    pool,
    state.configId,
    state.vaultA,
    state.vaultB,
    state.mintA,
    state.mintB,
    getAssociatedTokenAddressSync(state.mintA, creator, true, state.mintProgramA),
    getAssociatedTokenAddressSync(state.mintB, creator, true, state.mintProgramB),
    state.mintProgramA,
    state.mintProgramB,
  );
}
