import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { executeSwap as zeroXRouterExecuteSwap } from '../../../connectors/0x/router-routes/executeSwap';
import { executeSwap as pancakeswapAmmExecuteSwap } from '../../../connectors/pancakeswap/amm-routes/executeSwap';
import { executeSwap as pancakeswapClmmExecuteSwap } from '../../../connectors/pancakeswap/clmm-routes/executeSwap';
import { executeSwap as pancakeswapRouterExecuteSwap } from '../../../connectors/pancakeswap/router-routes/executeSwap';
import { executeSwap as uniswapAmmExecuteSwap } from '../../../connectors/uniswap/amm-routes/executeSwap';
import { executeSwap as uniswapClmmExecuteSwap } from '../../../connectors/uniswap/clmm-routes/executeSwap';
import { executeSwap as uniswapRouterExecuteSwap } from '../../../connectors/uniswap/router-routes/executeSwap';
import { logger } from '../../../services/logger';
import { PoolService } from '../../../services/pool-service';
import { getEthereumNetworkConfig } from '../ethereum.config';
import { EthereumExecuteSwapRequest, EthereumExecuteSwapRequestType } from '../schemas';

// Import all connector executeSwap functions

/**
 * Execute a swap using the network's configured swap provider
 */
export async function executeEthereumSwap(
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
    const networkConfig = getEthereumNetworkConfig(network);

    // Get swap provider from config (e.g., "uniswap/router", "uniswap/amm", "uniswap/clmm")
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
    // All Ethereum connectors have signature: (fastify, walletAddress, network, baseToken, quoteToken, amount, side, slippagePct)
    const providerKey = swapProvider;

    if (providerKey === 'uniswap/router') {
      return await uniswapRouterExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'uniswap/amm') {
      return await uniswapAmmExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'uniswap/clmm') {
      return await uniswapClmmExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap/router') {
      return await pancakeswapRouterExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap/amm') {
      return await pancakeswapAmmExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === 'pancakeswap/clmm') {
      return await pancakeswapClmmExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct || 1,
      );
    } else if (providerKey === '0x/router') {
      return await zeroXRouterExecuteSwap(
        fastify,
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
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
    Body: EthereumExecuteSwapRequestType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: "Execute a swap using the network's configured swap provider (router/amm/clmm)",
        tags: ['/chain/ethereum'],
        body: EthereumExecuteSwapRequest,
      },
    },
    async (request) => {
      const { network, walletAddress, baseToken, quoteToken, amount, side, slippagePct } = request.body;
      return await executeEthereumSwap(
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
