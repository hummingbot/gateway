import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmGetPositionInfoRequest } from '../schemas';

/**
 * Calculate the LP token amount and corresponding token amounts
 */
async function calculateLpAmount(
  solana: Solana,
  walletAddress: PublicKey,
  _ammPoolInfo: any,
  poolInfo: any,
  poolAddress: string,
): Promise<{
  lpTokenAmount: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
}> {
  let lpMint: string;

  // Get LP mint from poolInfo instead of poolKeys
  if (poolInfo.lpMint && poolInfo.lpMint.address) {
    lpMint = poolInfo.lpMint.address;
  } else {
    throw new Error(`Could not find LP mint for pool ${poolAddress}`);
  }

  // Get user's LP token account
  const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(walletAddress, {
    mint: new PublicKey(lpMint),
  });

  if (lpTokenAccounts.value.length === 0) {
    // Return zero values if no LP token account exists
    return {
      lpTokenAmount: 0,
      baseTokenAmount: 0,
      quoteTokenAmount: 0,
    };
  }

  // Get LP token balance
  const lpTokenAccount = lpTokenAccounts.value[0].pubkey;
  const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccount);
  const lpTokenAmount = accountInfo.value.uiAmount || 0;

  if (lpTokenAmount === 0) {
    return {
      lpTokenAmount: 0,
      baseTokenAmount: 0,
      quoteTokenAmount: 0,
    };
  }

  // Calculate token amounts based on LP share
  const baseTokenAmount = (lpTokenAmount * poolInfo.mintAmountA) / poolInfo.lpAmount;
  const quoteTokenAmount = (lpTokenAmount * poolInfo.mintAmountB) / poolInfo.lpAmount;

  return {
    lpTokenAmount,
    baseTokenAmount: baseTokenAmount || 0,
    quoteTokenAmount: quoteTokenAmount || 0,
  };
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get info about a Raydium AMM position',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmGetPositionInfoRequest,
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress, walletAddress } = request.query;
        const network = request.query.network;

        // Validate wallet address
        try {
          new PublicKey(walletAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest('Invalid wallet address');
        }

        const raydium = await Raydium.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Prepare wallet and check if it's hardware
        const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

        // Get wallet public key
        const walletPublicKey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;

        // Validate pool address
        try {
          new PublicKey(poolAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest('Invalid pool address');
        }

        // Get pool info
        const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);
        const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddress);
        if (!poolInfo) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Calculate LP token amount and token amounts
        const { lpTokenAmount, baseTokenAmount, quoteTokenAmount } = await calculateLpAmount(
          solana,
          walletPublicKey,
          ammPoolInfo,
          poolInfo,
          poolAddress,
        );

        return {
          poolAddress,
          walletAddress,
          baseTokenAddress: ammPoolInfo.baseTokenAddress,
          quoteTokenAddress: ammPoolInfo.quoteTokenAddress,
          lpTokenAmount: lpTokenAmount,
          baseTokenAmount,
          quoteTokenAmount,
          price: poolInfo.price,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to fetch position info');
      }
    },
  );
};

export default positionInfoRoute;
