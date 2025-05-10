import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import {
  BalanceRequestType,
  BalanceResponseType,
  BalanceRequestSchema,
  BalanceResponseSchema,
} from '../../../schemas/chain-schema';
import { tokenValueToString } from '../../../services/base';
import { ethers } from 'ethers';

export async function getEthereumBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens: string[],
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
      throw fastify.httpErrors.internalServerError(
        `Failed to load wallet: ${err.message}`,
      );
    }

    // Get native token balance if requested
    if (tokens.includes(ethereum.nativeTokenSymbol)) {
      const nativeBalance = await ethereum.getNativeBalance(wallet);
      // Convert string to number as required by schema
      balances[ethereum.nativeTokenSymbol] = parseFloat(
        tokenValueToString(nativeBalance),
      );
    }

    // Get ERC20 token balances
    await Promise.all(
      tokens.map(async (symbolOrAddress) => {
        // Don't process the native token again
        if (symbolOrAddress === ethereum.nativeTokenSymbol) {
          return;
        }

        const token = ethereum.getTokenBySymbol(symbolOrAddress);
        if (token) {
          const contract = ethereum.getContract(
            token.address,
            ethereum.provider,
          );
          const balance = await ethereum.getERC20Balance(
            contract,
            wallet,
            token.decimals,
          );
          // Convert string to number as required by schema
          balances[token.symbol] = parseFloat(tokenValueToString(balance));
        }
      }),
    );

    if (!Object.keys(balances).length) {
      throw fastify.httpErrors.badRequest(
        'No token balances found for the given tokens',
      );
    }

    return { balances };
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw if it's already a Fastify error
    }
    logger.error(`Error getting balances: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to get balances: ${error.message}`,
    );
  }
}

export const balancesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');

  // Default Ethereum address for examples if no wallet is available
  let firstWalletAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

  try {
    // Try to get user's first Ethereum wallet if available
    // getFirstWalletAddress specifically looks in the /ethereum directory
    const userWallet = await ethereum.getFirstWalletAddress();
    if (userWallet) {
      // Make sure it's a valid Ethereum address (0x prefix and 42 chars)
      const isValidEthAddress = /^0x[a-fA-F0-9]{40}$/i.test(userWallet);
      if (isValidEthAddress) {
        firstWalletAddress = userWallet;
        logger.info(`Using user's Ethereum wallet for examples: ${firstWalletAddress}`);
      }
    }
  } catch (error) {
    logger.warn('No Ethereum wallets found for examples in schema');
  }

  BalanceRequestSchema.properties.address.examples = [firstWalletAddress];

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
            network: {
              type: 'string',
              examples: [
                'mainnet',
                'arbitrum',
                'optimism',
                'base',
                'sepolia',
                'bsc',
                'avalanche',
                'celo',
                'polygon',
                'blast',
                'zora',
                'worldchain',
              ],
            },
            address: { type: 'string', examples: [firstWalletAddress] },
            tokens: {
              type: 'array',
              items: { type: 'string' },
              description: 'A list of token symbols or addresses',
              examples: [
                [
                  'ETH',
                  'USDC',
                  'DAI',
                  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                ],
              ],
            },
          },
        },
        response: {
          200: BalanceResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, tokens = [] } = request.body;
      return await getEthereumBalances(fastify, network, address, tokens);
    },
  );
};

export default balancesRoute;
