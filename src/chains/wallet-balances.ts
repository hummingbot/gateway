import { BalanceResponseType } from '../schemas/chain-schema';

/**
 * One balance of a wallet, as a chain reads it.
 *
 * `key` is the name it has in the response's `balances` map, and it follows the request: a
 * token asked for by its address is keyed by that address exactly as sent, one asked for by
 * symbol by the token list's symbol. `symbol` and `address` say which token it is, whatever
 * it was asked for as. `symbol` is the token's symbol where it is known (the token list, or
 * on EVM chains the contract) and null otherwise; `address` is null for the chain's native
 * currency. Both are null for a name that is neither a known symbol nor a token address.
 */
export interface WalletTokenBalance {
  key: string;
  symbol: string | null;
  address: string | null;
  balance: number;
}

export type ReportBalance = (key: string, symbol: string | null, address: string | null, balance: number) => void;

export const balancesByKey = (entries: WalletTokenBalance[]): Record<string, number> =>
  Object.fromEntries(entries.map((entry) => [entry.key, entry.balance]));

/** The balances route's answer: the map clients have always read, and each entry's identity. */
export const balanceResponse = (entries: WalletTokenBalance[]): BalanceResponseType => ({
  balances: balancesByKey(entries),
  tokens: entries
    .filter((entry) => entry.symbol !== null || entry.address !== null)
    .map(({ key, symbol, address, balance }) => ({ key, symbol, address, balance })),
});
