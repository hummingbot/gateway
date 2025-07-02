import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  BalanceRequestType,
  BalanceResponseType,
  BalanceRequestSchema,
  BalanceResponseSchema,
} from '../../../schemas/chain-schema';
import { tokenValueToString } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';

export async function getEthereumBalances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  tokens?: string[],
): Promise<BalanceResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    await ethereum.init();

    let wallet: ethers.Wallet;
    const balances: Record<string, number> = {};

    // Treat empty array as if no tokens were specified
    const effectiveTokens = tokens && tokens.length === 0 ? undefined : tokens;

    // If no tokens specified, check all tokens in the token list
    const checkAllTokens = !effectiveTokens;

    try {
      wallet = await ethereum.getWallet(address);
    } catch (err) {
      logger.error(`Failed to load wallet: ${err.message}`);
      throw fastify.httpErrors.internalServerError(
        `Failed to load wallet: ${err.message}`,
      );
    }

    // Always get native token balance
    const nativeBalance = await ethereum.getNativeBalance(wallet);
    // Convert string to number as required by schema
    balances[ethereum.nativeTokenSymbol] = parseFloat(
      tokenValueToString(nativeBalance),
    );

    if (checkAllTokens) {
      // No tokens specified, check all tokens in the token list
      logger.info(
        `Checking balances for all ${ethereum.storedTokenList.length} tokens in the token list`,
      );

      // Process tokens in batches to avoid overwhelming the provider
      // This allows for provider-specific rate limiting while still being efficient
      const batchSize = 25; // Reasonable default batch size
      const tokenList = ethereum.storedTokenList;
      const totalTokens = tokenList.length;

      // Set a maximum time limit for the entire operation
      const maxScanTimeMs = 30000; // 30 seconds maximum for scanning
      const startTime = Date.now();
      let timeExceeded = false;

      logger.info(
        `Processing ${totalTokens} tokens in batches of ${batchSize} with ${maxScanTimeMs}ms time limit`,
      );

      for (let i = 0; i < totalTokens && !timeExceeded; i += batchSize) {
        // Check if we've exceeded the time limit
        if (Date.now() - startTime > maxScanTimeMs) {
          logger.warn(
            `Time limit of ${maxScanTimeMs}ms exceeded after checking ${i} tokens. Stopping scan.`,
          );
          timeExceeded = true;
          break;
        }

        const batch = tokenList.slice(i, i + batchSize);
        logger.debug(
          `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalTokens / batchSize)}`,
        );

        // Process batch in parallel with timeout
        await Promise.all(
          batch.map(async (token) => {
            try {
              const contract = ethereum.getContract(
                token.address,
                ethereum.provider,
              );
              const balance = await ethereum.getERC20Balance(
                contract,
                wallet,
                token.decimals,
                3000, // 3 second timeout for better responsiveness
              );
              // Parse balance to number
              const balanceNum = parseFloat(tokenValueToString(balance));

              // Only add tokens with non-zero balances
              if (balanceNum > 0) {
                balances[token.symbol] = balanceNum;
                logger.debug(
                  `Found non-zero balance for ${token.symbol}: ${balanceNum}`,
                );
              }
            } catch (err) {
              // Log error but continue with other tokens
              logger.warn(
                `Error getting balance for ${token.symbol}: ${err.message}`,
              );
            }
          }),
        );
      }
    } else if (effectiveTokens) {
      // Get ERC20 token balances for specific tokens
      await Promise.all(
        effectiveTokens.map(async (symbolOrAddress) => {
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
              5000, // 5 second timeout for specifically requested tokens
            );
            // Convert string to number as required by schema
            balances[token.symbol] = parseFloat(tokenValueToString(balance));
          }
        }),
      );
    }

    if (!Object.keys(balances).length) {
      throw fastify.httpErrors.badRequest(
        'No token balances found for the given wallet',
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
  const firstWalletAddress = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: BalanceRequestType;
    Reply: BalanceResponseType;
  }>(
    '/balances',
    {
      schema: {
        description:
          'Get Ethereum balances. If no tokens specified or empty array provided, returns native token (ETH) and only non-zero balances for tokens from the token list. If specific tokens are requested, returns those exact tokens with their balances, including zeros.',
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
              description:
                'A list of token symbols or addresses. An empty array is treated the same as if the parameter was not provided, returning only non-zero balances plus the native token.',
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
      const { network, address, tokens } = request.body;
      return await getEthereumBalances(fastify, network, address, tokens);
    },
  );
};

export default balancesRoute;
