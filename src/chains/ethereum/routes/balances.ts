import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { BalanceRequestType, BalanceResponseType, BalanceRequestSchema, BalanceResponseSchema } from '../../../schemas/chain-schema';
import { tokenValueToString } from '../../../services/base';
import { ethers } from 'ethers';

export async function getEthereumBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokenSymbols: string[]
): Promise<BalanceResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    await ethereum.init();
    
    let wallet: ethers.Wallet;
    const balances: Record<string, number> = {};

    try {
      wallet = await ethereum.getWallet(address);
    } catch (err) {
      logger.error(`Failed to load wallet: ${err.message}`);
      throw fastify.httpErrors.internalServerError(`Failed to load wallet: ${err.message}`);
    }

    // Get native token balance if requested
    if (tokenSymbols.includes(ethereum.nativeTokenSymbol)) {
      const nativeBalance = await ethereum.getNativeBalance(wallet);
      // Convert string to number as required by schema
      balances[ethereum.nativeTokenSymbol] = parseFloat(tokenValueToString(nativeBalance));
    }

    // Get ERC20 token balances
    await Promise.all(
      tokenSymbols.map(async (symbol) => {
        const token = ethereum.getTokenBySymbol(symbol);
        if (token) {
          const contract = ethereum.getContract(
            token.address,
            ethereum.provider
          );
          const balance = await ethereum.getERC20Balance(
            contract,
            wallet,
            token.decimals
          );
          // Convert string to number as required by schema
          balances[symbol] = parseFloat(tokenValueToString(balance));
        }
      })
    );

    if (!Object.keys(balances).length) {
      throw fastify.httpErrors.badRequest('No token balances found for the given symbols');
    }
    
    return { balances };
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw if it's already a Fastify error
    }
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error.message}`);
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description: 'Get Ethereum balances',
        tags: ['ethereum'],
        body: {
          ...BalanceRequestSchema,
          properties: {
            ...BalanceRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet', 'sepolia', 'polygon'] },
            tokenSymbols: { 
              type: 'array', 
              items: { type: 'string' },
              examples: [['ETH', 'USDC', 'DAI']]
            }
          }
        },
        response: {
          200: BalanceResponseSchema
        }
      }
    },
    async (request) => {
      const { network, address, tokenSymbols = [] } = request.body;
      return await getEthereumBalances(fastify, network, address, tokenSymbols);
    }
  );
};

export default balancesRoute;