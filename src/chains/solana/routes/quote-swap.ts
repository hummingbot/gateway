import { FastifyPluginAsync, FastifyInstance } from 'fastify';

// Import all connector quoteSwap functions
import { quoteSwap as jupiterRouterQuoteSwap } from '../../../connectors/jupiter/router-routes/quoteSwap';
import { quoteSwap as meteoraClmmQuoteSwap } from '../../../connectors/meteora/clmm-routes/quoteSwap';
import { quoteSwap as pancakeswapSolClmmQuoteSwap } from '../../../connectors/pancakeswap-sol/clmm-routes/quoteSwap';
import { quoteSwap as raydiumAmmQuoteSwap } from '../../../connectors/raydium/amm-routes/quoteSwap';
import { quoteSwap as raydiumClmmQuoteSwap } from '../../../connectors/raydium/clmm-routes/quoteSwap';
import { logger } from '../../../services/logger';
import { PoolService } from '../../../services/pool-service';
import { SolanaQuoteSwapRequest, SolanaQuoteSwapRequestType } from '../schemas';
import { getSolanaNetworkConfig } from '../solana.config';

/**
 * Get a swap quote using the network's configured swap provider
 */
export async function getSolanaQuoteSwap(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<any> {
  try {
    const networkConfig = getSolanaNetworkConfig(network);

    // Get swap provider from config (e.g., "jupiter/router", "raydium/amm", "meteora/clmm")
    const swapProvider = networkConfig.swapProvider || 'jupiter/router';
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

    if (providerKey === 'jupiter/router') {
      return await jupiterRouterQuoteSwap(
        fastify,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
        undefined, // onlyDirectRoutes
        undefined, // restrictIntermediateTokens
      );
    } else if (providerKey === 'raydium/amm') {
      return await raydiumAmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'raydium/clmm') {
      return await raydiumClmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'meteora/clmm') {
      return await meteoraClmmQuoteSwap(
        fastify,
        network,
        poolAddress!,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap-sol/clmm') {
      return await pancakeswapSolClmmQuoteSwap(
        fastify,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress,
        slippagePct || 1,
      );
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
    Body: SolanaQuoteSwapRequestType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: "Get a swap quote using the network's configured swap provider (router/amm/clmm)",
        tags: ['/chain/solana'],
        body: SolanaQuoteSwapRequest,
      },
    },
    async (request) => {
      const { network, baseToken, quoteToken, amount, side, slippagePct } = request.body;
      return await getSolanaQuoteSwap(
        fastify,
        network,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct,
      );
    },
  );
};

export default quoteSwapRoute;
