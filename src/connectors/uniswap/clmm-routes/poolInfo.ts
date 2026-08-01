import { Contract as EthersProjectContract } from '@ethersproject/contracts';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { FeeAmount } from '@uniswap/v3-sdk';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { PoolInfo, PoolInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { UniswapClmmGetPoolInfoRequest, UniswapClmmGetPoolInfoRequestType } from '../schemas';
import { Uniswap } from '../uniswap';
import { computeUniswapBinDistribution, formatTokenAmount, getUniswapPoolInfo } from '../uniswap.utils';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  binCount: number = 0,
): Promise<PoolInfo> {
  const uniswap = await Uniswap.getInstance(network);

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Get pool information to determine tokens
  const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await uniswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await uniswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw fastify.httpErrors.badRequest('Token information not found for pool');
  }

  // Get V3 pool details
  const pool = await uniswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);

  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found');
  }

  // Determine token ordering
  const token0 = pool.token0;
  const token1 = pool.token1;
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  // Calculate price based on sqrtPriceX96
  const sqrtPriceX96 = pool.sqrtRatioX96;
  const price0 = pool.token0Price.toSignificant(15);
  const price1 = pool.token1Price.toSignificant(15);

  // Get the price of base token in terms of quote token
  const price = isBaseToken0 ? parseFloat(price0) : parseFloat(price1);

  // Read the pool contract's actual ERC20 balances. Uniswap V3's `pool.liquidity` is
  // the active virtual liquidity in sqrt-price space, not a token amount, so it cannot
  // be used here.
  const ethereum = await Ethereum.getInstance(network);
  const token0Contract = ethereum.getContract(token0.address, ethereum.provider);
  const token1Contract = ethereum.getContract(token1.address, ethereum.provider);
  const [token0Balance, token1Balance] = await Promise.all([
    ethereum.getERC20BalanceByAddress(token0Contract, poolAddress, token0.decimals),
    ethereum.getERC20BalanceByAddress(token1Contract, poolAddress, token1.decimals),
  ]);
  const token0Amount = formatTokenAmount(token0Balance.value.toString(), token0.decimals);
  const token1Amount = formatTokenAmount(token1Balance.value.toString(), token1.decimals);

  // Map to base and quote amounts
  const baseTokenAmount = isBaseToken0 ? token0Amount : token1Amount;
  const quoteTokenAmount = isBaseToken0 ? token1Amount : token0Amount;

  // Convert fee percentage
  const feePct = pool.fee / 10000;

  // Get tick spacing
  const tickSpacing = pool.tickSpacing;

  // Get active tick/bin
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
    // Direct V3 Pool ABI contract — ethereum.getContract() returns an ERC20-typed
    // contract which wouldn't expose ticks(). Use the same ABI the rest of the
    // connector uses for V3 pool reads.
    const poolContract = new EthersProjectContract(poolAddress, IUniswapV3PoolABI, ethereum.provider);
    result.bins = await computeUniswapBinDistribution({
      poolContract,
      tickSpacing,
      currentTick: activeBinId,
      currentSqrtPriceX96: JSBI.BigInt(sqrtPriceX96.toString()),
      activeLiquidity: JSBI.BigInt(pool.liquidity.toString()),
      decimals0: token0.decimals,
      decimals1: token1.decimals,
      isBaseToken0,
      binCount,
    });
  }

  return result;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: UniswapClmmGetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get CLMM pool information from Uniswap V3',
        tags: ['/connector/uniswap'],
        querystring: UniswapClmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, binCount = 0, network } = request.query;
        return await getPoolInfo(fastify, network, poolAddress, binCount);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
      }
    },
  );
};

export default poolInfoRoute;
