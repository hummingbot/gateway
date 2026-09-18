import { getEthereumChainConfig } from './ethereum/ethereum.config';
import { getSolanaChainConfig } from './solana/solana.config';

/**
 * The wallet configured as default for a chain, or undefined when none is set.
 *
 * Read per call rather than captured once: /wallet/setDefault writes the chain config at
 * runtime, so anything that resolves this at import time keeps serving the old wallet
 * until Gateway restarts.
 */
export function configuredDefaultWallet(chain: string): string | undefined {
  return chain === 'solana' ? getSolanaChainConfig().defaultWallet : getEthereumChainConfig().defaultWallet;
}
