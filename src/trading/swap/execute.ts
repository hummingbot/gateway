import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

// Solana connector imports
import { getEthereumChainConfig, getEthereumNetworkConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig, getSolanaNetworkConfig } from '../../chains/solana/solana.config';
import { executeSwap as zeroXRouterExecuteSwap } from '../../connectors/0x/router-routes/executeSwap';
import { executeSwap as jupiterRouterExecuteSwap } from '../../connectors/jupiter/router-routes/executeSwap';
import { executeSwap as meteoraClmmExecuteSwap } from '../../connectors/meteora/clmm-routes/executeSwap';
import { executeSwap as orcaClmmExecuteSwap } from '../../connectors/orca/clmm-routes/executeSwap';
import { executeSwap as pancakeswapAmmExecuteSwap } from '../../connectors/pancakeswap/amm-routes/executeSwap';
import { executeSwap as pancakeswapClmmExecuteSwap } from '../../connectors/pancakeswap/clmm-routes/executeSwap';
import { executeSwap as pancakeswapRouterExecuteSwap } from '../../connectors/pancakeswap/router-routes/executeSwap';
import { executeSwap as pancakeswapSolClmmExecuteSwap } from '../../connectors/pancakeswap-sol/clmm-routes/executeSwap';
import { executeSwap as raydiumAmmExecuteSwap } from '../../connectors/raydium/amm-routes/executeSwap';
import { executeSwap as raydiumClmmExecuteSwap } from '../../connectors/raydium/clmm-routes/executeSwap';

// Ethereum connector imports
import { executeSwap as uniswapAmmExecuteSwap } from '../../connectors/uniswap/amm-routes/executeSwap';
import { executeSwap as uniswapClmmExecuteSwap } from '../../connectors/uniswap/clmm-routes/executeSwap';
import { executeSwap as uniswapRouterExecuteSwap } from '../../connectors/uniswap/router-routes/executeSwap';

// Config and utilities
import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';
import { PoolService } from '../../services/pool-service';

// Get default wallet from Solana config, fallback to Ethereum if Solana doesn't exist
let defaultWallet: string;
try {
  const solanaChainConfig = getSolanaChainConfig();
  defaultWallet = solanaChainConfig.defaultWallet;
} catch {
  const ethereumChainConfig = getEthereumChainConfig();
  defaultWallet = ethereumChainConfig.defaultWallet;
}

/**
 * Unified swap execute request schema
 * Accepts chain-network parameter like "solana-mainnet-beta", "ethereum-mainnet", or "ethereum-polygon"
 */
const UnifiedExecuteSwapRequestSchema = Type.Object({
  walletAddress: Type.String({
    description: 'Wallet address to execute swap from',
    default: defaultWallet,
  }),
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

type UnifiedExecuteSwapRequest = Static<typeof UnifiedExecuteSwapRequestSchema>;

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
      return await jupiterRouterExecuteSwap(
        walletAddress,
        network,
        baseToken,
        quoteToken,
        amount,
        side,
        slippagePct,
        undefined, // priorityLevel
        undefined, // maxLamports
      );
    } else if (providerKey === 'raydium/amm') {
      return await raydiumAmmExecuteSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct,
      );
    } else if (providerKey === 'raydium/clmm') {
      return await raydiumClmmExecuteSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct,
      );
    } else if (providerKey === 'meteora/clmm') {
      return await meteoraClmmExecuteSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct,
      );
    } else if (providerKey === 'pancakeswap-sol/clmm') {
      return await pancakeswapSolClmmExecuteSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress,
        slippagePct,
      );
    } else if (providerKey === 'orca/clmm') {
      return await orcaClmmExecuteSwap(
        network,
        walletAddress,
        baseToken,
        quoteToken,
        amount,
        side,
        poolAddress!,
        slippagePct,
      );
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
): Promise<any> {
  try {
    const networkConfig = getEthereumNetworkConfig(network);

    // Get swap provider from connector parameter or config (e.g., "uniswap/router", "uniswap/amm", "uniswap/clmm")
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
      return await uniswapRouterExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'uniswap/amm') {
      return await uniswapAmmExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'uniswap/clmm') {
      return await uniswapClmmExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
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
      return await pancakeswapAmmExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
    } else if (providerKey === 'pancakeswap/clmm') {
      return await pancakeswapClmmExecuteSwap(walletAddress, network, baseToken, quoteToken, amount, side, slippagePct);
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
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(
    `[UnifiedSwap] Executing swap for ${baseToken}-${quoteToken} on ${chain}/${network}${connector ? ` using ${connector}` : ''}`,
  );

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return executeEthereumSwap(network, walletAddress, baseToken, quoteToken, amount, side, slippagePct, connector);

    case 'solana':
      return executeSolanaSwap(network, walletAddress, baseToken, quoteToken, amount, side, slippagePct, connector);

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
      const { chainNetwork, walletAddress, baseToken, quoteToken, amount, side, slippagePct, connector } =
        request.body as UnifiedExecuteSwapRequest;

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
        );
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedSwap] Execute error: ${error.message}`);
        if (error.statusCode) {
          throw error;
        }
        throw fastify.httpErrors.internalServerError(error.message || 'Failed to execute swap');
      }
    },
  );
};

export default executeSwapRoute;
