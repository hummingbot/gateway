/**
 * The single table wiring every connector into the unified /trading routes.
 *
 * Before this existed, each unified route carried its own if-else chain over
 * `connector/type` strings, so adding a connector meant editing every route and
 * the chains diverged (a connector reachable from quote but not execute). Here a
 * connector is one entry, and the routes are pure dispatch.
 *
 * Connector modules export plain async functions alongside their (now removed)
 * per-connector route plugins; those functions are what the adapters below call.
 * Each type has ONE argument shape, so the positional differences between
 * connectors — titan taking a wallet, uniswap taking it second, 0x taking
 * `indicativePrice` where the Solana routers take `approximateIfNoExactOut` —
 * are absorbed here instead of leaking into the routes.
 */

// Router connectors
import { executeQuote as zeroXExecuteQuote } from '../connectors/0x/router-routes/executeQuote';
import { executeSwap as zeroXExecuteSwap } from '../connectors/0x/router-routes/executeSwap';
import { quoteSwap as zeroXQuoteSwap } from '../connectors/0x/router-routes/quoteSwap';
import { executeQuote as dflowExecuteQuote } from '../connectors/dflow/router-routes/executeQuote';
import { executeSwap as dflowExecuteSwap } from '../connectors/dflow/router-routes/executeSwap';
import { quoteSwap as dflowQuoteSwap } from '../connectors/dflow/router-routes/quoteSwap';
import { executeQuote as jupiterExecuteQuote } from '../connectors/jupiter/router-routes/executeQuote';
import { executeSwap as jupiterExecuteSwap } from '../connectors/jupiter/router-routes/executeSwap';
import { quoteSwap as jupiterQuoteSwap } from '../connectors/jupiter/router-routes/quoteSwap';
// AMM / CLMM connectors
import { executeSwap as meteoraAmmExecuteSwap } from '../connectors/meteora/amm-routes/executeSwap';
import { quoteSwap as meteoraAmmQuoteSwap } from '../connectors/meteora/amm-routes/quoteSwap';
import { executeSwap as meteoraClmmExecuteSwap } from '../connectors/meteora/clmm-routes/executeSwap';
import { fetchPools as meteoraFetchPools } from '../connectors/meteora/clmm-routes/fetchPools';
import { quoteSwap as meteoraClmmQuoteSwap } from '../connectors/meteora/clmm-routes/quoteSwap';
import { executeQuote as meteoraDbcExecuteQuote } from '../connectors/meteora/launch-routes/executeQuote';
import { executeSwap as meteoraDbcExecuteSwap } from '../connectors/meteora/launch-routes/executeSwap';
import { quoteSwap as meteoraDbcQuoteSwap } from '../connectors/meteora/launch-routes/quoteSwap';
import { executeQuote as okxExecuteQuote } from '../connectors/okx/router-routes/executeQuote';
import { executeSwap as okxExecuteSwap } from '../connectors/okx/router-routes/executeSwap';
import { quoteSwap as okxQuoteSwap } from '../connectors/okx/router-routes/quoteSwap';
import { executeSwap as orcaClmmExecuteSwap } from '../connectors/orca/clmm-routes/executeSwap';
import { fetchPools as orcaFetchPools } from '../connectors/orca/clmm-routes/fetchPools';
import { quoteSwap as orcaClmmQuoteSwap } from '../connectors/orca/clmm-routes/quoteSwap';
import { executeSwap as pancakeswapAmmExecuteSwap } from '../connectors/pancakeswap/amm-routes/executeSwap';
import { quoteSwap as pancakeswapAmmQuoteSwap } from '../connectors/pancakeswap/amm-routes/quoteSwap';
import { executeSwap as pancakeswapClmmExecuteSwap } from '../connectors/pancakeswap/clmm-routes/executeSwap';
import { quoteSwap as pancakeswapClmmQuoteSwap } from '../connectors/pancakeswap/clmm-routes/quoteSwap';
import { executeQuote as pancakeswapExecuteQuote } from '../connectors/pancakeswap/router-routes/executeQuote';
import { executeSwap as pancakeswapExecuteSwap } from '../connectors/pancakeswap/router-routes/executeSwap';
import { quoteSwap as pancakeswapQuoteSwap } from '../connectors/pancakeswap/router-routes/quoteSwap';
import { executeSwap as pancakeswapSolClmmExecuteSwap } from '../connectors/pancakeswap-sol/clmm-routes/executeSwap';
import { quoteSwap as pancakeswapSolClmmQuoteSwap } from '../connectors/pancakeswap-sol/clmm-routes/quoteSwap';
import { executeSwap as pumpAmmExecuteSwap } from '../connectors/pump/amm-routes/executeSwap';
import { quoteSwap as pumpAmmQuoteSwap } from '../connectors/pump/amm-routes/quoteSwap';
import { executeQuote as pumpExecuteQuote } from '../connectors/pump/router-routes/executeQuote';
import { executeSwap as pumpExecuteSwap } from '../connectors/pump/router-routes/executeSwap';
import { quoteSwap as pumpQuoteSwap } from '../connectors/pump/router-routes/quoteSwap';
import { executeSwap as raydiumAmmExecuteSwap } from '../connectors/raydium/amm-routes/executeSwap';
import { quoteSwap as raydiumAmmQuoteSwap } from '../connectors/raydium/amm-routes/quoteSwap';
import { executeSwap as raydiumClmmExecuteSwap } from '../connectors/raydium/clmm-routes/executeSwap';
import { quoteSwap as raydiumClmmQuoteSwap } from '../connectors/raydium/clmm-routes/quoteSwap';
import {
  executeQuote as raydiumLaunchExecuteQuote,
  executeSwap as raydiumLaunchExecuteSwap,
  quoteSwap as raydiumLaunchQuoteSwap,
} from '../connectors/raydium/launch-routes/swap';
import { executeQuote as titanExecuteQuote } from '../connectors/titan/router-routes/executeQuote';
import { executeSwap as titanExecuteSwap } from '../connectors/titan/router-routes/executeSwap';
import { quoteSwap as titanQuoteSwap } from '../connectors/titan/router-routes/quoteSwap';
import { executeSwap as uniswapAmmExecuteSwap } from '../connectors/uniswap/amm-routes/executeSwap';
import { quoteSwap as uniswapAmmQuoteSwap } from '../connectors/uniswap/amm-routes/quoteSwap';
import { executeSwap as uniswapClmmExecuteSwap } from '../connectors/uniswap/clmm-routes/executeSwap';
import { quoteSwap as uniswapClmmQuoteSwap } from '../connectors/uniswap/clmm-routes/quoteSwap';
import { executeQuote as uniswapExecuteQuote } from '../connectors/uniswap/router-routes/executeQuote';
import { executeSwap as uniswapExecuteSwap } from '../connectors/uniswap/router-routes/executeSwap';
import { quoteSwap as uniswapQuoteSwap } from '../connectors/uniswap/router-routes/quoteSwap';
import { FetchPoolsResponseType } from '../schemas/clmm-schema';
import { httpErrors } from '../services/error-handler';

export type TradingType = 'router' | 'clmm' | 'amm' | 'launch';

/** Arguments every router quote takes. Connector-specific extras are optional. */
export interface RouterQuoteArgs {
  network: string;
  baseToken: string;
  quoteToken: string;
  amount: number;
  side: 'BUY' | 'SELL';
  slippagePct?: number;
  /** Solana routers only: approximate a BUY via a sell-leg quote when the router has no ExactOut route. */
  approximateIfNoExactOut?: boolean;
  /** Some routers price against the taker (titan quotes per-wallet, EVM routers build calldata for it). */
  walletAddress?: string;
  /**
   * 0x only: ask for an indicative price rather than a firm, executable quote.
   * An indicative quote is cheaper but cannot be executed by id, so this must stay
   * reachable now that the per-connector 0x route is gone.
   */
  indicativePrice?: boolean;
  /** Jupiter only: a platform fee, in bps, the quote is priced with (see trading/platform-fee). */
  platformFeeBps?: number;
}

export interface RouterExecuteArgs extends RouterQuoteArgs {
  walletAddress: string;
}

/** Arguments every pool-scoped (amm/clmm) quote takes. */
export interface PoolQuoteArgs {
  network: string;
  poolAddress: string;
  baseToken: string;
  side: 'BUY' | 'SELL';
  amount: number;
  slippagePct?: number;
}

export interface PoolExecuteArgs extends PoolQuoteArgs {
  walletAddress: string;
}

export interface FetchPoolsArgs {
  network: string;
  limit?: number;
  query?: string;
  sortBy?: string;
  /** meteora only */
  page?: number;
  /** meteora only */
  includeUnverified?: boolean;
  /** orca only */
  sortDirection?: string;
  /** orca only */
  verifiedOnly?: boolean;
}

interface RouterOps {
  chain: 'solana' | 'ethereum';
  quoteSwap: (args: RouterQuoteArgs) => Promise<any>;
  executeSwap: (args: RouterExecuteArgs) => Promise<any>;
  /** `feeAccount`: Jupiter only, where a quote's platform fee is paid. */
  executeQuote: (walletAddress: string, network: string, quoteId: string, feeAccount?: string) => Promise<any>;
}

interface PoolOps {
  chain: 'solana' | 'ethereum';
  quoteSwap: (args: PoolQuoteArgs) => Promise<any>;
  executeSwap: (args: PoolExecuteArgs) => Promise<any>;
  /** Only connectors whose DEX exposes a pool-discovery API implement this. */
  fetchPools?: (args: FetchPoolsArgs) => Promise<FetchPoolsResponseType>;
}

// ============================================
// Router connectors
// ============================================

const ROUTER_REGISTRY: Record<string, RouterOps> = {
  jupiter: {
    chain: 'solana',
    quoteSwap: (a) =>
      jupiterQuoteSwap(
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.approximateIfNoExactOut,
        a.platformFeeBps,
      ),
    executeSwap: (a) =>
      jupiterExecuteSwap(
        a.walletAddress,
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.approximateIfNoExactOut,
      ),
    executeQuote: jupiterExecuteQuote,
  },
  dflow: {
    chain: 'solana',
    quoteSwap: (a) =>
      dflowQuoteSwap(a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct, a.approximateIfNoExactOut),
    executeSwap: (a) =>
      dflowExecuteSwap(
        a.walletAddress,
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.approximateIfNoExactOut,
      ),
    executeQuote: dflowExecuteQuote,
  },
  okx: {
    chain: 'solana',
    quoteSwap: (a) =>
      okxQuoteSwap(a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct, a.approximateIfNoExactOut),
    executeSwap: (a) =>
      okxExecuteSwap(
        a.walletAddress,
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.approximateIfNoExactOut,
      ),
    executeQuote: okxExecuteQuote,
  },
  titan: {
    chain: 'solana',
    // Titan prices per-taker, so the wallet is part of the quote rather than only the execute.
    quoteSwap: (a) =>
      titanQuoteSwap(
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.approximateIfNoExactOut,
        a.walletAddress,
      ),
    executeSwap: (a) =>
      titanExecuteSwap(
        a.walletAddress,
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.approximateIfNoExactOut,
      ),
    executeQuote: titanExecuteQuote,
  },
  uniswap: {
    chain: 'ethereum',
    quoteSwap: (a) =>
      uniswapQuoteSwap(a.network, a.walletAddress, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeSwap: (a) =>
      uniswapExecuteSwap(a.walletAddress, a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeQuote: uniswapExecuteQuote,
  },
  pancakeswap: {
    chain: 'ethereum',
    quoteSwap: (a) =>
      pancakeswapQuoteSwap(a.network, a.walletAddress, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeSwap: (a) =>
      pancakeswapExecuteSwap(a.walletAddress, a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeQuote: pancakeswapExecuteQuote,
  },
  pump: {
    // pump.fun bonding-curve swaps, auto-routing to the token's canonical PumpSwap
    // pool after graduation. Trades are exact on both curve phases (BUY = exact
    // token out, SELL = exact token in), so approximateIfNoExactOut is ignored.
    chain: 'solana',
    quoteSwap: (a) => pumpQuoteSwap(a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeSwap: (a) =>
      pumpExecuteSwap(a.walletAddress, a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeQuote: pumpExecuteQuote,
  },
  '0x': {
    chain: 'ethereum',
    // 0x takes `indicativePrice` where the Solana routers take approximateIfNoExactOut,
    // and prices a firm quote against a taker. Both are passed through; leaving
    // indicativePrice undefined lets 0x apply its own default.
    quoteSwap: (a) =>
      zeroXQuoteSwap(
        a.network,
        a.baseToken,
        a.quoteToken,
        a.amount,
        a.side,
        a.slippagePct,
        a.indicativePrice,
        a.walletAddress,
      ),
    executeSwap: (a) =>
      zeroXExecuteSwap(a.walletAddress, a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeQuote: zeroXExecuteQuote,
  },
};

// ============================================
// CLMM connectors
// ============================================

const CLMM_REGISTRY: Record<string, PoolOps> = {
  meteora: {
    chain: 'solana',
    quoteSwap: (a) => meteoraClmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      meteoraClmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    fetchPools: (a) =>
      meteoraFetchPools({
        network: a.network,
        limit: a.limit,
        query: a.query,
        sortBy: a.sortBy,
        page: a.page,
        includeUnverified: a.includeUnverified,
      }),
  },
  raydium: {
    chain: 'solana',
    quoteSwap: (a) => raydiumClmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      raydiumClmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
  },
  orca: {
    chain: 'solana',
    quoteSwap: (a) => orcaClmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      orcaClmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    fetchPools: (a) =>
      orcaFetchPools({
        network: a.network,
        limit: a.limit,
        query: a.query,
        sortBy: a.sortBy,
        sortDirection: a.sortDirection,
        verifiedOnly: a.verifiedOnly,
      }),
  },
  'pancakeswap-sol': {
    chain: 'solana',
    quoteSwap: (a) =>
      pancakeswapSolClmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      pancakeswapSolClmmExecuteSwap(
        a.network,
        a.walletAddress,
        a.poolAddress,
        a.baseToken,
        a.side,
        a.amount,
        a.slippagePct,
      ),
  },
  uniswap: {
    chain: 'ethereum',
    quoteSwap: (a) => uniswapClmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      uniswapClmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
  },
  pancakeswap: {
    chain: 'ethereum',
    quoteSwap: (a) => pancakeswapClmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      pancakeswapClmmExecuteSwap(
        a.network,
        a.walletAddress,
        a.poolAddress,
        a.baseToken,
        a.side,
        a.amount,
        a.slippagePct,
      ),
  },
};

// ============================================
// AMM connectors
// ============================================

const AMM_REGISTRY: Record<string, PoolOps> = {
  meteora: {
    chain: 'solana',
    quoteSwap: (a) => meteoraAmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      meteoraAmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
  },
  raydium: {
    chain: 'solana',
    quoteSwap: (a) => raydiumAmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      raydiumAmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
  },
  pump: {
    chain: 'solana',
    quoteSwap: (a) => pumpAmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      pumpAmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
  },
  uniswap: {
    chain: 'ethereum',
    quoteSwap: (a) => uniswapAmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      uniswapAmmExecuteSwap(a.network, a.walletAddress, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
  },
  pancakeswap: {
    chain: 'ethereum',
    quoteSwap: (a) => pancakeswapAmmQuoteSwap(a.network, a.poolAddress, a.baseToken, a.side, a.amount, a.slippagePct),
    executeSwap: (a) =>
      pancakeswapAmmExecuteSwap(
        a.network,
        a.walletAddress,
        a.poolAddress,
        a.baseToken,
        a.side,
        a.amount,
        a.slippagePct,
      ),
  },
};

// ============================================
// Launch connectors (token creation)
// ============================================

/**
 * Launchpads: connectors that can mint a new token onto their venue. The
 * create-token dispatch lives in the launch routes (the same direct-import
 * pattern the liquidity routes use); this table is what names a connector on
 * the wire and pins it to its chain.
 */
interface LaunchOps {
  chain: 'solana' | 'ethereum';
  /**
   * Swaps on the launchpad's own curve, for connectors that have one.
   *
   * A bonding curve is a venue, not a route: there is exactly one pool per
   * launched token and it is found from the base mint, so these take the token
   * pair the way the router surface does rather than the poolAddress the
   * amm/clmm surfaces take. `pump` has no curve routes here yet, so the verbs
   * are optional and a connector without them is refused by name.
   */
  quoteSwap?: (args: RouterQuoteArgs) => Promise<any>;
  executeSwap?: (args: RouterExecuteArgs) => Promise<any>;
  executeQuote?: (walletAddress: string, network: string, quoteId: string, slippagePct?: number) => Promise<any>;
}

const LAUNCH_REGISTRY: Record<string, LaunchOps> = {
  pump: { chain: 'solana' },
  // Meteora Dynamic Bonding Curve: virtual pools that migrate to DAMM v2. Both
  // sides are exact-in — BUY spends `amount` of the quote token (SOL), SELL sells
  // `amount` of the base token — because the launch and buyback flows both know
  // what they spend, not what they get. A migrated token is refused here and
  // trades on DAMM v2 through this same connector's amm surface.
  meteora: {
    chain: 'solana',
    quoteSwap: (a) => meteoraDbcQuoteSwap(a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeSwap: (a) =>
      meteoraDbcExecuteSwap(a.walletAddress, a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeQuote: meteoraDbcExecuteQuote,
  },
  // Raydium LaunchLab: Raydium's own platform, constant-product curves in SOL
  // or USDC that graduate to CPMM. Exact-in both sides, as meteora's; a
  // graduated token trades on CPMM through this connector's amm surface.
  raydium: {
    chain: 'solana',
    quoteSwap: (a) => raydiumLaunchQuoteSwap(a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeSwap: (a) =>
      raydiumLaunchExecuteSwap(a.walletAddress, a.network, a.baseToken, a.quoteToken, a.amount, a.side, a.slippagePct),
    executeQuote: raydiumLaunchExecuteQuote,
  },
};

/** Launch connectors that actually expose curve swaps (not just token creation). */
export const LAUNCH_SWAP_CONNECTORS = Object.entries(LAUNCH_REGISTRY)
  .filter(([, ops]) => ops.quoteSwap)
  .map(([name]) => name);

/**
 * Connector names backing each unified trading surface, in schema-enum order.
 *
 * These are the enums the route schemas publish, so the roster a caller can name is
 * the roster this table can dispatch. They are re-exported from `./common`, which is
 * where the routes import their shared fields from.
 */
export const ROUTER_CONNECTORS = Object.keys(ROUTER_REGISTRY);
/** A router that trades on Solana (where a build can carry a platform fee). */
export const isSolanaRouter = (connector: string): boolean => ROUTER_REGISTRY[connector]?.chain === 'solana';
export const CLMM_CONNECTORS = Object.keys(CLMM_REGISTRY);
export const AMM_CONNECTORS = Object.keys(AMM_REGISTRY);
export const LAUNCH_CONNECTORS = Object.keys(LAUNCH_REGISTRY);

/** Connectors whose DEX exposes a pool-discovery API (`/trading/clmm/fetch-pools`). */
export const FETCH_POOLS_CONNECTORS = Object.entries(CLMM_REGISTRY)
  .filter(([, ops]) => ops.fetchPools)
  .map(([name]) => name);

/** Routers that price an indicative (non-executable) quote on request. */
export const INDICATIVE_PRICE_CONNECTORS = ['0x'];

/** Solana routers accept `approximateIfNoExactOut`; every other connector ignores it. */
export const APPROXIMATE_IF_NO_EXACT_OUT_CONNECTORS = Object.entries(ROUTER_REGISTRY)
  .filter(([, ops]) => ops.chain === 'solana')
  .map(([name]) => name);

function lookup<T extends { chain: string }>(
  registry: Record<string, T>,
  connector: string,
  type: TradingType,
  chain: string,
): T {
  const ops = registry[connector];
  if (!ops) {
    throw httpErrors.badRequest(
      `Connector '${connector}' has no ${type} support. Supported: ${Object.keys(registry).join(', ')}`,
    );
  }
  if (ops.chain !== chain) {
    throw httpErrors.badRequest(
      `Connector '${connector}' runs on ${ops.chain}, not ${chain}. Use a ${chain} ${type} connector: ` +
        Object.entries(registry)
          .filter(([, o]) => o.chain === chain)
          .map(([n]) => n)
          .join(', '),
    );
  }
  return ops;
}

export const getRouterOps = (connector: string, chain: string): RouterOps =>
  lookup(ROUTER_REGISTRY, connector, 'router', chain);

export const getClmmOps = (connector: string, chain: string): PoolOps =>
  lookup(CLMM_REGISTRY, connector, 'clmm', chain);

export const getAmmOps = (connector: string, chain: string): PoolOps => lookup(AMM_REGISTRY, connector, 'amm', chain);

/** Pool-scoped ops for a type that carries them (`clmm` or `amm`). */
export const getPoolOps = (connector: string, chain: string, type: 'clmm' | 'amm'): PoolOps =>
  type === 'clmm' ? getClmmOps(connector, chain) : getAmmOps(connector, chain);

/**
 * Reject a connector that does not run on the chain the caller named.
 *
 * The pool-scoped swap routes get this check for free: they fetch their ops through
 * `lookup`, which compares the two. The liquidity routes have no ops to fetch — they
 * call their connector module directly — so nothing compared them, and the chain half
 * of `chainNetwork` was decorative. `ethereum-mainnet` with a Solana connector ran that
 * connector against network `mainnet`, and on a write that submits a transaction the
 * caller never asked for. Same registry, same message as the swap routes.
 */
export const assertConnectorOnChain = (connector: string, chain: string, type: 'clmm' | 'amm'): void => {
  lookup(type === 'clmm' ? CLMM_REGISTRY : AMM_REGISTRY, connector, type, chain);
};

/** Reject a launch connector that does not run on the chain the caller named. */
export const assertLaunchConnectorOnChain = (connector: string, chain: string): void => {
  lookup(LAUNCH_REGISTRY, connector, 'launch', chain);
};

/**
 * A launch connector's curve ops, for the swap and pool-info verbs.
 *
 * Token creation reaches its connector by direct import, the way the liquidity
 * routes do; the curve verbs dispatch through here because more than one
 * launchpad can have a curve and the route should not grow a switch per venue.
 * A launchpad with no curve routes is refused by name rather than by a missing
 * property at call time.
 */
export const getLaunchOps = (
  connector: string,
  chain: string,
): Required<Pick<LaunchOps, 'quoteSwap' | 'executeSwap' | 'executeQuote'>> => {
  const ops = lookup(LAUNCH_REGISTRY, connector, 'launch', chain);
  if (!ops.quoteSwap || !ops.executeSwap || !ops.executeQuote) {
    throw httpErrors.badRequest(
      `Connector '${connector}' has no launch curve to trade on. Supported: ${LAUNCH_SWAP_CONNECTORS.join(', ')}.`,
    );
  }
  return ops as Required<Pick<LaunchOps, 'quoteSwap' | 'executeSwap' | 'executeQuote'>>;
};

export const getFetchPoolsOps = (connector: string, chain: string) => {
  const ops = getClmmOps(connector, chain);
  if (!ops.fetchPools) {
    throw httpErrors.badRequest(
      `Connector '${connector}' does not expose a pool-discovery API. ` +
        `Supported: ${FETCH_POOLS_CONNECTORS.join(', ')}. Use /pools to list Gateway's configured pools instead.`,
    );
  }
  return ops.fetchPools;
};
