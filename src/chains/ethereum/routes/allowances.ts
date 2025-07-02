import { Type } from '@sinclair/typebox';
import { utils, ethers } from 'ethers';
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

    // First try to find the token in the list
    const tokenInfo = ethereum.getTokenBySymbol(symbolOrAddress);
    if (tokenInfo) {
      // Use the actual token symbol as the key, not the input which might be an address
      tokenInfoMap[tokenInfo.symbol] = tokenInfo;
    } else {
      // Check if the token string is a valid Ethereum address
      try {
        const normalizedAddress = utils.getAddress(symbolOrAddress);
        // If it's a valid address but not in our token list, we create a basic contract
        // and try to get its decimals, symbol, and name directly
        try {
          const contract = ethereum.getContract(
            normalizedAddress,
            ethereum.provider,
          );
          logger.info(
            `Token ${symbolOrAddress} not found in list but has valid address format. Fetching token info from chain...`,
          );

          // Try to fetch token information directly from the contract
          const [decimals, symbol, name] = await Promise.all([
            contract.decimals(),
            contract.symbol(),
            contract.name(),
          ]);

          // Create a token info object
          const tokenInfoObj: TokenInfo = {
            chainId: ethereum.chainId,
            address: normalizedAddress,
            name: name,
            symbol: symbol,
            decimals: decimals,
          };

          // Use the contract symbol as the key, or the address if symbol is empty
          const key = symbol || normalizedAddress;
          tokenInfoMap[key] = tokenInfoObj;

          logger.info(
            `Successfully fetched token info for ${normalizedAddress}: ${symbol} (${name})`,
          );
        } catch (contractError) {
          logger.warn(
            `Failed to fetch token info for address ${normalizedAddress}: ${contractError.message}`,
          );
        }
      } catch (addressError) {
        logger.debug(`${symbolOrAddress} is not a valid Ethereum address`);
      }
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

    // Check if this is a read-only wallet
    const isReadOnly = await ethereum.isReadOnlyWallet(address);
    let wallet: ethers.Wallet | null = null;

    if (!isReadOnly) {
      wallet = await ethereum.getWallet(address);
    }

    const tokenInfoMap = await getTokensToTokenInfo(ethereum, tokens);

    // Check if any tokens were found
    const foundSymbols = Object.keys(tokenInfoMap);
    if (foundSymbols.length === 0) {
      const errorMsg = `None of the provided tokens could be found or fetched: ${tokens.join(', ')}`;
      logger.error(errorMsg);
      throw fastify.httpErrors.badRequest(errorMsg);
    }

    // Log any tokens that couldn't be resolved
    if (foundSymbols.length < tokens.length) {
      const resolvedAddresses = Object.values(tokenInfoMap).map((t) =>
        t.address.toLowerCase(),
      );
      const resolvedSymbols = Object.values(tokenInfoMap).map((t) =>
        t.symbol.toUpperCase(),
      );

      const missingTokens = tokens.filter((t) => {
        const tLower = t.toLowerCase();
        const tUpper = t.toUpperCase();
        return (
          !resolvedAddresses.includes(tLower) &&
          !resolvedSymbols.includes(tUpper)
        );
      });

      logger.warn(
        `Some tokens could not be resolved: ${missingTokens.join(', ')}`,
      );
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
          isReadOnly
            ? await ethereum.getERC20AllowanceByAddress(
                contract,
                address,
                spenderAddress,
                tokenInfoMap[symbol].decimals,
              )
            : await ethereum.getERC20Allowance(
                contract,
                wallet!,
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
  const firstWalletAddress = await Ethereum.getWalletAddressExample();

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
          tokens: Type.Array(Type.String(), {
            examples: [
              ['USDC', 'DAI'],
              [
                '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                '0x6B175474E89094C44Da98b954EedeAC495271d0F',
              ],
              ['USDC', '0xd0b53D9277642d899DF5C87A3966A349A798F224'],
            ],
            description: 'Array of token symbols or addresses',
          }),
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
