import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponse, OpenPositionRequestType, OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmOpenPositionRequest } from '../schemas';
import { OpenPositionOperation } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/open-position';

async function openPosition(
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  baseTokenSymbol?: string,
  quoteTokenSymbol?: string,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new OpenPositionOperation(raydium, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    walletAddress,
    lowerPrice,
    upperPrice,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    baseTokenSymbol,
    quoteTokenSymbol,
    slippagePct,
  });

  if (result.status === 1 && result.data) {
    logger.info(
      `CLMM position opened: ${result.data.positionAddress} with ${result.data.baseTokenAmountAdded.toFixed(4)} + ${result.data.quoteTokenAmountAdded.toFixed(4)}`,
    );
  }

  return result;
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof RaydiumClmmOpenPositionRequest>;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Raydium CLMM position',
        tags: ['/connector/raydium'],
        body: RaydiumClmmOpenPositionRequest,
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;
        const networkToUse = network;

        return await openPosition(
          networkToUse,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          undefined, // baseToken not needed anymore
          undefined, // quoteToken not needed anymore
          slippagePct,
        );
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

export default openPositionRoute;
