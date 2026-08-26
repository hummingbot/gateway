import { Contract } from '@ethersproject/contracts';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PoolInfo } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Uniswap } from '../uniswap';
import { IUniswapV2PairABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

/**
 * Standard AMM pool-info accessor: given a network and a Uniswap V2 pool (pair) address, returns the
 * shared PoolInfo shape. V2 pairs are pool-addressed and carry a fixed 0.30% fee; token0 is treated
 * as base and token1 as quote (the pair contract is the authoritative source of the token ordering).
 */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const ethereum = await Ethereum.getInstance(network);
  const uniswap = await Uniswap.getInstance(network);

  // For Uniswap, read the pair contract to extract the two token addresses.
  const pairContract = new Contract(poolAddress, IUniswapV2PairABI.abi, ethereum.provider);

  const token0Address = await pairContract.token0();
  const token1Address = await pairContract.token1();

  const token0 = await uniswap.getToken(token0Address);
  const token1 = await uniswap.getToken(token1Address);

  if (!token0 || !token1) {
    throw httpErrors.notFound('Could not find tokens for pool');
  }

  const v2Pair = await uniswap.getV2Pool(token0, token1, poolAddress);
  if (!v2Pair) {
    throw httpErrors.notFound('Pool not found');
  }

  const pairToken0 = v2Pair.token0;
  const pairToken1 = v2Pair.token1;

  // Since we only have poolAddress, use token0 as base and token1 as quote.
  const baseTokenAmount = formatTokenAmount(v2Pair.reserve0.quotient.toString(), pairToken0.decimals);
  const quoteTokenAmount = formatTokenAmount(v2Pair.reserve1.quotient.toString(), pairToken1.decimals);

  // Price is quoteToken per baseToken.
  const price = quoteTokenAmount / baseTokenAmount;

  return {
    address: poolAddress,
    baseTokenAddress: pairToken0.address,
    quoteTokenAddress: pairToken1.address,
    feePct: 0.3, // Uniswap V2 fee is fixed at 0.3%
    price,
    baseTokenAmount,
    quoteTokenAmount,
  };
}
