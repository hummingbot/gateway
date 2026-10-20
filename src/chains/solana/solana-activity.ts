/**
 * What a wallet did, transaction by transaction.
 *
 * This reads a wallet's recent transactions and names each one: a swap, a position
 * opened or closed, liquidity added or removed, fees collected, or an asset moved in
 * or out.
 *
 * Two independent readings, joined per transaction:
 *
 * 1. **Which venue instruction ran** — matched by program id and instruction
 *    discriminator, on the outer instructions *and* the inner CPIs. The inner
 *    ones matter when the venue is called through another program (an
 *    aggregator, or a program the wallet trades through): the venue call is
 *    the act. Every Anchor program's discriminator is
 *    `sha256("global:<name>")[..8]`, so the tables below carry instruction
 *    *names* and the bytes are derived — a name is checkable against a
 *    program's IDL by eye, a byte string is not.
 *
 * 2. **What the wallet's balances did** — from the transaction's own pre and
 *    post balances, filtered to accounts the wallet owns. Venue-agnostic and
 *    exact: it is what actually moved, whatever the instruction was called.
 *
 * A transaction touching no known venue but moving the wallet's balances is a
 * deposit or a withdrawal. One that does neither is `other`, and left out
 * unless asked for.
 *
 * The transactions are the wallet address's own signature history. A transfer
 * into a token account the wallet already has need not name the wallet, and
 * then it is not in that history, so it is not listed here.
 */
import { createHash } from 'crypto';

import { CP_AMM_PROGRAM_ID } from '@meteora-ag/cp-amm-sdk';
import { LBCLMM_PROGRAM_IDS } from '@meteora-ag/dlmm';
import { WHIRLPOOL_PROGRAM_ADDRESS } from '@orca-so/whirlpools-client';
import { AMM_V4, CLMM_PROGRAM_ID, CREATE_CPMM_POOL_PROGRAM } from '@raydium-io/raydium-sdk-v2';
import { NATIVE_MINT } from '@solana/spl-token';
import {
  ConfirmedSignatureInfo,
  Connection,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from '../../connectors/pancakeswap-sol/pancakeswap-sol';

/** The kinds, most significant first: a transaction that did several things is
 *  named by the first of them it did. */
export const ACTIVITY_KINDS = [
  'close_position',
  'remove_liquidity',
  'collect_fees',
  'add_liquidity',
  'open_position',
  'swap',
  'withdraw',
  'deposit',
  'other',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityAction {
  kind: ActivityKind;
  protocol: string;
  program: string;
  instruction: string;
}

export interface ActivityChange {
  mint: string;
  symbol: string | null;
  decimals: number;
  /** Signed, in whole units, as a decimal string. */
  amount: string;
}

export interface ActivityEntry {
  signature: string;
  slot: number;
  blockTime: number | null;
  ok: boolean;
  kind: ActivityKind;
  protocol: string | null;
  actions: ActivityAction[];
  changes: ActivityChange[];
  feeLamports: number | null;
}

const anchor = (name: string): string =>
  createHash('sha256').update(`global:${name}`).digest().subarray(0, 8).toString('hex');

/** Anchor programs: instruction names, grouped by the kind each one is. */
type Names = Partial<Record<ActivityKind, readonly string[]>>;

const METEORA_DLMM: Names = {
  swap: ['swap', 'swap2', 'swap_exact_out', 'swap_exact_out2', 'swap_with_price_impact', 'swap_with_price_impact2'],
  open_position: ['initialize_position', 'initialize_position_pda', 'initialize_position_by_operator'],
  add_liquidity: [
    'add_liquidity',
    'add_liquidity2',
    'add_liquidity_by_weight',
    'add_liquidity_by_strategy',
    'add_liquidity_by_strategy2',
    'add_liquidity_by_strategy_one_side',
    'add_liquidity_one_side',
    'add_liquidity_one_side_precise',
    'add_liquidity_one_side_precise2',
  ],
  remove_liquidity: [
    'remove_liquidity',
    'remove_liquidity2',
    'remove_liquidity_by_range',
    'remove_liquidity_by_range2',
    'remove_all_liquidity',
  ],
  collect_fees: ['claim_fee', 'claim_fee2', 'claim_reward', 'claim_reward2'],
  close_position: ['close_position', 'close_position2', 'close_position_if_empty'],
};

const METEORA_DAMM_V2: Names = {
  swap: ['swap', 'swap2'],
  open_position: ['create_position'],
  add_liquidity: ['add_liquidity'],
  remove_liquidity: ['remove_liquidity', 'remove_all_liquidity'],
  collect_fees: ['claim_position_fee', 'claim_position_fee2', 'claim_reward'],
  close_position: ['close_position'],
};

/** Raydium's CLMM, and PancakeSwap's Solana CLMM which is its fork. */
const RAYDIUM_CLMM: Names = {
  swap: ['swap', 'swap_v2', 'swap_router_base_in'],
  open_position: ['open_position', 'open_position_v2', 'open_position_with_token22_nft'],
  add_liquidity: ['increase_liquidity', 'increase_liquidity_v2'],
  // Raydium CLMM has no separate collect: fees come out with a decrease, and a
  // decrease of zero is how its SDK collects. Named as the removal it is.
  remove_liquidity: ['decrease_liquidity', 'decrease_liquidity_v2'],
  collect_fees: ['collect_remaining_rewards'],
  close_position: ['close_position'],
};

const RAYDIUM_CPMM: Names = {
  swap: ['swap_base_input', 'swap_base_output'],
  add_liquidity: ['deposit'],
  remove_liquidity: ['withdraw'],
};

const ORCA_WHIRLPOOL: Names = {
  swap: ['swap', 'swap_v2', 'two_hop_swap', 'two_hop_swap_v2'],
  open_position: ['open_position', 'open_position_with_metadata', 'open_position_with_token_extensions'],
  add_liquidity: ['increase_liquidity', 'increase_liquidity_v2'],
  remove_liquidity: ['decrease_liquidity', 'decrease_liquidity_v2'],
  collect_fees: ['collect_fees', 'collect_fees_v2', 'collect_reward', 'collect_reward_v2'],
  close_position: ['close_position', 'close_position_with_token_extensions'],
};

const JUPITER: Names = {
  swap: [
    'route',
    'shared_accounts_route',
    'exact_out_route',
    'shared_accounts_exact_out_route',
    'route_with_token_ledger',
    'shared_accounts_route_with_token_ledger',
  ],
};

/** Jupiter's aggregator, which Gateway's router connector trades through. Not
 *  exported by any SDK Gateway carries, so pinned here beside the others. */
const JUPITER_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

interface Venue {
  protocol: string;
  /** hex(discriminator) → [kind, name] */
  byDisc: Map<string, [ActivityKind, string]>;
}

function venue(protocol: string, names: Names): Venue {
  const byDisc = new Map<string, [ActivityKind, string]>();
  for (const [kind, list] of Object.entries(names) as [ActivityKind, readonly string[]][]) {
    for (const name of list) byDisc.set(anchor(name), [kind, name]);
  }
  return { protocol, byDisc };
}

/** Mainnet program ids; the route refuses other clusters rather than misread them. */
const ANCHOR_VENUES: Record<string, Venue> = {
  [LBCLMM_PROGRAM_IDS['mainnet-beta']]: venue('meteora/clmm', METEORA_DLMM),
  [CP_AMM_PROGRAM_ID.toBase58()]: venue('meteora/amm', METEORA_DAMM_V2),
  [CLMM_PROGRAM_ID.toBase58()]: venue('raydium/clmm', RAYDIUM_CLMM),
  [CREATE_CPMM_POOL_PROGRAM.toBase58()]: venue('raydium/amm', RAYDIUM_CPMM),
  [PANCAKESWAP_CLMM_PROGRAM_ID.toBase58()]: venue('pancakeswap/clmm', RAYDIUM_CLMM),
  [WHIRLPOOL_PROGRAM_ADDRESS]: venue('orca/clmm', ORCA_WHIRLPOOL),
  [JUPITER_V6]: venue('jupiter/router', JUPITER),
};

/** Raydium's AMM v4 predates Anchor: one tag byte. */
const RAYDIUM_AMM_V4: Record<number, [ActivityKind, string]> = {
  9: ['swap', 'swap_base_in'],
  11: ['swap', 'swap_base_out'],
  3: ['add_liquidity', 'deposit'],
  4: ['remove_liquidity', 'withdraw'],
};

/** Exposed so a test can check a derived discriminator against a program's
 *  published bytes without reaching into the tables. */
export const discriminatorOf = anchor;
export const KNOWN_PROGRAMS = [...Object.keys(ANCHOR_VENUES), AMM_V4.toBase58()];

type AnyInstruction = ParsedInstruction | PartiallyDecodedInstruction;

function classify(ix: AnyInstruction): ActivityAction | null {
  const program = ix.programId.toBase58();
  const raw = (ix as PartiallyDecodedInstruction).data;
  if (typeof raw !== 'string') return null;
  let data: Buffer;
  try {
    // Two copies of the typed-array types disagree about what bs58 returns;
    // going through a plain array sidesteps the argument entirely.
    data = Buffer.from(Array.from(bs58.decode(raw)));
  } catch {
    return null;
  }
  if (program === AMM_V4.toBase58()) {
    const hit = RAYDIUM_AMM_V4[data[0]];
    return hit ? { kind: hit[0], protocol: 'raydium/amm', program, instruction: hit[1] } : null;
  }
  const v = ANCHOR_VENUES[program];
  if (!v || data.length < 8) return null;
  const hit = v.byDisc.get(data.subarray(0, 8).toString('hex'));
  return hit ? { kind: hit[0], protocol: v.protocol, program, instruction: hit[1] } : null;
}

function* everyInstruction(tx: ParsedTransactionWithMeta): Generator<AnyInstruction> {
  for (const ix of tx.transaction.message.instructions) yield ix;
  for (const inner of tx.meta?.innerInstructions ?? []) for (const ix of inner.instructions) yield ix;
}

const rank = (kind: ActivityKind) => ACTIVITY_KINDS.indexOf(kind);

/** Units of a raw amount as a decimal string, without floating point. */
function units(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const s = abs.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** What the wallet's own balances did, token by token, SOL included. */
function balanceChanges(
  tx: ParsedTransactionWithMeta,
  wallet: string,
): { mint: string; decimals: number; raw: bigint }[] {
  const meta = tx.meta!;
  const keys = tx.transaction.message.accountKeys;
  const byMint = new Map<string, { decimals: number; raw: bigint }>();
  const bump = (mint: string, decimals: number, delta: bigint) => {
    const cur = byMint.get(mint) ?? { decimals, raw: 0n };
    cur.raw += delta;
    byMint.set(mint, cur);
  };
  // What the wallet owns after, less what it owned before. Each side is read with its own
  // owner, so an account created, closed, or handed to another owner counts correctly.
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner === wallet) bump(b.mint, b.uiTokenAmount.decimals, BigInt(b.uiTokenAmount.amount));
  }
  for (const p of meta.preTokenBalances ?? []) {
    if (p.owner === wallet) bump(p.mint, p.uiTokenAmount.decimals, -BigInt(p.uiTokenAmount.amount));
  }
  const index = keys.findIndex((k) => k.pubkey.toBase58() === wallet);
  if (index >= 0) {
    let lamports = BigInt(meta.postBalances[index]) - BigInt(meta.preBalances[index]);
    // The fee is reported on its own; counted here, a fee-only transaction
    // would read as a withdrawal of "-0.000005 SOL".
    if (index === 0) lamports += BigInt(meta.fee);
    if (lamports !== 0n) bump('SOL', 9, lamports);
  }
  return [...byMint.entries()]
    .filter(([, v]) => v.raw !== 0n)
    .map(([mint, v]) => ({ mint, decimals: v.decimals, raw: v.raw }));
}

/**
 * A transaction with no venue moved money by itself. Tokens decide the direction when
 * any moved: receiving a token often costs SOL for its new account, and that rent is
 * not a withdrawal. SOL and wrapped SOL moving opposite ways is a wrap or an unwrap,
 * which is neither. Otherwise the direction is the sign of what moved.
 */
function transferKind(raw: { mint: string; raw: bigint }[]): ActivityKind {
  const native = NATIVE_MINT.toBase58();
  const tokens = raw.filter((c) => c.mint !== 'SOL' && c.mint !== native);
  if (tokens.length > 0) {
    if (tokens.every((c) => c.raw > 0n)) return 'deposit';
    if (tokens.every((c) => c.raw < 0n)) return 'withdraw';
    return 'other';
  }
  const sol = raw.find((c) => c.mint === 'SOL')?.raw ?? 0n;
  const wrapped = raw.find((c) => c.mint === native)?.raw ?? 0n;
  if (sol !== 0n && wrapped !== 0n && sol > 0n !== wrapped > 0n) return 'other';
  const net = sol + wrapped;
  return net > 0n ? 'deposit' : net < 0n ? 'withdraw' : 'other';
}

export function readActivity(
  tx: ParsedTransactionWithMeta,
  wallet: string,
  signature: ConfirmedSignatureInfo,
): Omit<ActivityEntry, 'changes'> & { raw: { mint: string; decimals: number; raw: bigint }[] } {
  const actions: ActivityAction[] = [];
  const seen = new Set<string>();
  for (const ix of everyInstruction(tx)) {
    const a = classify(ix);
    if (!a) continue;
    const key = `${a.program}:${a.instruction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(a);
  }
  const raw = tx.meta ? balanceChanges(tx, wallet) : [];
  let kind: ActivityKind = 'other';
  let protocol: string | null = null;
  if (actions.length > 0) {
    const top = [...actions].sort((a, b) => rank(a.kind) - rank(b.kind))[0];
    kind = top.kind;
    protocol = top.protocol;
  } else if (raw.length > 0) {
    kind = transferKind(raw);
  }
  return {
    signature: signature.signature,
    slot: signature.slot,
    blockTime: signature.blockTime ?? null,
    ok: !signature.err,
    kind,
    protocol,
    actions,
    raw,
    feeLamports: tx.meta?.fee ?? null,
  };
}

export interface ActivityPage {
  address: string;
  transactions: ActivityEntry[];
  /** Signatures inspected — the window, so "these are the last N" rather than "all". */
  scanned: number;
  /** Hand back as `before` for the page after this one. */
  cursor: string | null;
}

/**
 * The wallet's recent activity, newest first.
 *
 * One signature listing, then the transactions behind it, five at a time.
 * `symbolOf` is the caller's token list, asked once per distinct mint.
 */
export async function walletActivity(
  connection: Connection,
  address: string,
  opts: { limit: number; before?: string; includeOther?: boolean },
  symbolOf: (mint: string) => Promise<string | null>,
): Promise<ActivityPage> {
  const wallet = new PublicKey(address);
  const signatures = await connection.getSignaturesForAddress(wallet, { limit: opts.limit, before: opts.before });
  // One read per signature, a few at a time. Not the batched call: not every
  // RPC honours a JSON-RPC batch (some local validators do not), and a page of
  // twenty-five is small enough that five in flight is quick everywhere.
  const txs: (ParsedTransactionWithMeta | null)[] = [];
  for (let i = 0; i < signatures.length; i += 5) {
    const chunk = signatures.slice(i, i + 5);
    txs.push(
      ...(await Promise.all(
        chunk.map((s) => connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 })),
      )),
    );
  }
  const symbols = new Map<string, string | null>();
  const symbol = async (mint: string) => {
    if (mint === 'SOL' || mint === NATIVE_MINT.toBase58()) return 'SOL';
    if (!symbols.has(mint)) symbols.set(mint, await symbolOf(mint));
    return symbols.get(mint) ?? null;
  };
  const out: ActivityEntry[] = [];
  for (let i = 0; i < signatures.length; i++) {
    const tx = txs[i];
    if (!tx) continue;
    const read = readActivity(tx, address, signatures[i]);
    if (read.kind === 'other' && !opts.includeOther) continue;
    const changes: ActivityChange[] = [];
    for (const c of read.raw) {
      changes.push({
        mint: c.mint,
        symbol: await symbol(c.mint),
        decimals: c.decimals,
        amount: units(c.raw, c.decimals),
      });
    }
    const { raw: _raw, ...entry } = read;
    out.push({ ...entry, changes });
  }
  return {
    address,
    transactions: out,
    scanned: signatures.length,
    cursor: signatures.length === opts.limit ? signatures[signatures.length - 1].signature : null,
  };
}
