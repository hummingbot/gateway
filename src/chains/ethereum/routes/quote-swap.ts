import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { quoteSwap as zeroXRouterQuoteSwap } from '../../../connectors/0x/router-routes/quoteSwap';
import { quoteSwap as pancakeswapAmmQuoteSwap } from '../../../connectors/pancakeswap/amm-routes/quoteSwap';
import { quoteSwap as pancakeswapClmmQuoteSwap } from '../../../connectors/pancakeswap/clmm-routes/quoteSwap';
import { quoteSwap as pancakeswapRouterQuoteSwap } from '../../../connectors/pancakeswap/router-routes/quoteSwap';
import { quoteSwap as uniswapAmmQuoteSwap } from '../../../connectors/uniswap/amm-routes/quoteSwap';
import { quoteSwap as uniswapClmmQuoteSwap } from '../../../connectors/uniswap/clmm-routes/quoteSwap';
import { quoteSwap as uniswapRouterQuoteSwap } from '../../../connectors/uniswap/router-routes/quoteSwap';
import { logger } from '../../../services/logger';
import { PoolService } from '../../../services/pool-service';
import { getEthereumNetworkConfig } from '../ethereum.config';
import { EthereumQuoteSwapRequest, EthereumQuoteSwapRequestType } from '../schemas';

// Import all connector quoteSwap functions

/**
 * Get a swap quote using the network's configured swap provider
 */
export async function getEthereumQuoteSwap(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  walletAddress?: string,
): Promise<any> {
  try {
    const networkConfig = getEthereumNetworkConfig(network);

    // Get swap provider from config (e.g., "uniswap/router", "pancakeswap/router", "uniswap/amm", "uniswap/clmm")
    const swapProvider = networkConfig.swapProvider || 'uniswap/router';
    const [connectorName, connectorType] = swapProvider.split('/');

    logger.info(`Using swap provider: ${swapProvider} for network: ${network}`);

    // For AMM and CLMM, look up the pool address using PoolService
    let poolAddress: string | undefined;
    if (connectorType === 'amm' || connectorType === 'clmm') {
      const poolService = PoolService.getInstance();
      const pool = await poolService.getPool(connectorName, network, connectorType, baseToken, quoteToken);

      if (!pool) {
        throw fastify.httpErrors.notFound(
          `No ${connectorType.toUpperCase()} pool found for ${baseToken}-${quoteToken} on ${connectorName}/${network}`,
        );
      }

      poolAddress = pool.address;
      logger.info(`Found pool: ${poolAddress} for ${baseToken}-${quoteToken}`);
    }

    // Route to the appropriate connector based on swapProvider
    const providerKey = swapProvider;

    if (providerKey === 'uniswap/router') {
      return await uniswapRouterQuoteSwap(
        fastify,
        network,
        walletAddress || '',
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'uniswap/amm') {
      return await uniswapAmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'uniswap/clmm') {
      return await uniswapClmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap/router') {
      return await pancakeswapRouterQuoteSwap(
        fastify,
        network,
        walletAddress || '',
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap/amm') {
      return await pancakeswapAmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap/clmm') {
      return await pancakeswapClmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === '0x/router') {
      return await zeroXRouterQuoteSwap(fastify, network, baseToken, quoteToken, amount, side, slippagePct || 1);
    }

    throw fastify.httpErrors.badRequest(`Unsupported swap provider: ${swapProvider}`);
  } catch (error) {
    logger.error(`Error getting swap quote: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to get swap quote: ${error.message}`);
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: EthereumQuoteSwapRequestType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: "Get a swap quote using the network's configured swap provider (router/amm/clmm)",
        tags: ['/chain/ethereum'],
        body: EthereumQuoteSwapRequest,
      },
    },
    async (request) => {
      const { network, baseToken, quoteToken, amount, side, slippagePct, walletAddress } = request.body;
      return await getEthereumQuoteSwap(
        fastify,
        network,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct,
        walletAddress,
      );
    },
  );
};

export default quoteSwapRoute;
