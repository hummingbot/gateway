import { FastifyInstance } from 'fastify';

import { ensurePoolSaved, PoolFacts, recordQuietly } from '../services/token-pool-autosave';

import { getUnifiedPoolInfo } from './clmm/pools';
import { getAmmPoolInfo } from './trading-amm-routes/pool-info';

export type PoolType = 'clmm' | 'amm';

/**
 * Record a pool, and its two tokens, after a route has acted on it.
 *
 * Called from the routes that MOVE FUNDS through a named pool — an execute-swap, an
 * open, an add, a remove — and from none of the routes that only look: quoting a swap,
 * quoting liquidity, reading pool info. That is the same line the token side draws, and
 * for the same reason. A quote is a question, and a list that grows from questions fills
 * with pools nobody traded; a fill is a fact, and a pool someone put money into is one
 * they will want named next time.
 *
 * The CLMM position routes (add, remove, close, collect-fees) are not here because they
 * are given a position address, not a pool: learning the pool from one would cost a
 * lookup, and it is redundant anyway — a position exists only because `open` created it,
 * and `open` records the pool.
 *
 * Failure is swallowed by recordQuietly. This runs after the trade has already settled,
 * so there is nothing left to abort, and a bookkeeping miss must not turn a good fill
 * into an error.
 */
export const learnPool = async (
  fastify: FastifyInstance,
  type: PoolType,
  chain: string,
  network: string,
  connector: string,
  chainNetwork: string,
  poolAddress: string,
): Promise<void> =>
  recordQuietly(
    ensurePoolSaved({
      chain,
      network,
      connector,
      type,
      poolAddress,
      fetchPoolInfo: (): Promise<PoolFacts> =>
        type === 'clmm'
          ? getUnifiedPoolInfo(fastify, connector, chainNetwork, poolAddress, 0)
          : getAmmPoolInfo(connector, network, poolAddress),
    }),
    `pool ${poolAddress}`,
  );
