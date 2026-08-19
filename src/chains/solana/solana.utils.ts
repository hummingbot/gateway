import * as fs from 'fs';
import * as path from 'path';

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
 * Returns null when the account took no part in the transaction, so a caller can
 * tell "no rent moved" apart from "zero lamports".
 */
export function accountLamports(txData: any, account: PublicKey, when: 'pre' | 'post'): number | null {
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
