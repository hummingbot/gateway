// TODO: This route needs complete rewrite for Orca SDK
// Meteora methods don't exist in Orca
// Need to use getDecreaseLiquidityV2Instruction() from @orca-so/whirlpools-client
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponse, RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { OrcaClmmRemoveLiquidityRequest } from '../schemas';

async function removeLiquidity(
  fastify: FastifyInstance,
  _network: string,
  _address: string,
  _positionAddress: string,
  _liquidityPct: number,
): Promise<RemoveLiquidityResponseType> {
  // Validate addresses
  try {
    new PublicKey(_positionAddress);
    new PublicKey(_address);
  } catch (error) {
    throw fastify.httpErrors.badRequest(`Invalid Solana address: ${_positionAddress}`);
  }

  // Validate percentage
  if (_liquidityPct <= 0 || _liquidityPct > 100) {
    throw fastify.httpErrors.badRequest('liquidityPct must be between 0 and 100');
  }

  // TODO: Implement using Orca SDK
  // Need to:
  // 1. Fetch position data using fetchPosition()
  // 2. Calculate liquidity amount to remove based on percentage
  // 3. Build instruction using getDecreaseLiquidityV2Instruction()
  // 4. Create and send transaction
  throw fastify.httpErrors.notImplemented(
    'removeLiquidity not yet implemented for Orca. This route requires getDecreaseLiquidityV2Instruction().',
  );
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, liquidityPct = 100 } = request.body;
        const network = request.body.network;

        return await removeLiquidity(fastify, network, walletAddress, positionAddress, liquidityPct);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default removeLiquidityRoute;
