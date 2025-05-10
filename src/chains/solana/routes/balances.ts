import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  BalanceRequestType,
  BalanceResponseType,
  BalanceRequestSchema,
  BalanceResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const wallet = await solana.getWallet(address);

    const balances = await solana.getBalance(wallet, tokens);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to load wallet: ${error.message}`,
    );
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example - use a known Solana address as fallback
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';

  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  // Example address for Solana tokens
  const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC on Solana
  const BONK_MINT_ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK on Solana

  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description: 'Get token balances for a Solana address',
        tags: ['solana'],
        body: {
          ...BalanceRequestSchema,
          properties: {
            ...BalanceRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
            address: { type: 'string', examples: [firstWalletAddress] },
            tokens: {
              type: 'array',
              items: { type: 'string' },
              description:
                'A list of token symbols (SOL, USDC, BONK) or token mint addresses. Both formats are accepted and will be automatically detected.',
              examples: [
                ['SOL', 'USDC', 'BONK'],
                ['SOL', USDC_MINT_ADDRESS, BONK_MINT_ADDRESS],
              ],
            },
          },
        },
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
      const { network, address, tokens } = request.body;
      return await getSolanaBalances(fastify, network, address, tokens);
    },
  );
};

export default balancesRoute;
