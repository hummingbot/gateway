import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { BalanceRequestType, BalanceResponseType, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaBalanceRequest } from '../schemas';
import { Solana } from '../solana';

/**
 * Main entry point for getting Solana balances
 */
export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
  fetchAll?: boolean,
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const balances = await solana.getBalances(address, tokens, fetchAll);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);

    // Re-throw rate limit errors (statusCode 429) without wrapping
    if (error.statusCode === 429) {
      throw error;
    }

    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

// Store active subscriptions per instance (in-memory)
const activeSubscriptions = new Map<
  number,
  {
    network: string;
    address: string;
  }
>();

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description:
          'Get token balances for a Solana address. If no tokens specified or empty array provided, returns non-zero balances for tokens from the token list that are found in the wallet (includes SOL even if zero). If specific tokens are requested, returns those exact tokens with their balances, including zeros.',
        tags: ['/chain/solana'],
        body: SolanaBalanceRequest,
        response: {
          200: {
            ...BalanceResponseSchema,
            description: 'Token balances for the specified address',
            examples: [
              {
                balances: {
                  SOL: 1.5,
                  USDC: 100.0,
                  BONK: 50000.0,
                },
              },
              {
                balances: {
                  SOL: 1.5,
                  USDC: 100.0,
                  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 25.0, // Full mint address used for tokens not in token list
                },
              },
            ],
          },
        },
      },
    },
    async (request) => {
      const { network, address, tokens, fetchAll } = request.body;
      return await getSolanaBalances(fastify, network, address, tokens, fetchAll);
    },
  );

  // WebSocket subscription endpoint (internal only - not documented in Swagger)
  fastify.post<{
    Body: {
      network: string;
      address: string;
    };
    Reply: {
      subscriptionId: number;
      message: string;
      initialBalances: {
        sol: number;
        tokens: Array<{
          symbol: string;
          address: string;
          balance: number;
          decimals: number;
        }>;
      };
    };
  }>('/subscribe-balances', async (request) => {
    const { network, address } = request.body;
    const solana = await Solana.getInstance(network);

    // Get initial balances
    const initialBalancesRaw = await solana.getBalances(address);
    const balancesData = initialBalancesRaw.balances;
    const solBalance = (balancesData['SOL'] as number) || 0;

    // Get token list once
    const tokenList = await solana.getTokenList();

    const tokenBalances = Object.entries(balancesData)
      .filter(([symbol]) => symbol !== 'SOL')
      .map(([symbol, balance]) => {
        // Find token info from token list
        const tokenInfo = tokenList.find((t) => t.symbol === symbol);
        return {
          symbol,
          address: tokenInfo?.address || '',
          balance: balance as number,
          decimals: tokenInfo?.decimals || 9,
        };
      });

    // Subscribe to updates
    const subscriptionId = await solana.subscribeToWalletBalance(address, (balances) => {
      logger.info(`Wallet ${address} balance updated at slot ${balances.slot}:`, {
        sol: balances.sol,
        tokenCount: balances.tokens.length,
      });
      // In a real-world scenario, you'd emit this via Server-Sent Events (SSE) or WebSocket to the client
      // For now, we just log it
    });

    // Store subscription metadata
    activeSubscriptions.set(subscriptionId, { network, address });

    return {
      subscriptionId,
      message: 'Subscribed to wallet balance updates. Balance changes will be logged.',
      initialBalances: {
        sol: solBalance,
        tokens: tokenBalances,
      },
    };
  });

  // Unsubscribe endpoint (internal only - not documented in Swagger)
  fastify.delete<{
    Body: {
      network: string;
      subscriptionId: number;
    };
    Reply: {
      message: string;
    };
  }>('/unsubscribe-balances', async (request) => {
    const { network, subscriptionId } = request.body;
    const solana = await Solana.getInstance(network);

    // Check if subscription exists
    const subscription = activeSubscriptions.get(subscriptionId);
    if (!subscription) {
      throw fastify.httpErrors.notFound(`Subscription ID ${subscriptionId} not found`);
    }

    // Unsubscribe
    await solana.unsubscribeFromWalletBalance(subscriptionId);
    activeSubscriptions.delete(subscriptionId);

    return { message: 'Unsubscribed successfully' };
  });
};

export default balancesRoute;
