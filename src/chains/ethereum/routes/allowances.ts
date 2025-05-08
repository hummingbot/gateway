import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Ethereum } from '../ethereum';
import { logger } from '../../../services/logger';
import { AllowancesRequestType, AllowancesResponseType } from '../../../schemas/chain-schema';
import { TokenInfo } from '../ethereum';
import { tokenValueToString } from '../../../services/base';

export async function getTokensToTokenInfo(
  ethereum: Ethereum,
  tokens: Array<string>
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
  spenderAddress: string,
  tokens: string[]
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
    
    const missingTokens = tokens.filter((t) => 
      !Object.values(tokenInfoMap).some((token) => 
        token.symbol.toUpperCase() === t.toUpperCase() || 
        token.address.toLowerCase() === t.toLowerCase()
      )
    );
    
    if (missingTokens.length > 0) {
      logger.warn(`Some tokens were not found: ${missingTokens.join(', ')}`);
    }

    const approvals: Record<string, string> = {};
    await Promise.all(
      Object.keys(tokenInfoMap).map(async (symbol) => {
        const contract = ethereum.getContract(
          tokenInfoMap[symbol].address,
          ethereum.provider
        );
        approvals[symbol] = tokenValueToString(
          await ethereum.getERC20Allowance(
            contract,
            wallet,
            spenderAddress,
            tokenInfoMap[symbol].decimals
          )
        );
      })
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
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
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
          network: Type.String({ examples: ['base', 'mainnet', 'sepolia', 'polygon'] }),
          address: Type.String({ examples: [firstWalletAddress] }),
          spenderAddress: Type.String({ examples: ['0xC36442b4a4522E871399CD717aBDD847Ab11FE88'] }),
          tokens: Type.Array(Type.String(), { examples: [['USDC', 'DAI']] })
        }),
        response: {
          200: Type.Object({
            spender: Type.String(),
            approvals: Type.Record(Type.String(), Type.String())
          })
        }
      }
    },
    async (request) => {
      const { network, address, spenderAddress, tokens } = request.body;
      return await getEthereumAllowances(
        fastify, 
        network, 
        address, 
        spenderAddress, 
        tokens
      );
    }
  );
};

export default allowancesRoute;