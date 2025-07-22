import { Contract } from '@ethersproject/contracts';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { GetPoolInfoRequestType, GetPoolInfoRequest, PoolInfo, PoolInfoSchema } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { ETCSwap } from '../etcSwap';
import { IETCSwapV2PairABI } from '../etcSwap.contracts';
import { formatTokenAmount } from '../etcSwap.utils';

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: Record<string, any>;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get AMM pool information from ETCSwap V2',
        tags: ['/connector/etcSwap'],
        querystring: GetPoolInfoRequest,
        response: {
          200: PoolInfoSchema,
        },
      },
    },
    async (request): Promise<PoolInfo> => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;

        const ethereum = await Ethereum.getInstance(network);
        const etcSwap = await ETCSwap.getInstance(network);

        // For ETCSwap, we need to get the pair contract to extract token addresses
        // Create a pair contract instance to read token addresses
        const pairContract = new Contract(poolAddress, IETCSwapV2PairABI.abi, ethereum.provider);

        // Get token addresses from the pair
        const token0Address = await pairContract.token0();
        const token1Address = await pairContract.token1();

        // Get token objects by address
        const token0 = etcSwap.getTokenByAddress(token0Address);
        const token1 = etcSwap.getTokenByAddress(token1Address);

        if (!token0 || !token1) {
          throw new Error('Could not find tokens for pool');
        }

        // Get V2 pair data
        const v2Pair = await etcSwap.getV2Pool(token0, token1, poolAddress);

        if (!v2Pair) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Get the tokens from the pair
        const pairToken0 = v2Pair.token0;
        const pairToken1 = v2Pair.token1;

        // Since we only have poolAddress, use token0 as base and token1 as quote
        const actualBaseToken = pairToken0;
        const actualQuoteToken = pairToken1;
        const baseTokenAmount = formatTokenAmount(v2Pair.reserve0.quotient.toString(), pairToken0.decimals);
        const quoteTokenAmount = formatTokenAmount(v2Pair.reserve1.quotient.toString(), pairToken1.decimals);

        // Calculate price (quoteToken per baseToken)
        const price = quoteTokenAmount / baseTokenAmount;

        return {
          address: poolAddress,
          baseTokenAddress: actualBaseToken.address,
          quoteTokenAddress: actualQuoteToken.address,
          feePct: 0.3, // ETCSwap V2 fee is fixed at 0.3%
          price: price,
          baseTokenAmount: baseTokenAmount,
          quoteTokenAmount: quoteTokenAmount,
          poolType: 'amm',
          lpMint: {
            address: poolAddress, // In ETCSwap V2, the LP token address is the pair address
            decimals: 18, // ETCSwap V2 LP tokens have 18 decimals
          },
        };
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
