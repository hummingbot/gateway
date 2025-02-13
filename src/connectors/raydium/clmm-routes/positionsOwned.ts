import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Raydium } from '../raydium';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../services/logger';
import { PositionInfoSchema } from '../../../services/clmm-interfaces';
import { httpBadRequest, ERROR_MESSAGES } from '../../../services/error-handler';

// Schema definitions
const GetPositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  poolAddress: Type.String({ 
    examples: ['61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht'] 
  }),
});

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedRequestType = Static<typeof GetPositionsOwnedRequest>;
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
        tags: ['raydium-clmm'],
        querystring: GetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse
        },
      }
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network || 'mainnet-beta';
        const raydium = await Raydium.getInstance(network);
        
        // Validate pool address only
        try {
          new PublicKey(poolAddress);
        } catch (error) {
          throw httpBadRequest(ERROR_MESSAGES.INVALID_SOLANA_ADDRESS('pool'));
        }
        console.log('poolAddress', poolAddress)

        // Get pool info to extract program ID
        const apiResponse = await raydium.getClmmPoolfromAPI(poolAddress);

        if (apiResponse !== null) {
          const poolInfo = apiResponse[0];  // Direct array access instead of destructuring
          console.log('poolInfo', poolInfo, 'Program ID:', poolInfo.programId);
          
          const positions = await raydium.raydiumSDK.clmm.getOwnerPositionInfo({
            programId: poolInfo.programId
          });
          console.log('positions', positions);
          const positionsInfo = await Promise.all(
            positions.map(pos => raydium.getPositionInfo(pos.nftMint.toString()))
          );
          return positionsInfo;
        }
        console.log('No positions found in pool', poolAddress);
        return [];

      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default positionsOwnedRoute; 