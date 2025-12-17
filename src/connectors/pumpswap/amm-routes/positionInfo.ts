import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema, GetPositionInfoRequestType } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pumpswap } from '../pumpswap';
import { PumpswapAmmGetPositionInfoRequest } from '../schemas';

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get info about a Pumpswap AMM position',
        tags: ['/connector/pumpswap'],
        querystring: PumpswapAmmGetPositionInfoRequest,
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

        const pumpswap = await Pumpswap.getInstance(network);
        const solana = await Solana.getInstance(network);

        // Prepare wallet and check if it's hardware
        const { wallet, isHardwareWallet } = await pumpswap.prepareWallet(walletAddress);

        // Get wallet public key
        const walletPublicKey = isHardwareWallet ? (wallet as PublicKey) : (wallet as any).publicKey;

        // Validate pool address
        try {
          new PublicKey(poolAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest('Invalid pool address');
        }

        // Get pool info
        const ammPoolInfo = await pumpswap.getAmmPoolInfo(poolAddress);
        if (!ammPoolInfo) {
          throw fastify.httpErrors.notFound('Pool not found');
        }

        // Get pool account to find LP mint
        const poolPubkey = new PublicKey(poolAddress);
        const poolAccountInfo = await solana.connection.getAccountInfo(poolPubkey);
        if (!poolAccountInfo) {
          throw fastify.httpErrors.notFound('Pool account not found');
        }

        const poolData = poolAccountInfo.data;
        // LP mint is at offset 107 (after discriminator + bump + index + creator + base_mint + quote_mint)
        const lpMint = new PublicKey(poolData.slice(107, 139));

        // Get user's LP token balance
        const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(walletPublicKey, {
          mint: lpMint,
        });

        let lpTokenAmount = 0;
        let baseTokenAmount = 0;
        let quoteTokenAmount = 0;

        if (lpTokenAccounts.value.length > 0) {
          const lpTokenAccount = lpTokenAccounts.value[0].pubkey;
          const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccount);
          lpTokenAmount = accountInfo.value.uiAmount || 0;

          if (lpTokenAmount > 0) {
            // Get LP supply from pool
            const lpSupply = poolData.readBigUInt64LE(203); // offset 203-210

            // Calculate token amounts based on LP share
            // For AMM: user's share = lpTokenAmount / lpSupply
            const share = Number(lpTokenAmount) / Number(lpSupply);
            baseTokenAmount = ammPoolInfo.baseTokenAmount * share;
            quoteTokenAmount = ammPoolInfo.quoteTokenAmount * share;
          }
        }

        return {
          poolAddress,
          walletAddress,
          baseTokenAddress: ammPoolInfo.baseTokenAddress,
          quoteTokenAddress: ammPoolInfo.quoteTokenAddress,
          lpTokenAmount,
          baseTokenAmount,
          quoteTokenAmount,
          price: ammPoolInfo.price,
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
