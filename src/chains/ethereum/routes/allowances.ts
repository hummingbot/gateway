import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { getSpender as pancakeswapSpender } from '../../../connectors/pancakeswap/pancakeswap.contracts';
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

// Permit2 address is constant across all chains
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

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
      const allTokens = await ethereum.getTokenList();
      tokenInfoMap = {};
      for (const token of allTokens) {
        tokenInfoMap[token.symbol] = token;
      }
    } else {
      tokenInfoMap = await ethereum.getTokensAsMap(tokens);

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
        // Special case: Universal Router V2 uses Permit2 for approvals
        if (spender === 'uniswap/router') {
          logger.info(`Using Permit2 address for Universal Router V2 allowances`);
          spenderAddress = PERMIT2_ADDRESS;
          logger.info(`Resolved connector ${spender} to Permit2 address: ${spenderAddress}`);
        } else {
          logger.info(`Looking up spender address for connector: ${spender}`);
          spenderAddress = getSpender(network, spender);
          if (spender.startsWith('pancakeswap')) spenderAddress = pancakeswapSpender(network, spender);
          logger.info(`Resolved connector ${spender} to spender address: ${spenderAddress}`);
        }
      } else {
        // Otherwise assume it's a direct address
        spenderAddress = spender;
      }
    } catch (error) {
      logger.error(`Failed to resolve spender address: ${error.message}`);
      throw fastify.httpErrors.badRequest(`Invalid spender: ${error.message}`);
    }

    const approvals: Record<string, string> = {};

    // Check if this is a Universal Router request that needs Permit2 allowance check
    const isUniversalRouter = spender === 'uniswap/router';
    let universalRouterAddress: string | null = null;

    if (isUniversalRouter) {
      // Get the actual Universal Router address
      universalRouterAddress = getSpender(network, spender);
      logger.info(`Checking Permit2 allowances for Universal Router (${universalRouterAddress})`);

      // For Universal Router, we need to check Permit2's allowance
      // Permit2 allowance function ABI
      const permit2AllowanceABI = [
        'function allowance(address owner, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)',
      ];

      const permit2Contract = new ethers.Contract(PERMIT2_ADDRESS, permit2AllowanceABI, ethereum.provider);

      await Promise.all(
        Object.keys(tokenInfoMap).map(async (symbol) => {
          try {
            // First check if token is approved to Permit2
            const tokenContract = ethereum.getContract(tokenInfoMap[symbol].address, ethereum.provider);
            const tokenToPermit2Allowance = isHardware
              ? await ethereum.getERC20AllowanceByAddress(
                  tokenContract,
                  address,
                  PERMIT2_ADDRESS,
                  tokenInfoMap[symbol].decimals,
                )
              : await ethereum.getERC20Allowance(
                  tokenContract,
                  wallet!,
                  PERMIT2_ADDRESS,
                  tokenInfoMap[symbol].decimals,
                );

            // Then check Permit2's allowance to Universal Router
            const [amount, expiration, nonce] = await permit2Contract.allowance(
              address,
              tokenInfoMap[symbol].address,
              universalRouterAddress,
            );

            // Check if the Permit2 allowance is expired
            const currentTime = Math.floor(Date.now() / 1000);
            const isExpired = expiration > 0 && expiration < currentTime;

            // The effective allowance is the minimum of:
            // 1. Token approved to Permit2
            // 2. Permit2 approved to Universal Router (if not expired)
            let effectiveAllowance;
            if (isExpired) {
              effectiveAllowance = '0';
              logger.debug(`Permit2 allowance for ${symbol} to Universal Router is expired`);
            } else {
              const tokenToPermit2 = ethers.BigNumber.from(tokenToPermit2Allowance.value);
              const permit2ToRouter = ethers.BigNumber.from(amount);
              effectiveAllowance = tokenToPermit2.lt(permit2ToRouter)
                ? tokenToPermit2Allowance.value.toString()
                : amount.toString();
            }

            approvals[symbol] = tokenValueToString({
              value: effectiveAllowance,
              decimals: tokenInfoMap[symbol].decimals,
            });

            logger.debug(
              `${symbol} allowances - Token->Permit2: ${tokenValueToString(tokenToPermit2Allowance)}, Permit2->Router: ${tokenValueToString({ value: amount.toString(), decimals: tokenInfoMap[symbol].decimals })}, Effective: ${approvals[symbol]}`,
            );
          } catch (error) {
            logger.error(`Error checking allowance for ${symbol}: ${error.message}`);
            approvals[symbol] = '0';
          }
        }),
      );
    } else {
      // Regular allowance check for other spenders
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
    }

    return {
      spender: isUniversalRouter ? universalRouterAddress || spenderAddress : spenderAddress,
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
