import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfoSchema, GetPositionsOwnedRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmGetPositionsOwnedRequest } from '../schemas';

// Using Fastify's native error handling
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  // Remove wallet address example population code

  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific Raydium CLMM pool",
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmGetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress, walletAddress } = request.query;
        const network = request.query.network;
        const solana = await Solana.getInstance(network);
        const raydium = await Raydium.getInstance(network);

        // Prepare wallet and check if it's hardware
        const { wallet, isHardwareWallet } = await raydium.prepareWallet(walletAddress);

        // Set the owner for SDK operations
        await raydium.setOwner(wallet);

        // Validate pool address
        try {
          new PublicKey(poolAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('pool'));
        }

        // Validate wallet address
        try {
          new PublicKey(walletAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('wallet'));
        }

        console.log('poolAddress', poolAddress, 'walletAddress', walletAddress);

        // Get pool info to extract program ID
        const apiResponse = await raydium.getClmmPoolfromAPI(poolAddress);

        if (apiResponse !== null) {
          const poolInfo = apiResponse[0]; // Direct array access instead of destructuring
          console.log('poolInfo', poolInfo, 'Program ID:', poolInfo.programId);

          // Get all positions owned by the wallet for this program
          const positions = await raydium.raydiumSDK.clmm.getOwnerPositionInfo({
            programId: poolInfo.programId,
          });
          console.log('All positions for program:', positions.length);

          // Filter positions for this specific pool
          const poolPositions = [];
          for (const pos of positions) {
            const positionInfo = await raydium.getPositionInfo(pos.nftMint.toString());
            if (positionInfo && positionInfo.poolAddress === poolAddress) {
              poolPositions.push(positionInfo);
            }
          }

          console.log(`Found ${poolPositions.length} positions in pool ${poolAddress}`);
          return poolPositions;
        }
        console.log('Pool not found:', poolAddress);
        return [];
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default positionsOwnedRoute;
