import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { getEthereumChainConfig } from '../../chains/ethereum/ethereum.config';
import { getSolanaChainConfig } from '../../chains/solana/solana.config';
import { quotePosition as meteoraQuotePosition } from '../../connectors/meteora/clmm-routes/quotePosition';
import { quotePosition as orcaQuotePosition } from '../../connectors/orca/clmm-routes/quotePosition';
import { quotePosition as pancakeswapQuotePosition } from '../../connectors/pancakeswap/clmm-routes/quotePosition';
import { quotePosition as pancakeswapSolQuotePosition } from '../../connectors/pancakeswap-sol/clmm-routes/quotePosition';
import { quotePosition as raydiumQuotePosition } from '../../connectors/raydium/clmm-routes/quotePosition';
import { quotePosition as uniswapQuotePosition } from '../../connectors/uniswap/clmm-routes/quotePosition';
import { QuotePositionResponseType, QuotePositionResponse } from '../../schemas/clmm-schema';
import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

// Constants for examples (using Meteora CLMM values)
const BASE_TOKEN_AMOUNT = 0.01;
const QUOTE_TOKEN_AMOUNT = 2;
const LOWER_PRICE_BOUND = 150;
const UPPER_PRICE_BOUND = 250;
const CLMM_POOL_ADDRESS_EXAMPLE = '2sf5NYcY4zUPXUSmG6f66mskb24t5F8S11pC1Nz5nQT3';

/**
 * Unified quote position request schema
 */
const UnifiedQuotePositionRequestSchema = Type.Object({
  connector: Type.String({
    description: 'CLMM connector (raydium, meteora, pancakeswap-sol, uniswap, pancakeswap, orca)',
    enum: ['raydium', 'meteora', 'pancakeswap-sol', 'uniswap', 'pancakeswap', 'orca'],
    default: 'meteora',
    examples: ['meteora'],
  }),
  chainNetwork: Type.String({
    description: 'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)',
    default: 'solana-mainnet-beta',
    examples: ['solana-mainnet-beta'],
  }),
  lowerPrice: Type.Number({
    description: 'Lower price bound for the position',
    examples: [LOWER_PRICE_BOUND],
  }),
  upperPrice: Type.Number({
    description: 'Upper price bound for the position',
    examples: [UPPER_PRICE_BOUND],
  }),
  poolAddress: Type.String({
    description: 'Pool contract address',
    examples: [CLMM_POOL_ADDRESS_EXAMPLE],
  }),
  baseTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of base token to deposit',
      examples: [BASE_TOKEN_AMOUNT],
    }),
  ),
  quoteTokenAmount: Type.Optional(
    Type.Number({
      description: 'Amount of quote token to deposit',
      examples: [QUOTE_TOKEN_AMOUNT],
    }),
  ),
  slippagePct: Type.Optional(
    Type.Number({
      minimum: 0,
      maximum: 100,
      description: 'Maximum acceptable slippage percentage',
      default: 1,
      examples: [1],
    }),
  ),
});

type UnifiedQuotePositionRequest = Static<typeof UnifiedQuotePositionRequestSchema>;

/**
 * Parse chain-network parameter into chain and network
 */
function parseChainNetwork(chainNetwork: string): { chain: string; network: string } {
  const parts = chainNetwork.split('-');

  if (parts.length < 2) {
    throw new Error(
      `Invalid chain-network format: ${chainNetwork}. Expected format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet)`,
    );
  }

  const chain = parts[0];
  const network = parts.slice(1).join('-');

  return { chain, network };
}

/**
 * Quote position from Solana connectors
 */
async function getSolanaQuotePosition(
  connector: string,
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<QuotePositionResponseType> {
  logger.info(`[CLMM] Quoting position from ${connector} on solana/${network}`);

  switch (connector) {
    case 'raydium':
      return await raydiumQuotePosition(
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );
    case 'meteora':
      return await meteoraQuotePosition(
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );
    case 'pancakeswap-sol':
      return await pancakeswapSolQuotePosition(
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
      );
    case 'orca':
      return await orcaQuotePosition(
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );
    default:
      throw httpErrors.badRequest(`Unsupported Solana CLMM connector: ${connector}`);
  }
}

/**
 * Quote position from Ethereum connectors
 */
async function getEthereumQuotePosition(
  connector: string,
  network: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<QuotePositionResponseType> {
  logger.info(`[CLMM] Quoting position from ${connector} on ethereum/${network}`);

  switch (connector) {
    case 'uniswap':
      return await uniswapQuotePosition(
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );
    case 'pancakeswap':
      return await pancakeswapQuotePosition(
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );
    default:
      throw httpErrors.badRequest(`Unsupported Ethereum CLMM connector: ${connector}`);
  }
}

/**
 * Quote position across any supported CLMM connector
 */
export async function getUnifiedQuotePosition(
  connector: string,
  chainNetwork: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<QuotePositionResponseType> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedCLMM] Quoting position using ${connector} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumQuotePosition(
        connector,
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );

    case 'solana':
      return getSolanaQuotePosition(
        connector,
        network,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      );

    default:
      throw httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified CLMM quote position route
 * GET /trading/clmm/quote-position
 */
export const quotePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: UnifiedQuotePositionRequest;
    Reply: QuotePositionResponseType;
  }>(
    '/quote-position',
    {
      schema: {
        description: 'Quote amounts for a new CLMM position from any supported connector',
        tags: ['/trading/clmm'],
        querystring: UnifiedQuotePositionRequestSchema,
        response: {
          200: QuotePositionResponse,
        },
      },
    },
    async (request, reply) => {
      const {
        connector,
        chainNetwork,
        lowerPrice,
        upperPrice,
        poolAddress,
        baseTokenAmount,
        quoteTokenAmount,
        slippagePct,
      } = request.query;

      try {
        const result = await getUnifiedQuotePosition(
          connector,
          chainNetwork,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedCLMM] Quote position error: ${error.message}`);
        throw error;
      }
    },
  );
};

export default quotePositionRoute;
