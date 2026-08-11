import { Contract } from '@ethersproject/contracts';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { GetPoolInfoRequestType, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { IPancakeswapV2PairABI } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';
import { PancakeswapAmmGetPoolInfoRequest } from '../schemas';

/**
 * Standard AMM pool-info accessor: given a network and a Pancakeswap V2 pool (pair) address, returns
 * the shared PoolInfo shape. V2 pairs are pool-addressed and carry a fixed 0.30% fee; token0 is
 * treated as base and token1 as quote (the pair contract is the authoritative source of ordering).
 */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const ethereum = await Ethereum.getInstance(network);
  const pancakeswap = await Pancakeswap.getInstance(network);

  // For Pancakeswap, read the pair contract to extract the two token addresses.
  const pairContract = new Contract(poolAddress, IPancakeswapV2PairABI.abi, ethereum.provider);

  const token0Address = await pairContract.token0();
  const token1Address = await pairContract.token1();

  const token0 = await pancakeswap.getToken(token0Address);
  const token1 = await pancakeswap.getToken(token1Address);

  if (!token0 || !token1) {
    throw httpErrors.notFound('Could not find tokens for pool');
  }

  const v2Pair = await pancakeswap.getV2Pool(token0, token1, poolAddress);
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
    feePct: 0.3, // Pancakeswap V2 fee is fixed at 0.3%
    price,
    baseTokenAmount,
    quoteTokenAmount,
  };
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from Pancakeswap V2',
        tags: ['/connector/pancakeswap'],
        querystring: PancakeswapAmmGetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress, network } = request.query;
        return await getPoolInfo(network, poolAddress);
      } catch (e) {
        logger.error(`Error in pool-info route: ${e.message}`);
        if (e.stack) {
          logger.debug(`Stack trace: ${e.stack}`);
        }

        // Return appropriate error based on the error message
        if (e.statusCode) {
          throw e; // Already a formatted Fastify error
        } else if (e.message && e.message.includes('invalid address')) {
          throw fastify.httpErrors.badRequest(`Invalid pool address`);
        } else if (e.message && e.message.includes('not found')) {
          logger.error('Not found error:', e);
          throw fastify.httpErrors.notFound('Resource not found');
        } else {
          logger.error('Unexpected error fetching pool info:', e);
          throw fastify.httpErrors.internalServerError('Failed to fetch pool info');
        }
      }
    },
  );
};

export default poolInfoRoute;
