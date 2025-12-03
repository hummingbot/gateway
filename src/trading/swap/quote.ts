import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

// Solana connector imports
import { getEthereumNetworkConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { quoteSwap as zeroXRouterQuoteSwap } from '../../connectors/0x/router-routes/quoteSwap';
import { quoteSwap as jupiterRouterQuoteSwap } from '../../connectors/jupiter/router-routes/quoteSwap';
import { quoteSwap as meteoraClmmQuoteSwap } from '../../connectors/meteora/clmm-routes/quoteSwap';
import { quoteSwap as orcaClmmQuoteSwap } from '../../connectors/orca/clmm-routes/quoteSwap';
import { quoteSwap as pancakeswapAmmQuoteSwap } from '../../connectors/pancakeswap/amm-routes/quoteSwap';
import { quoteSwap as pancakeswapClmmQuoteSwap } from '../../connectors/pancakeswap/clmm-routes/quoteSwap';
import { quoteSwap as pancakeswapRouterQuoteSwap } from '../../connectors/pancakeswap/router-routes/quoteSwap';
import { quoteSwap as pancakeswapSolClmmQuoteSwap } from '../../connectors/pancakeswap-sol/clmm-routes/quoteSwap';
import { quoteSwap as raydiumAmmQuoteSwap } from '../../connectors/raydium/amm-routes/quoteSwap';
import { quoteSwap as raydiumClmmQuoteSwap } from '../../connectors/raydium/clmm-routes/quoteSwap';

// Ethereum connector imports
import { quoteSwap as uniswapAmmQuoteSwap } from '../../connectors/uniswap/amm-routes/quoteSwap';
import { quoteSwap as uniswapClmmQuoteSwap } from '../../connectors/uniswap/clmm-routes/quoteSwap';
import { quoteSwap as uniswapRouterQuoteSwap } from '../../connectors/uniswap/router-routes/quoteSwap';

// Config and utilities
import { ChainQuoteSwapResponseSchema } from '../../schemas/chain-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';

/**
 * Unified swap quote request schema
 * Accepts chain-network parameter like "solana-mainnet-beta", "ethereum-mainnet", or "ethereum-polygon"
 */
const UnifiedQuoteSwapRequestSchema = Type.Object({
  chainNetwork: Type.String({
    description:
      'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet, ethereum-polygon)',
    default: 'solana-mainnet-beta',
  }),
  connector: Type.Optional(
    Type.String({
      description:
        "Connector to use in format: connector/type (e.g., jupiter/router, raydium/amm, uniswap/clmm). If not provided, uses network's configured swapProvider",
      default: 'jupiter/router',
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
});

type UnifiedQuoteSwapRequest = Static<typeof UnifiedQuoteSwapRequestSchema>;

/**
 * Parse chain-network parameter into chain and network
 * Examples: "solana-mainnet-beta" -> {chain: "solana", network: "mainnet-beta"}
 *          "ethereum-mainnet" -> {chain: "ethereum", network: "mainnet"}
 *          "ethereum-polygon" -> {chain: "ethereum", network: "polygon"}
 */
function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');

  if (parts.length < 2) {
    throw new Error(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }

  // First part is always the chain
  const chain = parts[0];

  // Rest is the network (e.g., "mainnet-beta" from ["solana", "mainnet", "beta"])
  const network = parts.slice(1).join('-');

  return { chain, network };
}

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
      const pool = await poolService.getPool(connectorName, network, connectorType, baseToken, quoteToken);

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
        undefined, // onlyDirectRoutes
        undefined, // restrictIntermediateTokens
      );
    } else if (providerKey === 'raydium/amm') {
      return await raydiumAmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'raydium/clmm') {
      return await raydiumClmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'meteora/clmm') {
      return await meteoraClmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'pancakeswap-sol/clmm') {
      return await pancakeswapSolClmmQuoteSwap(network, baseToken, quoteToken, amount, side, poolAddress, slippagePct);
    } else if (providerKey === 'orca/clmm') {
      return await orcaClmmQuoteSwap(network, baseToken, quoteToken, amount, side, poolAddress!, slippagePct);
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
      const pool = await poolService.getPool(connectorName, network, connectorType, baseToken, quoteToken);

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
      return await uniswapRouterQuoteSwap(network, undefined, baseToken, quoteToken, amount, side, slippagePct || 1);
    } else if (providerKey === 'uniswap/amm') {
      return await uniswapAmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'uniswap/clmm') {
      return await uniswapClmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'pancakeswap/router') {
      return await pancakeswapRouterQuoteSwap(network, undefined, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'pancakeswap/amm') {
      return await pancakeswapAmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'pancakeswap/clmm') {
      return await pancakeswapClmmQuoteSwap(network, poolAddress!, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === '0x/router') {
      return await zeroXRouterQuoteSwap(network, baseToken, quoteToken, amount, side, slippagePct || 1);
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
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(
    `[UnifiedSwap] Getting quote for ${baseToken}-${quoteToken} on ${chain}/${network}${connector ? ` using ${connector}` : ''}`,
  );

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumQuoteSwap(network, baseToken, quoteToken, amount, side, slippagePct, connector);

    case 'solana':
      return getSolanaQuoteSwap(network, baseToken, quoteToken, amount, side, slippagePct, connector);

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
      const { chainNetwork, baseToken, quoteToken, amount, side, slippagePct, connector } =
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
