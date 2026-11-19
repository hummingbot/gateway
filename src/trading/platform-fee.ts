/**
 * A platform fee on a build: a share of what the caller trades or deposits, paid in the
 * same transaction to a recipient the caller names — a wallet, or a program address that
 * owns its token accounts.
 *
 * `recipient` is an OWNER, never a token account: Gateway derives the owner's
 * associated account for the fee mint and creates it idempotently, so a recipient that
 * has never held the mint is paid all the same. Native SOL (and wSOL) is paid as
 * lamports straight to the recipient.
 *
 * Where it applies (all build routes):
 * - router `build-quote` (Jupiter): Jupiter takes `platformFeeBps` of the input into
 *   `feeAccount`, the recipient's account for the input mint, created first;
 * - pool (`amm`/`clmm`) and launch-curve `build-swap`: a transfer of `bps` of the quoted
 *   input amount, in the input token, after the swap;
 * - `clmm` `build-open`/`build-add` and `amm` `build-add`: a transfer of `bps` of the
 *   deposit's value in the pool's QUOTE token, `quoteAmount + baseAmount × price`, with
 *   the pool's price read at build time.
 *
 * Every fee rounds down, in raw units.
 */
import { Static, Type } from '@sinclair/typebox';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { Decimal } from 'decimal.js';

import { PlatformInstructions } from '../chains/solana/solana-build-mode';
import { httpErrors } from '../services/error-handler';
import { quoteCache } from '../services/quote-cache';

import { isSolanaRouter } from './connector-registry';

export const PlatformFeeSchema = Type.Object(
  {
    bps: Type.Integer({ minimum: 1, maximum: 10_000, description: 'the fee, in basis points' }),
    recipient: Type.String({
      description:
        "the fee's OWNER (a wallet or a program address, not a token account): Gateway pays its associated " +
        'account for the fee mint, created if missing, or its lamports for SOL',
    }),
  },
  { additionalProperties: false },
);
export type PlatformFee = Static<typeof PlatformFeeSchema>;

export const platformFeeField = (description: string) =>
  Type.Optional(Type.Object(PlatformFeeSchema.properties, { additionalProperties: false, description }));

/** `bps` of a raw amount, rounded down. */
export function platformFeeRaw(amountRaw: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) {
    throw httpErrors.badRequest(`platformFee.bps must be a whole number from 1 to 10000 (got ${bps})`);
  }
  if (amountRaw < 0n) throw httpErrors.badRequest(`A platform fee is taken of a positive amount (got ${amountRaw})`);
  return (amountRaw * BigInt(bps)) / 10_000n;
}

/** A UI amount in raw units of `decimals`, rounded down. */
export function uiToRaw(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpErrors.badRequest(`A platform fee is taken of a positive amount (got ${amount})`);
  }
  return BigInt(new Decimal(amount).mul(Decimal.pow(10, decimals)).floor().toFixed());
}

/** A deposit's value in the pool's quote token: `quoteAmount + baseAmount × price`. */
export function lpDepositValue(baseAmount: number | undefined, quoteAmount: number | undefined, price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw httpErrors.internalServerError(`The pool's price is ${price}; a deposit cannot be valued for its fee`);
  }
  return new Decimal(quoteAmount ?? 0).add(new Decimal(baseAmount ?? 0).mul(price)).toNumber();
}

/** What a build echoes of the fee it carries (BuildTransactionResponse.platformFee). */
export interface ChargedPlatformFee {
  bps: number;
  /** UI decimal string of `mint`, exactly the raw amount built. */
  amount: string;
  mint: string;
  symbol: string;
}

/** The slice of `Solana` a fee needs: its RPC, and its token list for the fee's symbol. */
export interface FeeChain {
  connection: Connection;
  getToken(mint: string): Promise<{ symbol: string } | null>;
}

/** A raw amount as a UI decimal string. */
export function rawToUi(raw: bigint, decimals: number): string {
  return new Decimal(raw.toString()).div(Decimal.pow(10, decimals)).toFixed();
}

/** The fee as a build echoes it, the symbol read from the chain. */
export async function chargedFee(
  chain: FeeChain,
  mint: PublicKey,
  raw: bigint,
  decimals: number,
  bps: number,
): Promise<ChargedPlatformFee> {
  const address = mint.toBase58();
  const token = await chain.getToken(address);
  return { bps, amount: rawToUi(raw, decimals), mint: address, symbol: token ? token.symbol : address };
}

export function toPublicKey(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(`Invalid ${field}: ${value}`);
  }
}

/** The token program that owns `mint`, and its decimals. */
export async function mintInfo(
  connection: Connection,
  mint: PublicKey,
): Promise<{ program: PublicKey; decimals: number }> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw httpErrors.badRequest(`Fee mint ${mint.toBase58()} does not exist`);
  if (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw httpErrors.badRequest(
      `Fee mint ${mint.toBase58()} is owned by ${info.owner.toBase58()}, not a token program`,
    );
  }
  const m = await getMint(connection, mint, 'confirmed', info.owner);
  return { program: info.owner, decimals: m.decimals };
}

/** The recipient's associated account for `mint` and the idempotent create that makes sure it exists. */
export function recipientAccount(payer: PublicKey, recipient: PublicKey, mint: PublicKey, program: PublicKey) {
  const account = getAssociatedTokenAddressSync(mint, recipient, true, program);
  return {
    account,
    create: createAssociatedTokenAccountIdempotentInstruction(payer, account, recipient, mint, program),
  };
}

/**
 * Pay `amountRaw` of `mint` from `payer` to `recipient`: lamports for SOL/wSOL, else the
 * recipient's associated account (created idempotently) by `transferChecked` from the
 * payer's own. Nothing for a zero fee.
 */
export async function platformFeeInstructions(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  amountRaw: bigint,
  recipient: PublicKey,
): Promise<TransactionInstruction[]> {
  if (amountRaw === 0n) return [];
  if (mint.equals(NATIVE_MINT)) {
    return [SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: amountRaw })];
  }
  const { program, decimals } = await mintInfo(connection, mint);
  const { account, create } = recipientAccount(payer, recipient, mint, program);
  const source = getAssociatedTokenAddressSync(mint, payer, true, program);
  return [create, createTransferCheckedInstruction(source, mint, account, payer, amountRaw, decimals, [], program)];
}

/**
 * The fee on a UI amount of `mint` (`bps`, rounded down in raw units), as instructions
 * appended after the operation, and as the build echoes it.
 */
export async function appendedPlatformFee(
  chain: FeeChain,
  payer: PublicKey,
  mint: PublicKey,
  amount: number,
  fee: PlatformFee,
): Promise<{ platform: PlatformInstructions; charged: ChargedPlatformFee }> {
  const decimals = mint.equals(NATIVE_MINT) ? 9 : (await mintInfo(chain.connection, mint)).decimals;
  const raw = platformFeeRaw(uiToRaw(amount, decimals), fee.bps);
  const append = await platformFeeInstructions(
    chain.connection,
    payer,
    mint,
    raw,
    toPublicKey(fee.recipient, 'platformFee.recipient'),
  );
  return { platform: { prepend: [], append }, charged: await chargedFee(chain, mint, raw, decimals, fee.bps) };
}

/**
 * Record, beside a non-Jupiter router's cached quote, what its platform fee is charged
 * on: the bps asked at quote time and the quote's input token and amount. Jupiter
 * prices the fee into its own route; every other Solana router is charged the way a
 * pool swap is — a transfer after the trade — which its build reads back from here.
 */
export function recordRouterFeeQuote(
  connector: string,
  quote: { quoteId: string; tokenIn: string; amountIn: number },
  bps: number,
): void {
  if (connector === 'jupiter') return;
  const request = quoteCache.getRequest(quote.quoteId, connector);
  const cached = quoteCache.get(quote.quoteId, connector);
  if (!request || !cached) throw httpErrors.internalServerError(`Quote ${quote.quoteId} was not cached`);
  quoteCache.set(quote.quoteId, connector, cached, {
    ...request,
    platformFeeBps: bps,
    feeTokenIn: quote.tokenIn,
    feeAmountIn: quote.amountIn,
  });
}

/**
 * A router quote's platform fee, for its build. The quote must have been made with
 * `platformFeeBps` equal to `fee.bps`.
 *
 * - **Jupiter** prices the fee into the route and takes it into `feeAccount`, the
 *   recipient's account for the input mint, which is created first so it exists when
 *   the swap pays it. The echoed amount is `floor(inAmount × bps / 10000)` of the input
 *   mint — the fee Jupiter takes from the input when its fee account is on the input
 *   mint. Jupiter's own `platformFee.amount` in the quote is not used: Jupiter prices it
 *   before it knows the fee account, against the OUTPUT mint for an ExactIn quote.
 * - **Any other Solana router** (Pump's curve and pool, …): a transfer of `bps` of the
 *   quoted input, in the input token, after the trade — as a pool swap is charged —
 *   from what `recordRouterFeeQuote` kept at quote time. No `feeAccount`.
 */
export async function routerPlatformFee(
  connector: string,
  chain: FeeChain,
  walletAddress: string,
  quoteId: string,
  fee: PlatformFee,
): Promise<{ feeAccount?: string; platform: PlatformInstructions; charged: ChargedPlatformFee }> {
  const connection = chain.connection;
  assertRouterPlatformFee(connector);
  const request = quoteCache.getRequest(quoteId, connector);
  const quote = quoteCache.get(quoteId, connector);
  if (!request || !quote) throw httpErrors.badRequest('Quote not found or expired');
  if (request.platformFeeBps !== fee.bps) {
    throw httpErrors.badRequest(
      `Quote ${quoteId} was made with platformFeeBps ${request.platformFeeBps ?? 'unset'}; ` +
        `platformFee.bps is ${fee.bps}. Quote again with platformFeeBps=${fee.bps}`,
    );
  }
  if (connector !== 'jupiter') {
    return appendedPlatformFee(
      chain,
      toPublicKey(walletAddress, 'walletAddress'),
      toPublicKey(request.feeTokenIn, 'quote tokenIn'),
      Number(request.feeAmountIn),
      fee,
    );
  }
  const inputMint = toPublicKey(quote.inputMint, 'quote inputMint');
  const { program, decimals } = await mintInfo(connection, inputMint);
  if (quote.inAmount === undefined) throw httpErrors.internalServerError(`Quote ${quoteId} has no inAmount`);
  const raw = platformFeeRaw(BigInt(quote.inAmount), fee.bps);
  const { account, create } = recipientAccount(
    toPublicKey(walletAddress, 'walletAddress'),
    toPublicKey(fee.recipient, 'platformFee.recipient'),
    inputMint,
    program,
  );
  return {
    feeAccount: account.toBase58(),
    platform: { prepend: [create], append: [] },
    charged: await chargedFee(chain, inputMint, raw, decimals, fee.bps),
  };
}

/** A platform fee is charged on Solana routers: Jupiter in its route, the others by a transfer. */
export function assertRouterPlatformFee(connector: string): void {
  if (!isSolanaRouter(connector)) {
    throw httpErrors.badRequest(`platformFee is supported on Solana routers only, not ${connector}`);
  }
}

/**
 * A deposit's platform fee: `bps` of its value in the pool's quote token,
 * `quoteAmount + baseAmount × price`, with `price` the pool's (quote per base) as read
 * at build time. Paid in the quote token after the deposit.
 */
export async function lpPlatformFee(
  chain: FeeChain,
  walletAddress: string,
  pool: { quoteTokenAddress: string; price: number },
  baseAmount: number | undefined,
  quoteAmount: number | undefined,
  fee: PlatformFee,
): Promise<{ platform: PlatformInstructions; charged: ChargedPlatformFee }> {
  return appendedPlatformFee(
    chain,
    toPublicKey(walletAddress, 'walletAddress'),
    toPublicKey(pool.quoteTokenAddress, "the pool's quote token"),
    lpDepositValue(baseAmount, quoteAmount, Number(pool.price)),
    fee,
  );
}
