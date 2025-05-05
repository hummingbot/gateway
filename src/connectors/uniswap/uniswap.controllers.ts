import { Token } from '@uniswap/sdk-core';
import { FastifyInstance } from 'fastify';
import { TokenInfo } from '../../chains/ethereum/ethereum';
import { Ethereum } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

/**
 * Gets a Uniswap Token from a token symbol
 * This helper function is used by the AMM and CLMM routes
 */
export async function getFullTokenFromSymbol(
  fastify: FastifyInstance,
  ethereum: Ethereum,
  tokenSymbol: string
): Promise<Token> {
  if (!ethereum.ready()) {
    await ethereum.init();
  }
  
  const tokenInfo: TokenInfo = ethereum.getTokenBySymbol(tokenSymbol);
  
  if (!tokenInfo) {
    throw fastify.httpErrors.badRequest(`Token ${tokenSymbol} is not supported`);
  }
  
  const uniswapToken = new Token(
    tokenInfo.chainId,
    tokenInfo.address,
    tokenInfo.decimals,
    tokenInfo.symbol,
    tokenInfo.name
  );
  
  if (!uniswapToken) {
    throw fastify.httpErrors.internalServerError(`Failed to create token for ${tokenSymbol}`);
  }
    
  return uniswapToken;
}
