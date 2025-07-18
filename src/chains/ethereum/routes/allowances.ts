import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender } from '../../../connectors/uniswap/uniswap.contracts';
import { tokenValueToString } from '../../../services/base';
import { logger } from '../../../services/logger';
import { Ethereum, TokenInfo } from '../ethereum';
import {
  AllowancesRequestSchema,
  AllowancesResponseSchema,
  AllowancesRequestType,
  AllowancesResponseType,
} from '../schemas';

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

    // Check if this is a hardware wallet
    const isHardware = await ethereum.isHardwareWallet(address);
    let wallet: ethers.Wallet | null = null;

    if (!isHardware) {
      wallet = await ethereum.getWallet(address);
    }

    // If tokens array is empty, get all tokens from the token list
    let tokenInfoMap: Record<string, TokenInfo>;
    if (!tokens || tokens.length === 0) {
      // Get all tokens from the token list
      const allTokens = ethereum.storedTokenList;
      tokenInfoMap = {};
      for (const token of allTokens) {
        tokenInfoMap[token.symbol] = token;
      }
    } else {
      tokenInfoMap = ethereum.getTokensAsMap(tokens);

      // Check if any tokens were found
      const foundSymbols = Object.keys(tokenInfoMap);
      if (foundSymbols.length === 0) {
        const errorMsg = `None of the provided tokens could be found or fetched: ${tokens.join(', ')}`;
        logger.error(errorMsg);
        throw fastify.httpErrors.badRequest(errorMsg);
      }
    }

    // Log any tokens that couldn't be resolved (only for specific token requests)
    if (tokens && tokens.length > 0 && Object.keys(tokenInfoMap).length < tokens.length) {
      const resolvedAddresses = Object.values(tokenInfoMap).map((t) => t.address.toLowerCase());
      const resolvedSymbols = Object.values(tokenInfoMap).map((t) => t.symbol.toUpperCase());

      const missingTokens = tokens.filter((t) => {
        const tLower = t.toLowerCase();
        const tUpper = t.toUpperCase();
        return !resolvedAddresses.includes(tLower) && !resolvedSymbols.includes(tUpper);
      });

      logger.warn(`Some tokens could not be resolved: ${missingTokens.join(', ')}`);
    }

    // Determine the spender address based on the input
    let spenderAddress: string;
    try {
      // Check if the spender parameter is a connector name
      if (spender.includes('/') || spender === 'uniswap') {
        logger.info(`Looking up spender address for connector: ${spender}`);
        spenderAddress = getSpender(network, spender);
        logger.info(`Resolved connector ${spender} to spender address: ${spenderAddress}`);
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
        const contract = ethereum.getContract(tokenInfoMap[symbol].address, ethereum.provider);
        approvals[symbol] = tokenValueToString(
          isHardware
            ? await ethereum.getERC20AllowanceByAddress(
                contract,
                address,
                spenderAddress,
                tokenInfoMap[symbol].decimals,
              )
            : await ethereum.getERC20Allowance(contract, wallet!, spenderAddress, tokenInfoMap[symbol].decimals),
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
    throw fastify.httpErrors.internalServerError(`Failed to get allowances: ${error.message}`);
  }
}

export const allowancesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AllowancesRequestType;
    Reply: AllowancesResponseType;
  }>(
    '/allowances',
    {
      schema: {
        description: 'Get token allowances',
        tags: ['/chain/ethereum'],
        body: AllowancesRequestSchema,
        response: {
          200: AllowancesResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, address, spender, tokens } = request.body;
      return await getEthereumAllowances(fastify, network, address, spender, tokens);
    },
  );
};

export default allowancesRoute;
