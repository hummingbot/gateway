// TODO: This route needs complete rewrite for Orca SDK
// Meteora methods (getDlmmPool, addLiquidityByStrategy, position.positionData) don't exist in Orca
// Need to use getIncreaseLiquidityV2Instruction() from @orca-so/whirlpools-client
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { OrcaClmmAddLiquidityRequest } from '../schemas';

async function addLiquidity(
  fastify: FastifyInstance,
  _network: string,
  _address: string,
  _positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  _slippagePct?: number,
): Promise<AddLiquidityResponseType> {
  // Validate addresses first
  try {
    new PublicKey(_positionAddress);
    new PublicKey(_address);
  } catch (error) {
    throw fastify.httpErrors.badRequest(`Invalid Solana address: ${_positionAddress}`);
  }

  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw fastify.httpErrors.badRequest('Missing amounts for liquidity addition');
  }

  // TODO: Implement using Orca SDK
  // Need to:
  // 1. Fetch position data using fetchPosition()
  // 2. Get whirlpool data using fetchWhirlpool()
  // 3. Build instruction using getIncreaseLiquidityV2Instruction()
  // 4. Create and send transaction
  throw fastify.httpErrors.notImplemented(
    'addLiquidity not yet implemented for Orca. This route requires getIncreaseLiquidityV2Instruction().',
  );
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct } = request.body;
        const network = request.body.network;

        return await addLiquidity(
          fastify,
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
