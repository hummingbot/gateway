import { FastifyPluginAsync, FastifyInstance } from 'fastify';

// Import all connector executeSwap functions
import { JupiterConfig } from '../../../connectors/jupiter/jupiter.config';
import { executeSwap as jupiterRouterExecuteSwap } from '../../../connectors/jupiter/router-routes/executeSwap';
import { executeSwap as meteoraClmmExecuteSwap } from '../../../connectors/meteora/clmm-routes/executeSwap';
import { executeSwap as pancakeswapSolClmmExecuteSwap } from '../../../connectors/pancakeswap-sol/clmm-routes/executeSwap';
import { executeSwap as raydiumAmmExecuteSwap } from '../../../connectors/raydium/amm-routes/executeSwap';
import { executeSwap as raydiumClmmExecuteSwap } from '../../../connectors/raydium/clmm-routes/executeSwap';
import { ChainExecuteSwapResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { PoolService } from '../../../services/pool-service';
import { SolanaExecuteSwapRequest, SolanaExecuteSwapRequestType } from '../schemas';
import { getSolanaNetworkConfig } from '../solana.config';

/**
 * Execute a swap using the network's configured swap provider
 */
export async function executeSolanaSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
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
      return await jupiterRouterExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
        undefined, // priorityLevel
        undefined, // maxLamports
      );
    } else if (providerKey === 'raydium/amm') {
      return await raydiumAmmExecuteSwap(
        fastify,
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct || 1,
      );
    } else if (providerKey === 'raydium/clmm') {
      return await raydiumClmmExecuteSwap(
        fastify,
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct || 1,
      );
    } else if (providerKey === 'meteora/clmm') {
      return await meteoraClmmExecuteSwap(
        fastify,
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap-sol/clmm') {
      return await pancakeswapSolClmmExecuteSwap(
        fastify,
        network,
        walletAddress,
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
    logger.error(`Error executing swap: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw fastify.httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: SolanaExecuteSwapRequestType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: "Execute a swap using the network's configured swap provider (router/amm/clmm)",
        tags: ['/chain/solana'],
        body: SolanaExecuteSwapRequest,
        response: { 200: ChainExecuteSwapResponseSchema },
      },
    },
    async (request) => {
      const {
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct = JupiterConfig.config.slippagePct,
      } = request.body;
      return await executeSolanaSwap(
        fastify,
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side as 'BUY' | 'SELL',
        slippagePct,
      );
    },
  );
};

export default executeSwapRoute;
