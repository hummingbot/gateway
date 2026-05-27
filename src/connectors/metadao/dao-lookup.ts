/**
 * DAO lookup helper - finds DAO address by baseToken symbol or mint
 */

import * as fs from 'fs';
import * as path from 'path';

interface DaoEntry {
  pool: string;
  baseMint: string;
  quoteMint: string;
  baseSymbol: string;
  quoteSymbol: string;
  state: string;
  totalLiquidity: number;
}

let daosCache: DaoEntry[] | null = null;

function loadDaos(): DaoEntry[] {
  if (daosCache) return daosCache;

  const daosPath = path.join(__dirname, 'daos.json');
  const data = fs.readFileSync(daosPath, 'utf-8');
  daosCache = JSON.parse(data) as DaoEntry[];
  return daosCache;
}

/**
 * Find DAO address by baseToken and optionally quoteToken
 * Returns the DAO with highest liquidity when multiple DAOs match
 * @param baseToken - Token symbol (e.g., "SOLO") or mint address
 * @param quoteToken - Optional quote token symbol (e.g., "USDC") or mint address
 * @returns DAO address or null if not found
 */
export function findDaoByBaseToken(baseToken: string, quoteToken?: string): string | null {
  const daos = loadDaos();

  // Filter function for quote token matching
  const matchesQuote = (d: DaoEntry): boolean => {
    if (!quoteToken) return true;
    return d.quoteSymbol.toLowerCase() === quoteToken.toLowerCase() || d.quoteMint === quoteToken;
  };

  // First try exact base mint address match (most specific)
  const byMint = daos.filter((d) => d.baseMint === baseToken && matchesQuote(d));
  if (byMint.length > 0) {
    return byMint.sort((a, b) => b.totalLiquidity - a.totalLiquidity)[0].pool;
  }

  // Then try symbol match - return DAO with highest liquidity if multiple matches
  const bySymbol = daos
    .filter((d) => d.baseSymbol.toLowerCase() === baseToken.toLowerCase() && matchesQuote(d))
    .sort((a, b) => b.totalLiquidity - a.totalLiquidity);

  if (bySymbol.length > 0) return bySymbol[0].pool;

  return null;
}

/**
 * Find all DAOs matching a baseToken (for cases where multiple DAOs have same symbol)
 * @param baseToken - Token symbol or mint address
 * @returns Array of matching DAO entries
 */
export function findAllDaosByBaseToken(baseToken: string): DaoEntry[] {
  const daos = loadDaos();

  // Match by symbol (case-insensitive) or mint address
  return daos.filter((d) => d.baseSymbol.toLowerCase() === baseToken.toLowerCase() || d.baseMint === baseToken);
}

/**
 * Get DAO entry by address
 * @param daoAddress - DAO public key
 * @returns DAO entry or null if not found
 */
export function getDaoEntry(daoAddress: string): DaoEntry | null {
  const daos = loadDaos();
  return daos.find((d) => d.pool === daoAddress) || null;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearDaoCache(): void {
  daosCache = null;
}
