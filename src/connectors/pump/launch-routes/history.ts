/**
 * A pump.fun token's on-chain history, for accounting a launch: its creation,
 * every trade on its bonding curve and on its canonical PumpSwap pool, and —
 * for one wallet — what each of those transactions moved in and out of it.
 *
 * Trades are read from the programs' self-CPI events (`emit_cpi!`), which
 * cannot be truncated the way log lines can: pump's TradeEvent (curve) and
 * PumpSwap's buy/sell events (pool). Each carries the creator fee it paid, so
 * the fees a coin earned its creator are summed per coin even though pump's
 * creator vault pools them across all of a creator's coins.
 */
import { BorshCoder, Idl } from '@coral-xyz/anchor';
import { PUMP_AMM_PROGRAM_ID, PUMP_PROGRAM_ID, pumpIdl } from '@pump-fun/pump-sdk';
import { getPumpAmmProgram } from '@pump-fun/pump-swap-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { ConfirmedSignatureInfo, PublicKey, VersionedTransactionResponse } from '@solana/web3.js';
import bs58 from 'bs58';

import { httpErrors } from '../../../services/error-handler';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pump } from '../pump';

/** sha256("anchor:event")[..8]: the prefix of an Anchor self-CPI event. */
const EVENT_IX_TAG = Buffer.from('e445a52e51cb9a1d', 'hex');
const PAGE = 1000;
const FETCH_BATCH = 50;

export interface LaunchTrade {
  venue: 'curve' | 'pumpswap';
  side: 'BUY' | 'SELL';
  user: string;
  /** Tokens bought or sold (UI units). */
  baseAmount: number;
  /** SOL (or the curve's quote) the trader paid in or got out, fees included (UI units). */
  quoteAmount: number;
  creator: string;
  /** The creator's cut of this trade (UI units of the quote). */
  creatorFee: number;
}

export interface LaunchTransaction {
  signature: string;
  blockTime: number | null;
  /** 'create' for the launch itself (a dev buy in it is also listed as a trade). */
  kind: 'create' | 'trade' | 'migrate' | 'other';
  trades: LaunchTrade[];
  /** Present when the wallet asked about is an account of this transaction. */
  wallet?: {
    /** Net SOL change, native plus wrapped (UI units): what left or reached the wallet, fees and rent included. */
    quoteChange: number;
    /** Net change of the wallet's balance of this token (UI units). */
    tokenChange: number;
    /** True when the wallet signed (paid the fee). */
    signer: boolean;
  };
}

export interface LaunchHistory {
  mint: string;
  creator: string;
  pumpswapPool: string;
  /** Oldest first. */
  transactions: LaunchTransaction[];
  /** False when maxTransactions cut the history short (the oldest are then missing). */
  complete: boolean;
}

const bn = (v: any): number => Number(v?.toString?.() ?? v);

function cpiEvents(
  tx: VersionedTransactionResponse,
  keys: PublicKey[],
  program: PublicKey,
  coder: BorshCoder,
): { name: string; data: any }[] {
  const out: { name: string; data: any }[] = [];
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      if (!keys[ix.programIdIndex]?.equals(program)) continue;
      const raw = Buffer.from(Uint8Array.from(bs58.decode(ix.data)));
      if (raw.length < 16 || !EVENT_IX_TAG.equals(Uint8Array.from(raw.subarray(0, 8)))) continue;
      const event = coder.events.decode(raw.subarray(8).toString('base64'));
      if (event) out.push(event);
    }
  }
  return out;
}

function walletChange(
  tx: VersionedTransactionResponse,
  keys: PublicKey[],
  wallet: PublicKey,
  mint: string,
  quoteDecimals: number,
): LaunchTransaction['wallet'] | undefined {
  const index = keys.findIndex((k) => k.equals(wallet));
  if (index < 0 || !tx.meta) return undefined;
  const owner = wallet.toBase58();
  const tokenDelta = (m: string) => {
    const sum = (list: typeof tx.meta.preTokenBalances) =>
      (list ?? [])
        .filter((b) => b.owner === owner && b.mint === m)
        .reduce((s, b) => s + Number(b.uiTokenAmount.uiAmountString ?? 0), 0);
    return sum(tx.meta!.postTokenBalances) - sum(tx.meta!.preTokenBalances);
  };
  const lamports = (tx.meta.postBalances[index] - tx.meta.preBalances[index]) / 10 ** quoteDecimals;
  return {
    quoteChange: lamports + tokenDelta(NATIVE_MINT.toBase58()),
    tokenChange: tokenDelta(mint),
    signer: index < tx.transaction.message.header.numRequiredSignatures,
  };
}

export async function getLaunchHistory(
  network: string,
  baseMint: string,
  walletAddress: string | undefined,
  maxTransactions: number,
): Promise<LaunchHistory> {
  let mint: PublicKey;
  let wallet: PublicKey | undefined;
  try {
    mint = new PublicKey(baseMint);
    wallet = walletAddress ? new PublicKey(walletAddress) : undefined;
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage('Invalid address: {}', `${baseMint} / ${walletAddress}`));
  }
  const pump = await Pump.getInstance(network);
  const connection = pump.solana.connection;
  const state = await pump.getCurveState(mint);
  if (!state.quoteMint.equals(NATIVE_MINT)) {
    throw httpErrors.badRequest('launch history reads SOL-quoted pump curves only');
  }
  const pool = pump.canonicalPoolAddress(mint, state.quoteMint);
  const baseDecimals = 6;
  const quoteDecimals = 9;

  const signatures: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(mint, { before, limit: PAGE });
    signatures.push(...page);
    if (page.length < PAGE || signatures.length >= maxTransactions) break;
    before = page[page.length - 1].signature;
  }
  const complete = signatures.length <= maxTransactions;
  const wanted = signatures
    .slice(0, maxTransactions)
    .filter((s) => !s.err)
    .reverse();

  const pumpCoder = new BorshCoder(pumpIdl as unknown as Idl);
  const ammCoder = new BorshCoder(getPumpAmmProgram(connection).idl as Idl);
  const transactions: LaunchTransaction[] = [];
  for (let i = 0; i < wanted.length; i += FETCH_BATCH) {
    const batch = wanted.slice(i, i + FETCH_BATCH);
    // One call per transaction, a batch at a time: some RPCs refuse JSON-RPC
    // batch requests, which getTransactions sends.
    const fetched = await Promise.all(
      batch.map((s) =>
        connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }),
      ),
    );
    fetched.forEach((tx, j) => {
      if (!tx) {
        throw httpErrors.internalServerError(`Transaction ${batch[j].signature} could not be fetched`);
      }
      const loaded = tx.meta?.loadedAddresses;
      const keys = [
        ...tx.transaction.message.staticAccountKeys,
        ...(loaded?.writable ?? []),
        ...(loaded?.readonly ?? []),
      ];
      const trades: LaunchTrade[] = [];
      let kind: LaunchTransaction['kind'] = 'other';
      for (const e of cpiEvents(tx, keys, PUMP_PROGRAM_ID, pumpCoder)) {
        if (e.name === 'CreateEvent' || e.name === 'createEvent') kind = 'create';
        if (/^(CompletePumpAmmMigrationEvent|completePumpAmmMigrationEvent)$/.test(e.name) && kind !== 'create')
          kind = 'migrate';
        if ((e.name === 'TradeEvent' || e.name === 'tradeEvent') && e.data.mint.equals(mint)) {
          const d = e.data;
          // What the trader pays over the curve's price: the protocol fee and the
          // creator's. The buyback fee is carved out of the protocol fee, not added
          // (a 0.3 SOL buy: 0.296296 + 0.002815 + 0.000889 = 0.300000).
          const fees = bn(d.fee) + bn(d.creator_fee);
          const sol = bn(d.sol_amount);
          trades.push({
            venue: 'curve',
            side: d.is_buy ? 'BUY' : 'SELL',
            user: d.user.toBase58(),
            baseAmount: bn(d.token_amount) / 10 ** baseDecimals,
            quoteAmount: (d.is_buy ? sol + fees : sol - fees) / 10 ** quoteDecimals,
            creator: d.creator.toBase58(),
            creatorFee: bn(d.creator_fee) / 10 ** quoteDecimals,
          });
        }
      }
      for (const e of cpiEvents(tx, keys, PUMP_AMM_PROGRAM_ID, ammCoder)) {
        const d = e.data;
        if (!d.pool?.equals?.(pool)) continue;
        if (e.name === 'buyEvent' || e.name === 'sellEvent') {
          const buy = e.name === 'buyEvent';
          trades.push({
            venue: 'pumpswap',
            side: buy ? 'BUY' : 'SELL',
            user: d.user.toBase58(),
            baseAmount: bn(buy ? d.baseAmountOut : d.baseAmountIn) / 10 ** baseDecimals,
            quoteAmount: bn(buy ? d.userQuoteAmountIn : d.userQuoteAmountOut) / 10 ** quoteDecimals,
            creator: d.coinCreator.toBase58(),
            creatorFee: bn(d.coinCreatorFee) / 10 ** quoteDecimals,
          });
        }
      }
      if (kind === 'other' && trades.length) kind = 'trade';
      transactions.push({
        signature: batch[j].signature,
        blockTime: tx.blockTime ?? null,
        kind,
        trades,
        ...(wallet ? { wallet: walletChange(tx, keys, wallet, mint.toBase58(), quoteDecimals) } : {}),
      });
    });
  }
  return {
    mint: mint.toBase58(),
    creator: state.bondingCurve.creator.toBase58(),
    pumpswapPool: pool.toBase58(),
    transactions,
    complete,
  };
}
