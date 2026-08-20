/**
 * Record the tokens and pools a caller trades, so Gateway learns them by being used.
 *
 * Gateway resolves a pool by token pair from its configured list, so a pool that is not
 * in that list can only be traded by passing its address every time, and a token that is
 * not in the token list has no symbol to pair by. Both are recoverable from the chain at
 * the moment they are first used, which is what these do.
 *
 * Deliberately chain-only. `/pools/save` and `/tokens/save` read the same facts from
 * GeckoTerminal, which is ~30 calls a minute shared across the whole process and spends
 * up to five of them per pool. Name, symbol and decimals are all on-chain — ERC-20 view
 * calls on Ethereum, the mint plus its metadata account on Solana — so these read the RPC
 * that is already being paid for and no third-party quota is involved.
 *
 * Nothing here fails a caller's request. A swap that worked should not be reported as
 * having failed because a bookkeeping write did not, so every path logs and returns.
 */
import { Ethereum } from '../chains/ethereum/ethereum';
import { Solana } from '../chains/solana/solana';
import { Pool } from '../pools/types';
import { Token } from '../tokens/types';

import { logger } from './logger';
import { PoolService } from './pool-service';
import { TokenService } from './token-service';

/**
 * Run a recording step so that it cannot affect the request that triggered it.
 *
 * The two functions below already handle their own failures, but a route that awaits
 * them would turn any lapse in that — or any future caller that forgets — into a failed
 * swap. The guarantee belongs at the point where a caller is waiting, so it is made here
 * and the routes call through it.
 */
export const recordQuietly = async (work: Promise<unknown>, context: string): Promise<void> => {
  try {
    await work;
  } catch (e: any) {
    logger.warn(`Could not record ${context}: ${e.message}`);
  }
};

/** Pool facts every connector's poolInfo reports, and all a pool record needs. */
export interface PoolFacts {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
}

const fetchFromChain = async (chain: string, network: string, address: string): Promise<Token | null> => {
  if (chain === 'solana') {
    return (await Solana.getInstance(network)).fetchTokenFromChain(address);
  }
  if (chain === 'ethereum') {
    return (await Ethereum.getInstance(network)).fetchTokenFromChain(address);
  }
  return null;
};

/**
 * The token at an address, adding it to the token list if it is not there yet.
 *
 * Returns null when the chain has no name for it. A token cannot be stored without a
 * symbol — the list is keyed by one and pools pair by one — and inventing a placeholder
 * would put a name into the list that no caller would ever ask for, under which the
 * pools built on it would then be filed.
 */
export async function ensureTokenSaved(chain: string, network: string, address: string): Promise<Token | null> {
  const tokenService = TokenService.getInstance();

  const existing = await tokenService.getToken(chain, network, address);
  if (existing) {
    return existing;
  }

  try {
    const token = await fetchFromChain(chain, network, address);
    if (!token) {
      logger.info(`No on-chain metadata for ${address} on ${chain}/${network}; leaving it unlisted`);
      return null;
    }

    // addToken treats a symbol collision as an update and rewrites the existing entry's
    // address, so a token whose on-chain symbol is already taken must not be written:
    // wrapped SOL reports its symbol as "SOL", and saving it would repoint the SOL every
    // other pool in the list pairs against.
    const bySymbol = await tokenService.getToken(chain, network, token.symbol);
    if (bySymbol && bySymbol.address.toLowerCase() !== token.address.toLowerCase()) {
      logger.warn(
        `Not adding ${token.address} on ${chain}/${network}: its on-chain symbol ${token.symbol} is already ` +
          `held by ${bySymbol.address}. Add it under a distinct symbol with POST /tokens if it is wanted.`,
      );
      return null;
    }

    await tokenService.addToken(chain, network, token);
    logger.info(`Learned token ${token.symbol} (${token.address}) on ${chain}/${network} from the chain`);
    return token;
  } catch (e: any) {
    logger.warn(`Could not record token ${address} on ${chain}/${network}: ${e.message}`);
    return null;
  }
}

/**
 * The pool at an address, adding it and its two tokens to Gateway's lists if missing.
 *
 * `fetchPoolInfo` is a thunk rather than a value so a pool that is already known costs
 * one list read and no RPC — which is the common case, since a pool is only unknown the
 * first time it is traded.
 */
export async function ensurePoolSaved(args: {
  chain: string;
  network: string;
  connector: string;
  type: 'amm' | 'clmm';
  poolAddress: string;
  fetchPoolInfo: () => Promise<PoolFacts>;
}): Promise<void> {
  const { chain, network, connector, type, poolAddress } = args;
  const poolService = PoolService.getInstance();

  try {
    if (await poolService.getPoolByAddress(chain, network, poolAddress)) {
      return;
    }

    const info = await args.fetchPoolInfo();
    const [base, quote] = await Promise.all([
      ensureTokenSaved(chain, network, info.baseTokenAddress),
      ensureTokenSaved(chain, network, info.quoteTokenAddress),
    ]);

    // A pool is filed under its pair, so an unnamed side leaves nothing to file it under.
    if (!base || !quote) {
      logger.info(
        `Not recording pool ${poolAddress} on ${chain}/${network}: ` +
          `${!base ? info.baseTokenAddress : info.quoteTokenAddress} has no symbol`,
      );
      return;
    }

    const pool: Pool = {
      connector,
      type,
      network,
      address: info.address || poolAddress,
      baseSymbol: base.symbol,
      quoteSymbol: quote.symbol,
      baseTokenAddress: base.address,
      quoteTokenAddress: quote.address,
      feePct: info.feePct,
    };

    await poolService.addPool(chain, network, pool);
    logger.info(
      `Learned ${type} pool ${pool.baseSymbol}-${pool.quoteSymbol} (${pool.address}) on ${connector}/${network}`,
    );
  } catch (e: any) {
    logger.warn(`Could not record pool ${poolAddress} on ${chain}/${network}: ${e.message}`);
  }
}
