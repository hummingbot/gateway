import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getEthereumQuoteSwap } from '../../chains/ethereum/routes/quote-swap';
import { getSolanaQuoteSwap } from '../../chains/solana/routes/quote-swap';
import { ChainQuoteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';

/**
 * Unified swap quote request schema
 * Accepts chain-network parameter like "solana-mainnet-beta", "ethereum-mainnet", or "ethereum-polygon"
 */
const UnifiedQuoteSwapRequestSchema = Type.Object({
  chainNetwork: Type.String({
    description:
      'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet, ethereum-polygon)',
  }),
  baseToken: Type.String({ description: 'Symbol or address of the base token' }),
  quoteToken: Type.String({ description: 'Symbol or address of the quote token' }),
  amount: Type.Number({ description: 'Amount to swap' }),
  side: Type.Union([Type.Literal('BUY'), Type.Literal('SELL')], { description: 'Side of the swap (BUY or SELL)' }),
  slippagePct: Type.Optional(Type.Number({ description: 'Slippage tolerance percentage (optional)' })),
  walletAddress: Type.Optional(
    Type.String({ description: 'Wallet address for quote (optional, required for some chains)' }),
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
 * Get a swap quote across any supported chain
 */
export async function getUnifiedQuoteSwap(
  fastify: FastifyInstance,
  chainNetwork: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
  walletAddress?: string,
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedSwap] Getting quote for ${baseToken}-${quoteToken} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return getEthereumQuoteSwap(fastify, network, baseToken, quoteToken, amount, side, slippagePct, walletAddress);

    case 'solana':
      return getSolanaQuoteSwap(fastify, network, baseToken, quoteToken, amount, side, slippagePct);

    default:
      throw fastify.httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified swap quote route plugin
 * GET /swap/quote
 */
export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/swap/quote',
    {
      schema: {
        description: 'Get a swap quote for any supported chain',
        tags: ['swap'],
        querystring: UnifiedQuoteSwapRequestSchema,
        response: {
          200: ChainQuoteSwapResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { chainNetwork, baseToken, quoteToken, amount, side, slippagePct, walletAddress } =
        request.query as UnifiedQuoteSwapRequest;

      try {
        const result = await getUnifiedQuoteSwap(
          fastify,
          chainNetwork,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
          walletAddress,
        );
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedSwap] Quote error: ${error.message}`);
        throw error;
      }
    },
  );
};

export default quoteSwapRoute;
