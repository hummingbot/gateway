import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

// Solana connector imports
import { getEthereumNetworkConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { quoteSwap as zeroXRouterQuoteSwap } from '../../connectors/0x/router-routes/quoteSwap';
import { quoteSwap as dflowRouterQuoteSwap } from '../../connectors/dflow/router-routes/quoteSwap';
import { quoteSwap as jupiterRouterQuoteSwap } from '../../connectors/jupiter/router-routes/quoteSwap';
import { quoteSwap as meteoraClmmQuoteSwap } from '../../connectors/meteora/clmm-routes/quoteSwap';
import { quoteSwap as okxRouterQuoteSwap } from '../../connectors/okx/router-routes/quoteSwap';
import { quoteSwap as orcaClmmQuoteSwap } from '../../connectors/orca/clmm-routes/quoteSwap';
import { quoteSwap as pancakeswapAmmQuoteSwap } from '../../connectors/pancakeswap/amm-routes/quoteSwap';
import { quoteSwap as pancakeswapClmmQuoteSwap } from '../../connectors/pancakeswap/clmm-routes/quoteSwap';
import { quoteSwap as pancakeswapRouterQuoteSwap } from '../../connectors/pancakeswap/router-routes/quoteSwap';
import { quoteSwap as pancakeswapSolClmmQuoteSwap } from '../../connectors/pancakeswap-sol/clmm-routes/quoteSwap';
import { quoteSwap as raydiumAmmQuoteSwap } from '../../connectors/raydium/amm-routes/quoteSwap';
import { quoteSwap as raydiumClmmQuoteSwap } from '../../connectors/raydium/clmm-routes/quoteSwap';
import { quoteSwap as titanRouterQuoteSwap } from '../../connectors/titan/router-routes/quoteSwap';

// Ethereum connector imports
import { quoteSwap as uniswapAmmQuoteSwap } from '../../connectors/uniswap/amm-routes/quoteSwap';
import { quoteSwap as uniswapClmmQuoteSwap } from '../../connectors/uniswap/clmm-routes/quoteSwap';
import { quoteSwap as uniswapRouterQuoteSwap } from '../../connectors/uniswap/router-routes/quoteSwap';

// Config and utilities
import { ChainQuoteSwapResponseSchema } from '../../schemas/chain-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';
import { chainNetworkField, parseChainNetwork } from '../common';

/**
 * Unified swap quote request schema
 * Accepts chain-network parameter like "solana-mainnet-beta", "ethereum-mainnet", or "ethereum-polygon"
 */
const UnifiedQuoteSwapRequestSchema = Type.Object({
  chainNetwork: chainNetworkField(),
  connector: Type.Optional(
    Type.String({
      description:
        "Connector to use in format: connector/type (e.g., jupiter/router, raydium/amm, uniswap/clmm). If not provided, uses network's configured swapProvider",
      examples: ['jupiter/router'],
    }),
  ),
  baseToken: Type.String({
    description: 'Symbol or address of the base token',
    default: 'SOL',
  }),
  quoteToken: Type.String({
    description: 'Symbol or address of the quote token',
    default: 'USDC',
  }),
  amount: Type.Number({
    description: 'Amount to swap',
    default: 1,
  }),
  side: Type.String({
    description: 'Side of the swap',
    enum: ['BUY', 'SELL'],
    default: 'SELL',
  }),
  slippagePct: Type.Optional(
    Type.Number({
      description: 'Slippage tolerance percentage (optional)',
      default: 1,
    }),
  ),
  approximateIfNoExactOut: Type.Optional(
    Type.Boolean({
      description:
        'For BUY orders when the router has no ExactOut route: approximate via a sell-leg ExactIn quote instead of failing. Solana routers only.',
      default: true,
    }),
  ),
});

type UnifiedQuoteSwapRequest = Static<typeof UnifiedQuoteSwapRequestSchema>;

/**
 * Get a Solana swap quote
 */
async function getSolanaQuoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  connector?: string,
  approximateIfNoExactOut?: boolean,
): Promise<any> {
  try {
    const networkConfig = getSolanaNetworkConfig(network);

    // Get swap provider from connector parameter or config (e.g., "jupiter/router", "raydium/amm", "meteora/clmm")
    const swapProvider = connector || networkConfig.swapProvider || 'jupiter/router';
    const [connectorName, connectorType] = swapProvider.split('/');

    logger.info(
      `Using swap provider: ${swapProvider} for network: ${network}${connector ? ' (explicit)' : ' (from config)'}`,
    );

    // For AMM and CLMM, look up the pool address using PoolService
    let poolAddress: string | undefined;
    if (connectorType === 'amm' || connectorType === 'clmm') {
      const poolService = PoolService.getInstance();
      const pool = await poolService.getPool('solana', network, connectorType, baseToken, quoteToken, connectorName);

      if (!pool) {
        throw httpErrors.notFound(
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
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'dflow/router') {
      return await dflowRouterQuoteSwap(
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'okx/router') {
      return await okxRouterQuoteSwap(
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'titan/router') {
      return await titanRouterQuoteSwap(
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'raydium/amm') {
      return await raydiumAmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'raydium/clmm') {
      return await raydiumClmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'meteora/clmm') {
      return await meteoraClmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'pancakeswap-sol/clmm') {
      return await pancakeswapSolClmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'orca/clmm') {
      return await orcaClmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    }

    throw httpErrors.badRequest(`Unsupported swap provider: ${swapProvider}`);
  } catch (error) {
    logger.error(`Error getting swap quote: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw httpErrors.internalServerError(`Failed to get swap quote: ${error.message}`);
  }
}

/**
 * Get an Ethereum swap quote
 */
async function getEthereumQuoteSwap(
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  connector?: string,
): Promise<any> {
  try {
    const networkConfig = getEthereumNetworkConfig(network);

    // Get swap provider from connector parameter or config (e.g., "uniswap/router", "pancakeswap/router", "uniswap/amm", "uniswap/clmm")
    const swapProvider = connector || networkConfig.swapProvider || 'uniswap/router';
    const [connectorName, connectorType] = swapProvider.split('/');

    logger.info(
      `Using swap provider: ${swapProvider} for network: ${network}${connector ? ' (explicit)' : ' (from config)'}`,
    );

    // For AMM and CLMM, look up the pool address using PoolService
    let poolAddress: string | undefined;
    if (connectorType === 'amm' || connectorType === 'clmm') {
      const poolService = PoolService.getInstance();
      const pool = await poolService.getPool('ethereum', network, connectorType, baseToken, quoteToken, connectorName);

      if (!pool) {
        throw httpErrors.notFound(
          `No ${connectorType.toUpperCase()} pool found for ${baseToken}-${quoteToken} on ${connectorName}/${network}`,
        );
      }

      poolAddress = pool.address;
      logger.info(`Found pool: ${poolAddress} for ${baseToken}-${quoteToken}`);
    }

    // Route to the appropriate connector based on swapProvider
    const providerKey = swapProvider;

    if (providerKey === 'uniswap/router') {
      return await uniswapRouterQuoteSwap(network, undefined, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'uniswap/amm') {
      return await uniswapAmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'uniswap/clmm') {
      return await uniswapClmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'pancakeswap/router') {
      return await pancakeswapRouterQuoteSwap(network, undefined, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'pancakeswap/amm') {
      return await pancakeswapAmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'pancakeswap/clmm') {
      return await pancakeswapClmmQuoteSwap(network, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === '0x/router') {
      return await zeroXRouterQuoteSwap(network, baseToken, quoteToken, amount, side, slippagePct);
    }

    throw httpErrors.badRequest(`Unsupported swap provider: ${swapProvider}`);
  } catch (error) {
    logger.error(`Error getting swap quote: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw httpErrors.internalServerError(`Failed to get swap quote: ${error.message}`);
  }
}

/**
 * Get a swap quote across any supported chain
 */
export async function getUnifiedQuoteSwap(
  chainNetwork: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  connector?: string,
  approximateIfNoExactOut?: boolean,
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(
    `[UnifiedSwap] Getting quote for ${baseToken}-${quoteToken} on ${chain}/${network}${connector ? ` using ${connector}` : ''}`,
  );

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumQuoteSwap(network, baseToken, quoteToken, amount, side, slippagePct, connector);

    case 'solana':
      return getSolanaQuoteSwap(
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        connector,
        approximateIfNoExactOut,
      );

    default:
      throw httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified swap quote route plugin
 * GET /quote
 */
export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/quote',
    {
      schema: {
        description: 'Get a swap quote for any supported chain',
        tags: ['/trading/swap'],
        querystring: UnifiedQuoteSwapRequestSchema,
        response: {
          200: ChainQuoteSwapResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { chainNetwork, baseToken, quoteToken, amount, side, slippagePct, approximateIfNoExactOut, connector } =
        request.query as UnifiedQuoteSwapRequest;

      try {
        const result = await getUnifiedQuoteSwap(
          chainNetwork,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          connector,
          approximateIfNoExactOut,
        );
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedSwap] Quote error: ${error.message}`);
        if (error.statusCode) {
          throw error;
        }
        throw fastify.httpErrors.internalServerError(error.message || 'Failed to get swap quote');
      }
    },
  );
};

export default quoteSwapRoute;
