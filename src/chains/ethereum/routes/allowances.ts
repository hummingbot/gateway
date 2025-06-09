import { Type } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender } from '../../../connectors/uniswap/uniswap.contracts';
import {
  AllowancesRequestType,
  AllowancesResponseType,
} from '../../../schemas/chain-schema';
import { tokenValueToString } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum, TokenInfo } from '../ethereum';

export async function getTokensToTokenInfo(
  ethereum: Ethereum,
  tokens: Array<string>,
): Promise<Record<string, TokenInfo>> {
  const tokenInfoMap: Record<string, TokenInfo> = {};

  for (let i = 0; i < tokens.length; i++) {
    const symbolOrAddress = tokens[i];
    const tokenInfo = ethereum.getTokenBySymbol(symbolOrAddress);
    if (tokenInfo) {
      // Use the actual token symbol as the key, not the input which might be an address
      tokenInfoMap[tokenInfo.symbol] = tokenInfo;
    }
  }

  return tokenInfoMap;
}

export async function getEthereumAllowances(
  fastify: FastifyInstance,
  network: string,
  address: string,
  spender: string,
  tokens: string[],
) {
  try {
    const ethereum = await Ethereum.getInstance(network);
    await ethereum.init();
    const wallet = await ethereum.getWallet(address);
    const tokenInfoMap = await getTokensToTokenInfo(ethereum, tokens);

    // Check if any tokens were not found and create a helpful error message
    const foundSymbols = Object.keys(tokenInfoMap);
    if (foundSymbols.length === 0) {
      const errorMsg = `None of the provided tokens were found: ${tokens.join(', ')}`;
      logger.error(errorMsg);
      throw fastify.httpErrors.badRequest(errorMsg);
    }

    const missingTokens = tokens.filter(
      (t) =>
        !Object.values(tokenInfoMap).some(
          (token) =>
            token.symbol.toUpperCase() === t.toUpperCase() ||
            token.address.toLowerCase() === t.toLowerCase(),
        ),
    );

    if (missingTokens.length > 0) {
      logger.warn(`Some tokens were not found: ${missingTokens.join(', ')}`);
    }

    // Determine the spender address based on the input
    let spenderAddress: string;
    try {
      // Check if the spender parameter is a connector name
      if (spender.includes('/') || spender === 'uniswap') {
        logger.info(`Looking up spender address for connector: ${spender}`);
        spenderAddress = getSpender(network, spender);
        logger.info(
          `Resolved connector ${spender} to spender address: ${spenderAddress}`,
        );
      } else {
        // Otherwise assume it's a direct address
        spenderAddress = spender;
      }
    } catch (error) {
      logger.error(`Failed to resolve spender address: ${error.message}`);
      throw fastify.httpErrors.badRequest(`Invalid spender: ${error.message}`);
    }

    const approvals: Record<string, string> = {};
    await Promise.all(
      Object.keys(tokenInfoMap).map(async (symbol) => {
        const contract = ethereum.getContract(
          tokenInfoMap[symbol].address,
          ethereum.provider,
        );
        approvals[symbol] = tokenValueToString(
          await ethereum.getERC20Allowance(
            contract,
            wallet,
            spenderAddress,
            tokenInfoMap[symbol].decimals,
          ),
        );
      }),
    );

    return {
      spender: spenderAddress,
      approvals: approvals,
    };
  } catch (error) {
    logger.error(`Error getting allowances: ${error.message}`);
    if (error.statusCode === 400) {
      throw error; // Rethrow badRequest errors
    }
    throw fastify.httpErrors.internalServerError(
      `Failed to get allowances: ${error.message}`,
    );
  }
}

export const allowancesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.post<{
    Body: AllowancesRequestType;
    Reply: AllowancesResponseType;
  }>(
    '/allowances',
    {
      schema: {
        description: 'Get token allowances',
        tags: ['ethereum'],
        body: Type.Object({
          network: Type.String({
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
          }),
          address: Type.String({ examples: [firstWalletAddress] }),
          spender: Type.String({
            examples: [
              'uniswap/clmm',
              'uniswap',
              '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
            ],
            description:
              'Spender can be a connector name (e.g., uniswap/clmm, uniswap/amm, uniswap) or a direct contract address',
          }),
          tokens: Type.Array(Type.String(), { examples: [['USDC', 'DAI']] }),
        }),
        response: {
          200: Type.Object({
            spender: Type.String(),
            approvals: Type.Record(Type.String(), Type.String()),
          }),
        },
      },
    },
    async (request) => {
      const { network, address, spender, tokens } = request.body;
      return await getEthereumAllowances(
        fastify,
        network,
        address,
        spender,
        tokens,
      );
    },
  );
};

export default allowancesRoute;
