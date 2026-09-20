import * as fs from 'fs';
import * as path from 'path';

import { NATIVE_MINT } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';

import { rootPath } from '../../paths';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

/**
 * Get the default Solana network from config
 */
export function getDefaultSolanaNetwork(): string {
  return ConfigManagerV2.getInstance().get('solana.defaultNetwork');
}

/**
 * Get the default Solana wallet from config
 */
export function getDefaultSolanaWallet(): string {
  return ConfigManagerV2.getInstance().get('solana.defaultWallet');
}

/**
 * Get Solana network config value
 */
export function getSolanaNetworkConfig(network: string, key: string): any {
  return ConfigManagerV2.getInstance().get(`solana-${network}.${key}`);
}

/**
 * Get Solana chain config value
 */
export function getSolanaChainConfig(key: string): any {
  return ConfigManagerV2.getInstance().get(`solana.${key}`);
}

/**
 * Get available Solana networks from template files
 */
export function getAvailableSolanaNetworks(): string[] {
  const networksPath = path.join(rootPath(), 'dist/src/templates/chains/solana');

  try {
    const files = fs.readdirSync(networksPath);
    return files.filter((file) => file.endsWith('.yml')).map((file) => file.replace('.yml', ''));
  } catch (error) {
    // Fallback to hardcoded list if directory doesn't exist
    return ['mainnet-beta', 'devnet'];
  }
}

/**
 * The SOL a transaction moved because accounts opened or closed, rather than because
 * liquidity did.
 *
 * Opening a position creates several accounts and every one of them is rent-bearing: on
 * DAMM v2 the position, the position NFT's mint and that mint's token account; on a
 * PancakeSwap/Raydium CLMM the position, its NFT account, the shared protocol position
 * and any tick array the range is the first to touch. All of it is funded by the wallet
 * paying for the transaction, so all of it sits inside that wallet's native balance
 * change — and none of it is liquidity. Closing gives the same lamports back the same
 * way. Subtracting only the position account's own rent, which is what these routes used
 * to do, left every other account's rent inside the reported deposit or withdrawal.
 *
 * `opened` and `closed` are the totals to take out of a native-side balance change.
 * `rentLocked` and `rentRefunded` are the rent halves of those totals, and are what a
 * route should report as `positionRent` / `positionRentRefunded`.
 *
 * The two differ for exactly one kind of account: a wrapped-SOL token account carries a
 * balance as well as its rent. When a close unwraps one, the lamports that come back are
 * its rent *plus* whatever WSOL it already held before the transaction — someone else's
 * money as far as this position is concerned. Taking the whole pre-balance out of the
 * change is what leaves the true withdrawal behind; calling the whole thing rent would
 * not be true.
 *
 * An account that both opens and closes within the same transaction — a WSOL account
 * created to receive a withdrawal and unwrapped in the same breath — is neither, and is
 * correctly ignored: its lamports never left the wallet.
 *
 * Reads only the balance arrays and the token balances, both of which `getTransaction`
 * and `getParsedTransaction` return in the same shape, so it works on either.
 * Returns SOL, like everything else here that feeds `liquidityWithoutRent`.
 */
export interface AccountLifecycleSol {
  /** Lamports, in SOL, locked into accounts this transaction created. */
  opened: number;
  /** Lamports, in SOL, returned by accounts this transaction closed. */
  closed: number;
  /** The rent share of `opened` — everything but wrapped SOL already held. */
  rentLocked: number;
  /** The rent share of `closed`. */
  rentRefunded: number;
}

export function accountLifecycleSol(txData: any): AccountLifecycleSol {
  const pre: number[] = txData?.meta?.preBalances ?? [];
  const post: number[] = txData?.meta?.postBalances ?? [];

  const wrapped = (balances: any[]): Record<number, number> => {
    const byIndex: Record<number, number> = {};
    for (const balance of balances ?? []) {
      if (balance?.mint !== NATIVE_MINT.toBase58()) continue;
      // WSOL has 9 decimals, so its raw amount is denominated in lamports already.
      byIndex[balance.accountIndex] = Number(balance.uiTokenAmount?.amount ?? 0);
    }
    return byIndex;
  };
  const preWrapped = wrapped(txData?.meta?.preTokenBalances);
  const postWrapped = wrapped(txData?.meta?.postTokenBalances);

  let opened = 0;
  let closed = 0;
  let rentLocked = 0;
  let rentRefunded = 0;

  for (let i = 0; i < Math.min(pre.length, post.length); i++) {
    if (pre[i] === 0 && post[i] > 0) {
      opened += post[i];
      rentLocked += post[i] - (postWrapped[i] ?? 0);
    } else if (pre[i] > 0 && post[i] === 0) {
      closed += pre[i];
      rentRefunded += pre[i] - (preWrapped[i] ?? 0);
    }
  }

  return {
    opened: opened / 1e9,
    closed: closed / 1e9,
    rentLocked: rentLocked / 1e9,
    rentRefunded: rentRefunded / 1e9,
  };
}

/**
 * Token amounts moved by each top-level instruction of one program, in order.
 *
 * The reason this exists rather than the grouping in `orca.utils`: that one drops an
 * instruction that moved nothing, so a caller cannot tell "the first instruction
 * collected zero fees" from "the first group IS the principal". Position matters here —
 * a close sends collect-then-decrease and reads the two by their place — so every
 * matching instruction gets a row, zero-filled.
 *
 * Reads a parsed transaction (`getParsedTransaction`), which is what
 * `extractBalanceChangesAndFee` already fetches. Amounts are returned per requested
 * mint, in the order the mints were given, in UI units.
 *
 * Returns an empty array when the transaction carries no parsed inner instructions,
 * which a caller must treat as "unknown", never as "nothing moved".
 */
export function transfersByProgramInstruction(parsedTx: any, programId: string, mints: string[]): number[][] {
  const inner = parsedTx?.meta?.innerInstructions ?? [];
  const outer = parsedTx?.transaction?.message?.instructions ?? [];
  if (!inner.length || !outer.length) return [];

  const decimalsByMint: Record<string, number> = {};
  const mintByAccount: Record<string, string> = {};
  for (const balance of [...(parsedTx.meta?.preTokenBalances ?? []), ...(parsedTx.meta?.postTokenBalances ?? [])]) {
    const account = parsedTx.transaction.message.accountKeys?.[balance.accountIndex]?.pubkey?.toString();
    if (account && balance.mint) mintByAccount[account] = balance.mint;
    if (balance.mint && balance.uiTokenAmount?.decimals !== undefined) {
      decimalsByMint[balance.mint] = balance.uiTokenAmount.decimals;
    }
  }

  const rows: number[][] = [];
  for (let index = 0; index < outer.length; index++) {
    if (outer[index]?.programId?.toString() !== programId) continue;

    const amounts = mints.map(() => 0);
    for (const instruction of inner.find((block: any) => block.index === index)?.instructions ?? []) {
      const parsed = instruction.parsed;
      if (!parsed) continue;

      let mint: string | undefined;
      let raw: string | undefined;
      let decimals: number | undefined;
      if (parsed.type === 'transferChecked' && parsed.info) {
        mint = parsed.info.mint;
        raw = parsed.info.tokenAmount?.amount;
        decimals = parsed.info.tokenAmount?.decimals;
      } else if (parsed.type === 'transfer' && parsed.info) {
        raw = parsed.info.amount;
        mint = mintByAccount[parsed.info.source] ?? mintByAccount[parsed.info.destination];
      }
      if (!mint || raw === undefined) continue;

      const position = mints.indexOf(mint);
      if (position === -1) continue;
      amounts[position] += Number(raw) / 10 ** (decimals ?? decimalsByMint[mint] ?? 0);
    }
    rows.push(amounts);
  }
  return rows;
}

/**
 * The liquidity in a wallet balance change, with the account lamports taken out of it.
 *
 * When a pool side IS the native token, the wallet's balance change for that side carries
 * the position's rent as well as the liquidity: on the way in it was locked alongside the
 * deposit, on the way out it came back alongside the withdrawal. Rent is not liquidity and
 * not a cost — the chain returns it when the accounts close — so reporting the raw change
 * overstates what the position holds. On a small position that is the larger of the two
 * numbers.
 *
 * Both directions use this, with `accountLifecycleSol().opened` at open and `.closed` at
 * close; the arithmetic is the same because the sign is taken off first. Those totals
 * rather than the rent halves, because a wrapped-SOL account closing also hands back a
 * balance the wallet already held, which is no more this position's liquidity than its
 * rent is. A non-native side never carries either, so it passes through as a magnitude.
 *
 * Clamps at zero: a native change smaller than what the accounts moved means they
 * dominated the transaction, and "nothing was deposited" is the truthful reading of that.
 * A negative amount would be the arithmetic leaking into a field that means a quantity of
 * tokens.
 *
 * `accountSol` must be in SOL, as `accountLifecycleSol` returns it — the change is
 * denominated in tokens, so a lamport figure here would clamp every native side to zero
 * in silence.
 */
export function liquidityWithoutRent(change: number, mint: PublicKey, accountSol: number): number {
  return mint.equals(NATIVE_MINT) ? Math.max(0, Math.abs(change) - accountSol) : Math.abs(change);
}
