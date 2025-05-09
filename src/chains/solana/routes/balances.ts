import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../solana';
import { logger } from '../../../services/logger';
import { BalanceRequestType, BalanceResponseType, BalanceRequestSchema, BalanceResponseSchema } from '../../../schemas/chain-schema';

export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[]
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const wallet = await solana.getWallet(address);
    
    const balances = await solana.getBalance(wallet, tokens);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${error.message}`);
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example - use a known Solana address as fallback
  const solana = await Solana.getInstance('mainnet-beta');

  // Well-known Solana address as fallback for example
  let firstWalletAddress = 'CuieVDEDtLo7FypA9SbLM9saXFdb1dsshEkyErMqkRQq';

  try {
    // Try to get user's first Solana wallet if available
    // getFirstWalletAddress specifically looks in the /solana directory
    const userWallet = await solana.getFirstWalletAddress();
    if (userWallet) {
      // Make sure it's a valid Solana address (base58 encoded, ~44 chars)
      const isValidSolanaAddress = userWallet.length >= 32 && userWallet.length <= 44;
      if (isValidSolanaAddress) {
        firstWalletAddress = userWallet;
        logger.info(`Using user's Solana wallet for examples: ${firstWalletAddress}`);
      }
    }
  } catch (error) {
    logger.warn('No Solana wallets found for examples in schema');
  }

  BalanceRequestSchema.properties.address.examples = [firstWalletAddress];
  
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
            tokens: {
              type: 'array',
              items: { type: 'string' },
              description: 'A list of token symbols or addresses',
              examples: [
                ['SOL', 'USDC'],
              ]
            }
          }
        },
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request) => {
      const { network, address, tokens } = request.body;
      return await getSolanaBalances(fastify, network, address, tokens);
    }
  );
};

export default balancesRoute;
