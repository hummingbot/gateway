import { Type } from '@sinclair/typebox';
import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender } from '../../../connectors/uniswap/uniswap.contracts';
import { AllowancesRequestType, AllowancesResponseType } from '../../../schemas/chain-schema';
import { tokenValueToString } from '../../../services/base';
import { logger } from '../../../services/logger';
import { TokenInfo, Ethereum } from '../ethereum';

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

    const tokenInfoMap = ethereum.getTokensAsMap(tokens);

    // Check if any tokens were found
    const foundSymbols = Object.keys(tokenInfoMap);
    if (foundSymbols.length === 0) {
      const errorMsg = `None of the provided tokens could be found or fetched: ${tokens.join(', ')}`;
      logger.error(errorMsg);
      throw fastify.httpErrors.badRequest(errorMsg);
    }

    // Log any tokens that couldn't be resolved
    if (foundSymbols.length < tokens.length) {
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
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: AllowancesRequestType;
    Reply: AllowancesResponseType;
  }>(
    '/allowances',
    {
      schema: {
        description: 'Get token allowances',
        tags: ['/chain/ethereum'],
        body: Type.Object({
          network: Type.String({
            examples: ['mainnet', 'arbitrum', 'optimism', 'base', 'sepolia', 'bsc', 'avalanche', 'celo', 'polygon'],
          }),
          address: Type.String({ examples: [walletAddressExample] }),
          spender: Type.String({
            examples: ['uniswap/clmm', 'uniswap', '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'],
            description:
              'Spender can be a connector name (e.g., uniswap/clmm, uniswap/amm, uniswap) or a direct contract address',
          }),
          tokens: Type.Array(Type.String(), {
            examples: [
              ['USDC', 'DAI'],
              ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0x6B175474E89094C44Da98b954EedeAC495271d0F'],
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
      return await getEthereumAllowances(fastify, network, address, spender, tokens);
    },
  );
};

export default allowancesRoute;
