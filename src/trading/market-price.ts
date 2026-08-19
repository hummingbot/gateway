/**
 * A market price for a token pair, sourced through whichever swap provider the
 * network is configured to use.
 *
 * Pool creation needs this: a new pool has no price of its own, so it is
 * initialized against the price of existing venues. It lives outside the route
 * modules because connectors call it (createPool), and routes must not be
 * imported by the connectors they dispatch to.
 */
import { httpErrors } from '../services/error-handler';

import { parseChainNetwork, resolvePoolAddress, resolveSwapConnector } from './common';
import { TradingType, getPoolOps, getRouterOps } from './connector-registry';

/**
 * Quote a pair through a connector, defaulting to the network's configured
 * swapProvider. `connector` accepts either a bare name plus an explicit type, or
 * the config's "name/type" form.
 */
export async function getSwapQuote(
  chainNetwork: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  options: { connector?: string; type?: TradingType; poolAddress?: string; slippagePct?: number } = {},
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  // The type comes from the caller, from the connector string ("raydium/amm"),
  // or from the configured swapProvider — in that order.
  const typed = options.connector?.includes('/') ? (options.connector.split('/')[1] as TradingType) : undefined;
  const type = options.type ?? typed ?? configuredType(chain, network);
  const connector = resolveSwapConnector(chain, network, type, options.connector);

  if (type === 'router') {
    return getRouterOps(connector, chain).quoteSwap({
      network,
      baseToken,
      quoteToken,
      amount,
      side,
      slippagePct: options.slippagePct,
    });
  }

  const poolAddress = await resolvePoolAddress(
    chain,
    network,
    type,
    connector,
    baseToken,
    quoteToken,
    options.poolAddress,
  );
  return getPoolOps(connector, chain, type).quoteSwap({
    network,
    poolAddress,
    baseToken,
    side,
    amount,
    slippagePct: options.slippagePct,
  });
}

function configuredType(chain: string, network: string): TradingType {
  // resolveSwapConnector reads the same config; asking it for 'router' first and
  // falling back keeps the provider-type discovery in one place.
  for (const candidate of ['router', 'clmm', 'amm'] as TradingType[]) {
    try {
      resolveSwapConnector(chain, network, candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw httpErrors.badRequest(`No swapProvider configured for ${chain}-${network}`);
}

/**
 * Current market price of `baseToken` in `quoteToken`, from a SELL quote of one
 * base token. Throws a caller-friendly error when no route exists, since the
 * usual remedy is to pass an explicit initial price.
 */
export async function getMarketPrice(chainNetwork: string, baseToken: string, quoteToken: string): Promise<number> {
  let quote: any;
  try {
    quote = await getSwapQuote(chainNetwork, baseToken, quoteToken, 1, 'SELL');
  } catch (e: any) {
    throw httpErrors.badRequest(
      `Could not fetch a market price for ${baseToken}/${quoteToken} to initialize the pool (${e.message}). ` +
        'Pass initialPrice explicitly.',
    );
  }
  if (!quote || !quote.amountIn || !quote.amountOut) {
    throw httpErrors.badRequest(`No market route found for ${baseToken}/${quoteToken}. Pass initialPrice explicitly.`);
  }
  return quote.amountOut / quote.amountIn; // quote token per base token
}
