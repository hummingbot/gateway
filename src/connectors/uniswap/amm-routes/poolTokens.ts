import { Contract } from '@ethersproject/contracts';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { httpErrors } from '../../../services/error-handler';
import { Uniswap } from '../uniswap';
import { IUniswapV2PairABI } from '../uniswap.contracts';

/** The token shape returned by Uniswap.getToken (address/decimals/symbol). */
type UniToken = NonNullable<Awaited<ReturnType<Uniswap['getToken']>>>;

/**
 * Reads a Uniswap V2 pair's token0/token1 and resolves them. `base` follows the pair's token0
 * orientation and `quote` its token1 — matching how pool-info / position-info report.
 */
export async function getAmmPoolTokens(
  network: string,
  poolAddress: string,
): Promise<{ base: UniToken; quote: UniToken }> {
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  const pair = new Contract(poolAddress, IUniswapV2PairABI.abi, ethereum.provider);
  const [t0, t1] = await Promise.all([pair.token0(), pair.token1()]);
  const base = await uniswap.getToken(t0);
  const quote = await uniswap.getToken(t1);
  if (!base || !quote) {
    throw httpErrors.badRequest(`Could not resolve token information for pool ${poolAddress}`);
  }
  return { base, quote };
}

/**
 * Given a caller-specified base token (symbol or address) and a pool, returns the base and the
 * counter ("quote") token addresses — the quote token is whichever pool token is not the base.
 * Used by swap ops where `baseToken` selects the direction.
 */
export async function resolveSwapPair(
  network: string,
  poolAddress: string,
  baseToken: string,
): Promise<{ baseAddress: string; quoteAddress: string }> {
  const { base, quote } = await getAmmPoolTokens(network, poolAddress);
  const uniswap = await Uniswap.getInstance(network);
  const baseObj = await uniswap.getToken(baseToken);
  if (!baseObj) throw httpErrors.badRequest(`Token not found: ${baseToken}`);
  const addr = baseObj.address.toLowerCase();
  if (addr === base.address.toLowerCase()) return { baseAddress: base.address, quoteAddress: quote.address };
  if (addr === quote.address.toLowerCase()) return { baseAddress: quote.address, quoteAddress: base.address };
  throw httpErrors.badRequest(`Token ${baseToken} is not part of pool ${poolAddress}`);
}
