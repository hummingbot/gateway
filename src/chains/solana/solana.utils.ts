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
 * Lamports held by `account` in a confirmed transaction, before or after it ran.
 *
 * Used to report position rent: an account's pre-balance at close is exactly the
 * rent that comes back to the wallet, and its post-balance at open is the rent it
 * now holds. Resolving the index through `getAccountKeys` with the transaction's
 * loaded addresses keeps this correct for versioned transactions too, where an
 * account may come from an address-lookup table rather than the static keys, while
 * `preBalances`/`postBalances` are indexed over the combined list.
 *
 * Returns SOL, not lamports — the raw balances are lamports and this divides them, so
 * the result is directly comparable to the token amounts the routes report. Named for
 * the unit it returns because callers subtract it from those amounts, where being out
 * by 1e9 would be silent.
 *
 * Returns null when the account took no part in the transaction, so a caller can
 * tell "no rent moved" apart from "a zero balance".
 */
export function accountBalanceSol(txData: any, account: PublicKey, when: 'pre' | 'post'): number | null {
  const balances: number[] = (when === 'pre' ? txData?.meta?.preBalances : txData?.meta?.postBalances) ?? [];
  if (!balances.length) return null;

  let keys;
  try {
    keys = txData.transaction.message.getAccountKeys({
      accountKeysFromLookups: txData.meta?.loadedAddresses,
    });
  } catch {
    // A versioned message whose lookups were not returned cannot resolve its full
    // key list; the static keys still cover every account a legacy transaction has.
    keys = txData.transaction.message.getAccountKeys();
  }

  for (let i = 0; i < balances.length; i++) {
    if (keys.get(i)?.equals(account)) return balances[i] / 1e9;
  }
  return null;
}

/**
 * The liquidity in a wallet balance change, with position rent taken out of it.
 *
 * When a pool side IS the native token, the wallet's balance change for that side
 * carries the position rent as well as the liquidity: on the way in the rent was locked
 * alongside the deposit, on the way out it came back alongside the withdrawal. Rent is
 * not liquidity and not a cost — the chain returns it when the position account closes —
 * so reporting the raw change overstates what the position holds, by the rent. On a small
 * position that is the larger of the two numbers.
 *
 * Both directions use this, with the rent locked at open and the rent refunded at close;
 * the arithmetic is the same because the sign is taken off first. A non-native side never
 * carries rent, so it passes through as a magnitude.
 *
 * Clamps at zero: a native change smaller than the rent means the rent dominated the
 * transaction, and "nothing was deposited" is the truthful reading of that. A negative
 * amount would be the arithmetic leaking into a field that means a quantity of tokens.
 *
 * `rent` must be in SOL, as `accountBalanceSol` returns it — the change is denominated in
 * tokens, so a lamport figure here would clamp every native side to zero in silence.
 */
export function liquidityWithoutRent(change: number, mint: PublicKey, rent: number): number {
  return mint.equals(NATIVE_MINT) ? Math.max(0, Math.abs(change) - rent) : Math.abs(change);
}
