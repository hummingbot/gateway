// TODO: This route needs complete rewrite for Orca SDK
// Need to use getOpenPositionWithMetadataInstruction() and getIncreaseLiquidityV2Instruction()
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { OrcaClmmOpenPositionRequest } from '../schemas';

async function openPosition(
  fastify: FastifyInstance,
  _network: string,
  _address: string,
  _poolAddress: string,
  _lowerPrice: number,
  _upperPrice: number,
  _baseTokenAmount?: number,
  _quoteTokenAmount?: number,
  _slippagePct?: number,
): Promise<OpenPositionResponseType> {
  // Validate addresses
  try {
    new PublicKey(_poolAddress);
    new PublicKey(_address);
  } catch (error) {
    throw fastify.httpErrors.badRequest(`Invalid Solana address: ${_poolAddress}`);
  }

  // Validate amounts
  if (!_baseTokenAmount && !_quoteTokenAmount) {
    throw fastify.httpErrors.badRequest('Either baseTokenAmount or quoteTokenAmount must be provided');
  }

  // Validate prices
  if (_lowerPrice >= _upperPrice) {
    throw fastify.httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  // TODO: Implement using Orca SDK
  // Need to:
  // 1. Get whirlpool data using fetchWhirlpool()
  // 2. Convert prices to tick indices and align to tickSpacing
  // 3. Check/initialize tick arrays if needed using getInitializeTickArrayInstruction()
  // 4. Generate position NFT mint keypair
  // 5. Build position opening instruction using getOpenPositionWithMetadataInstruction()
  // 6. Build increase liquidity instruction using getIncreaseLiquidityV2Instruction()
  // 7. Create transaction with all instructions
  // 8. Send transaction
  throw fastify.httpErrors.notImplemented(
    'openPosition not yet implemented for Orca. This route requires getOpenPositionWithMetadataInstruction().',
  );
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, poolAddress, lowerPrice, upperPrice, baseTokenAmount, quoteTokenAmount, slippagePct } =
          request.body;
        const network = request.body.network;

        return await openPosition(
          fastify,
          network,
          walletAddress,
          poolAddress,
          lowerPrice,
          upperPrice,
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

export default openPositionRoute;
