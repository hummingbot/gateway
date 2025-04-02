import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Solana } from '../solana';
import { logger } from '../../../services/logger';
import { BalanceRequestType, BalanceResponseType, BalanceRequestSchema, BalanceResponseSchema } from '../../../schemas/chain-schema';

export async function getSolanaBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokenSymbols?: string[]
): Promise<BalanceResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const wallet = await solana.getWallet(address);
    
    const balances = await solana.getBalance(wallet, tokenSymbols);
    return { balances };
  } catch (error) {
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${error.message}`);
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress() || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
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
            tokenSymbols: { 
              type: 'array', 
              items: { type: 'string' },
              examples: [['SOL', 'USDC']]
            }
          }
        },
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request) => {
      const { network, address, tokenSymbols } = request.body;
      return await getSolanaBalances(fastify, network, address, tokenSymbols);
    }
  );
};

export default balancesRoute;
