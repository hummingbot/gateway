import { Type, Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { executeEthereumSwap } from '../../chains/ethereum/routes/execute-swap';
import { executeSolanaSwap } from '../../chains/solana/routes/execute-swap';
import { ChainExecuteSwapResponseSchema } from '../../schemas/chain-schema';
import { logger } from '../../services/logger';

/**
 * Unified swap execute request schema
 * Accepts chain-network parameter like "solana-mainnet-beta", "ethereum-mainnet", or "ethereum-polygon"
 */
const UnifiedExecuteSwapRequestSchema = Type.Object({
  chainNetwork: Type.String({
    description:
      'Chain and network in format: chain-network (e.g., solana-mainnet-beta, ethereum-mainnet, ethereum-polygon)',
  }),
  walletAddress: Type.String({ description: 'Wallet address to execute swap from' }),
  baseToken: Type.String({ description: 'Symbol or address of the base token' }),
  quoteToken: Type.String({ description: 'Symbol or address of the quote token' }),
  amount: Type.Number({ description: 'Amount to swap' }),
  side: Type.Union([Type.Literal('BUY'), Type.Literal('SELL')], { description: 'Side of the swap (BUY or SELL)' }),
  slippagePct: Type.Optional(Type.Number({ description: 'Slippage tolerance percentage (optional)' })),
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
 * Execute a swap across any supported chain
 */
export async function executeUnifiedSwap(
  fastify: FastifyInstance,
  chainNetwork: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number,
): Promise<any> {
  const { chain, network } = parseChainNetwork(chainNetwork);

  logger.info(`[UnifiedSwap] Executing swap for ${baseToken}-${quoteToken} on ${chain}/${network}`);

  switch (chain.toLowerCase()) {
    case 'ethereum':
      return executeEthereumSwap(fastify, network, walletAddress, baseToken, quoteToken, amount, side, slippagePct);

    case 'solana':
      return executeSolanaSwap(fastify, network, walletAddress, baseToken, quoteToken, amount, side, slippagePct);

    default:
      throw fastify.httpErrors.badRequest(`Unsupported chain: ${chain}`);
  }
}

/**
 * Unified swap execute route plugin
 * POST /swap/execute
 */
export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/swap/execute',
    {
      schema: {
        description: 'Execute a swap on any supported chain',
        tags: ['swap'],
        body: UnifiedExecuteSwapRequestSchema,
        response: {
          200: ChainExecuteSwapResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { chainNetwork, walletAddress, baseToken, quoteToken, amount, side, slippagePct } =
        request.body as UnifiedExecuteSwapRequest;

      try {
        const result = await executeUnifiedSwap(
          fastify,
          chainNetwork,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side,
          slippagePct,
        );
        return reply.code(200).send(result);
      } catch (error: any) {
        logger.error(`[UnifiedSwap] Execute error: ${error.message}`);
        throw error;
      }
    },
  );
};

export default executeSwapRoute;
