import { Contract } from '@ethersproject/contracts';
import { Token } from '@pancakeswap/sdk';
import { FastifyInstance } from 'fastify';

import { Ethereum } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { Hyperswap } from './hyperswap';
import { IHyperswapV2PairABI } from './hyperswap.contracts';

export const isValidV2Pool = async (poolAddress: string): Promise<boolean> => {
  try {
    return poolAddress && poolAddress.length === 42 && poolAddress.startsWith('0x');
  } catch (error) {
    logger.error(`Error validating V2 pool: ${error}`);
    return false;
  }
};

export const findPoolAddress = (
  _baseToken: string,
  _quoteToken: string,
  _poolType: 'amm' | 'clmm',
  _network: string,
): string | null => {
  return null;
};

export const formatTokenAmount = (amount: string | number, decimals: number): number => {
  if (typeof amount === 'string') {
    return parseFloat(amount) / Math.pow(10, decimals);
  }
  return amount / Math.pow(10, decimals);
};

export async function getFullTokenFromSymbol(
  fastify: FastifyInstance,
  ethereum: Ethereum,
  hyperswap: Hyperswap,
  tokenSymbol: string,
): Promise<Token> {
  if (!ethereum.ready()) {
    await ethereum.init();
  }

  const tokenInfo = await ethereum.getToken(tokenSymbol);

  if (!tokenInfo) {
    throw fastify.httpErrors.badRequest(`Token ${tokenSymbol} is not supported`);
  }

  return hyperswap.getHyperswapToken(tokenInfo);
}

export interface HyperswapPoolInfo {
  baseTokenAddress: string;
  quoteTokenAddress: string;
  poolType: 'amm';
}

export async function getV2PoolInfo(poolAddress: string, network: string): Promise<HyperswapPoolInfo | null> {
  try {
    const ethereum = await Ethereum.getInstance(network);
    const pairContract = new Contract(poolAddress, IHyperswapV2PairABI.abi, ethereum.provider);
    const [token0Address, token1Address] = await Promise.all([pairContract.token0(), pairContract.token1()]);

    return {
      baseTokenAddress: token0Address,
      quoteTokenAddress: token1Address,
      poolType: 'amm',
    };
  } catch (error) {
    logger.error(`Error getting V2 pool info: ${error.message}`);
    return null;
  }
}

export async function getHyperswapPoolInfo(
  poolAddress: string,
  network: string,
  poolType?: 'amm' | 'clmm',
): Promise<HyperswapPoolInfo | null> {
  if (poolType && poolType !== 'amm') {
    return null;
  }

  return getV2PoolInfo(poolAddress, network);
}
