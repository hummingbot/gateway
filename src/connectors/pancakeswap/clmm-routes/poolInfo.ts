import { Contract as EthersProjectContract } from '@ethersproject/contracts';
import { abi as IPancakeV3PoolABI } from '@pancakeswap/v3-core/artifacts/contracts/interfaces/IPancakeV3Pool.sol/IPancakeV3Pool.json';
import { SqrtPriceMath, TickMath } from '@pancakeswap/v3-sdk';
import { FastifyInstance } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PoolInfo } from '../../../schemas/clmm-schema';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { computeV3BinDistribution } from '../../clmm-v3-utils';
import { Pancakeswap } from '../pancakeswap';
import { formatTokenAmount, getPancakeswapPoolInfo } from '../pancakeswap.utils';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  const pancakeswap = await Pancakeswap.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  const poolInfo = await getPancakeswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await pancakeswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await pancakeswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw fastify.httpErrors.badRequest('Token information not found for pool');
  }

  const pool = await pancakeswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);

  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found');
  }

  const token0 = pool.token0;
  const token1 = pool.token1;
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  const price0 = pool.token0Price.toSignificant(15);
  const price1 = pool.token1Price.toSignificant(15);

  const price = isBaseToken0 ? parseFloat(price0) : parseFloat(price1);

  // Read the pool contract's actual ERC20 balances. V3's `pool.liquidity` is the
  // active virtual liquidity in sqrt-price space, not a token amount — using it
  // reported the same figure for both sides, scaled by each token's decimals.
  const ethereum = await Ethereum.getInstance(network);
  const token0Contract = ethereum.getContract(token0.address, ethereum.provider);
  const token1Contract = ethereum.getContract(token1.address, ethereum.provider);
  const [token0Balance, token1Balance] = await Promise.all([
    ethereum.getERC20BalanceByAddress(token0Contract, poolAddress, token0.decimals),
    ethereum.getERC20BalanceByAddress(token1Contract, poolAddress, token1.decimals),
  ]);
  const token0Amount = formatTokenAmount(token0Balance.value.toString(), token0.decimals);
  const token1Amount = formatTokenAmount(token1Balance.value.toString(), token1.decimals);

  const baseTokenAmount = isBaseToken0 ? token0Amount : token1Amount;
  const quoteTokenAmount = isBaseToken0 ? token1Amount : token0Amount;

  const feePct = pool.fee / 10000;
  const tickSpacing = pool.tickSpacing;
  const activeBinId = pool.tickCurrent;

  const result: PoolInfo = {
    address: poolAddress,
    baseTokenAddress: baseTokenObj.address,
    quoteTokenAddress: quoteTokenObj.address,
    binStep: tickSpacing,
    feePct: feePct,
    price: price,
    baseTokenAmount: baseTokenAmount,
    quoteTokenAmount: quoteTokenAmount,
    activeBinId: activeBinId,
  };

  // Optionally include the per-bin distribution around the current tick.
  // Fires N parallel pool.ticks(tick) reads — only when binCount > 0 so the
  // default pool-info latency is unaffected.
  if (binCount > 0) {
    const poolContract = new EthersProjectContract(poolAddress, IPancakeV3PoolABI, ethereum.provider);
    result.bins = await computeV3BinDistribution({
      poolContract,
      tickSpacing,
      currentTick: activeBinId,
      currentSqrtPriceX96: BigInt(pool.sqrtRatioX96.toString()),
      activeLiquidity: BigInt(pool.liquidity.toString()),
      decimals0: token0.decimals,
      decimals1: token1.decimals,
      isBaseToken0,
      binCount,
      tickMath: TickMath,
      sqrtPriceMath: SqrtPriceMath,
    });
  }

  return result;
}
