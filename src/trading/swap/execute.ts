import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

// Solana connector imports
import { getEthereumNetworkConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { executeSwap as zeroXRouterExecuteSwap } from '../../connectors/0x/router-routes/executeSwap';
import { executeSwap as dflowRouterExecuteSwap } from '../../connectors/dflow/router-routes/executeSwap';
import { executeSwap as jupiterRouterExecuteSwap } from '../../connectors/jupiter/router-routes/executeSwap';
import { executeSwap as meteoraAmmExecuteSwap } from '../../connectors/meteora/amm-routes/executeSwap';
import { executeSwap as meteoraClmmExecuteSwap } from '../../connectors/meteora/clmm-routes/executeSwap';
import { executeSwap as okxRouterExecuteSwap } from '../../connectors/okx/router-routes/executeSwap';
import { executeSwap as orcaClmmExecuteSwap } from '../../connectors/orca/clmm-routes/executeSwap';
import { executeSwap as pancakeswapAmmExecuteSwap } from '../../connectors/pancakeswap/amm-routes/executeSwap';
import { executeSwap as pancakeswapClmmExecuteSwap } from '../../connectors/pancakeswap/clmm-routes/executeSwap';
import { executeSwap as pancakeswapRouterExecuteSwap } from '../../connectors/pancakeswap/router-routes/executeSwap';
import { executeSwap as pancakeswapSolClmmExecuteSwap } from '../../connectors/pancakeswap-sol/clmm-routes/executeSwap';
import { executeSwap as raydiumAmmExecuteSwap } from '../../connectors/raydium/amm-routes/executeSwap';
import { executeSwap as raydiumClmmExecuteSwap } from '../../connectors/raydium/clmm-routes/executeSwap';
import { executeSwap as titanRouterExecuteSwap } from '../../connectors/titan/router-routes/executeSwap';

// Ethereum connector imports
import { executeSwap as uniswapAmmExecuteSwap } from '../../connectors/uniswap/amm-routes/executeSwap';
import { executeSwap as uniswapClmmExecuteSwap } from '../../connectors/uniswap/clmm-routes/executeSwap';
import { executeSwap as uniswapRouterExecuteSwap } from '../../connectors/uniswap/router-routes/executeSwap';

// Config and utilities
import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';
import { chainNetworkField, defaultWallet, parseChainNetwork, rethrowRouteError, slippagePctField } from '../common';

/**
 * Unified swap execute request schema
 * Accepts chain-network parameter like "solana-mainnet-beta", "ethereum-mainnet", or "ethereum-polygon"
 */
const UnifiedExecuteSwapRequestSchema = Type.Object({
  walletAddress: Type.String({
    description: 'Wallet address to execute swap from',
    default: defaultWallet,
  }),
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
  poolAddress: Type.Optional(
    Type.String({
      description:
        'Pin the swap to a specific pool. Only meaningful for amm/clmm providers, which trade against one ' +
        'pool; router providers choose their own route and reject it. Omit to resolve the pool from ' +
        "Gateway's configured pool list by token pair — which a pool that is not in that list (a freshly " +
        'created one, an unlisted token) cannot be, so pass its address here.',
    }),
  ),
  slippagePct: slippagePctField(),
  approximateIfNoExactOut: Type.Optional(
    Type.Boolean({
      description:
        'For BUY orders when the router has no ExactOut route: approximate via a sell-leg ExactIn quote instead of failing. Solana routers only.',
      default: true,
    }),
  ),
});

type UnifiedExecuteSwapRequest = Static<typeof UnifiedExecuteSwapRequestSchema>;

/**
 * Execute a Solana swap
 */
async function executeSolanaSwap(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  connector?: string,
  approximateIfNoExactOut?: boolean,
  requestedPoolAddress?: string,
): Promise<any> {
  try {
    const networkConfig = getSolanaNetworkConfig(network);

    // Get swap provider from connector parameter or config (e.g., "jupiter/router", "raydium/amm", "meteora/clmm")
    const swapProvider = connector || networkConfig.swapProvider || 'jupiter/router';
    const [connectorName, connectorType] = swapProvider.split('/');

    logger.info(
      `Using swap provider: ${swapProvider} for network: ${network}${connector ? ' (explicit)' : ' (from config)'}`,
    );

    // An explicit pin wins; otherwise resolve the pool from the configured list.
    let poolAddress: string | undefined = requestedPoolAddress;
    if (connectorType === 'amm' || connectorType === 'clmm') {
      if (!poolAddress) {
        const poolService = PoolService.getInstance();
        const pool = await poolService.getPool('solana', network, connectorType, baseToken, quoteToken, connectorName);

        if (!pool) {
          throw httpErrors.notFound(
            `No ${connectorType.toUpperCase()} pool found for ${baseToken}-${quoteToken} on ${connectorName}/${network}. ` +
              'Pass poolAddress to trade against a specific pool.',
          );
        }

        poolAddress = pool.address;
        logger.info(`Found pool: ${poolAddress} for ${baseToken}-${quoteToken}`);
      }
    } else if (requestedPoolAddress) {
      throw httpErrors.badRequest(
        `poolAddress is not supported for router provider ${swapProvider}: a router chooses its own route ` +
          'across pools. Use an amm or clmm provider to pin a pool.',
      );
    }

    // Route to the appropriate connector based on swapProvider
    const providerKey = swapProvider;

    if (providerKey === 'jupiter/router') {
      return await jupiterRouterExecuteSwap(
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'dflow/router') {
      return await dflowRouterExecuteSwap(
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'okx/router') {
      return await okxRouterExecuteSwap(
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'titan/router') {
      return await titanRouterExecuteSwap(
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
      );
    } else if (providerKey === 'meteora/amm') {
      return await meteoraAmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'raydium/amm') {
      return await raydiumAmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'raydium/clmm') {
      return await raydiumClmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'meteora/clmm') {
      return await meteoraClmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'pancakeswap-sol/clmm') {
      return await pancakeswapSolClmmExecuteSwap(
        network,
        walletAddress,
        poolAddress!,
        baseToken,
        side,
        amount,
        slippagePct,
      );
    } else if (providerKey === 'orca/clmm') {
      return await orcaClmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    }

    throw httpErrors.badRequest(`Unsupported swap provider: ${swapProvider}`);
  } catch (error) {
    logger.error(`Error executing swap: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }
}

/**
 * Execute an Ethereum swap
 */
async function executeEthereumSwap(
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  connector?: string,
  requestedPoolAddress?: string,
): Promise<any> {
  try {
    const networkConfig = getEthereumNetworkConfig(network);

    // Get swap provider from connector parameter or config (e.g., "uniswap/router", "uniswap/amm", "uniswap/clmm")
    const swapProvider = connector || networkConfig.swapProvider || 'uniswap/router';
    const [connectorName, connectorType] = swapProvider.split('/');

    logger.info(
      `Using swap provider: ${swapProvider} for network: ${network}${connector ? ' (explicit)' : ' (from config)'}`,
    );

    // An explicit pin wins; otherwise resolve the pool from the configured list.
    let poolAddress: string | undefined = requestedPoolAddress;
    if (connectorType === 'amm' || connectorType === 'clmm') {
      if (!poolAddress) {
        const poolService = PoolService.getInstance();
        const pool = await poolService.getPool(
          'ethereum',
          network,
          connectorType,
          baseToken,
          quoteToken,
          connectorName,
        );

        if (!pool) {
          throw httpErrors.notFound(
            `No ${connectorType.toUpperCase()} pool found for ${baseToken}-${quoteToken} on ${connectorName}/${network}. ` +
              'Pass poolAddress to trade against a specific pool.',
          );
        }

        poolAddress = pool.address;
        logger.info(`Found pool: ${poolAddress} for ${baseToken}-${quoteToken}`);
      }
    } else if (requestedPoolAddress) {
      throw httpErrors.badRequest(
        `poolAddress is not supported for router provider ${swapProvider}: a router chooses its own route ` +
          'across pools. Use an amm or clmm provider to pin a pool.',
      );
    }

    // Route to the appropriate connector based on swapProvider
    const providerKey = swapProvider;

    if (providerKey === 'uniswap/router') {
      return await uniswapRouterExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'uniswap/amm') {
      return await uniswapAmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'uniswap/clmm') {
      return await uniswapClmmExecuteSwap(network, walletAddress, poolAddress!, baseToken, side, amount, slippagePct);
    } else if (providerKey === 'pancakeswap/router') {
      return await pancakeswapRouterExecuteSwap(
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
      );
    } else if (providerKey === 'pancakeswap/amm') {
      return await pancakeswapAmmExecuteSwap(
        network,
        walletAddress,
        poolAddress!,
        baseToken,
        side,
        amount,
        slippagePct,
      );
    } else if (providerKey === 'pancakeswap/clmm') {
      return await pancakeswapClmmExecuteSwap(
        network,
        walletAddress,
        poolAddress!,
        baseToken,
        side,
        amount,
        slippagePct,
      );
    } else if (providerKey === '0x/router') {
      return await zeroXRouterExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
    }

    throw httpErrors.badRequest(`Unsupported swap provider: ${swapProvider}`);
  } catch (error) {
    logger.error(`Error executing swap: ${error.message}`);
    if (error.statusCode) {
      throw error;
    }
    throw httpErrors.internalServerError(`Failed to execute swap: ${error.message}`);
  }
}

/**
 * Execute a swap across any supported chain
 */
export async function executeUnifiedSwap(
  chainNetwork: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  connector?: string,
  approximateIfNoExactOut?: boolean,
  requestedPoolAddress?: string,
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(
    `[UnifiedSwap] Executing swap for ${baseToken}-${quoteToken} on ${chain}/${network}${connector ? ` using ${connector}` : ''}`,
  );

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return executeEthereumSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        connector,
        requestedPoolAddress,
      );

    case 'solana':
      return executeSolanaSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        connector,
        approximateIfNoExactOut,
        requestedPoolAddress,
      );

    default:
      throw httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified swap execute route plugin
 * POST /execute
 */
export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/execute',
    {
      schema: {
        description: 'Execute a swap on any supported chain',
        tags: ['/trading/swap'],
        body: UnifiedExecuteSwapRequestSchema,
        response: {
          200: ChainExecuteSwapResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        chainNetwork,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        approximateIfNoExactOut,
        connector,
        poolAddress,
      } = request.body as UnifiedExecuteSwapRequest;

      try {
        const result = await executeUnifiedSwap(
          chainNetwork,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct,
          connector,
          approximateIfNoExactOut,
          poolAddress,
        );
        return reply.code(200).send(result);
      } catch (error: any) {
        rethrowRouteError(error, 'Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;
