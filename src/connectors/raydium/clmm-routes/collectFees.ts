import { FastifyPluginAsync } from 'fastify';

import { CollectFeesOperation } from '../../../../packages/sdk/src/solana/raydium/operations/clmm/collect-fees';
import { Solana } from '../../../chains/solana/solana';
import {
  CollectFeesRequest,
  CollectFeesResponse,
  CollectFeesRequestType,
  CollectFeesResponseType,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';

export async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Create SDK operation
  const operation = new CollectFeesOperation(raydium, solana);

  // Execute using SDK
  const result = await operation.execute({
    network,
    walletAddress,
    poolAddress: '', // Not needed for collect fees
    positionAddress,
  });

  if (result.status === 1 && result.data) {
    logger.info(
      `Fees collected from position ${positionAddress}: ${result.data.baseTokenFeesCollected.toFixed(4)} + ${result.data.quoteTokenFeesCollected.toFixed(4)}`,
    );
  }

  return result;
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Raydium CLMM position by removing 1% of liquidity',
        tags: ['/connector/raydium'],
        body: {
          ...CollectFeesRequest,
          properties: {
            ...CollectFeesRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
          },
        },
        response: { 200: CollectFeesResponse },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress, positionAddress } = request.body;
        return await collectFees(network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message);
        }
        throw fastify.httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;
