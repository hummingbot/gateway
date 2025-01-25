import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';

// Schema definitions
const ClosePositionRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  address: Type.String({ default: '<your-wallet-address>' }),
  positionAddress: Type.String({ default: '' }),
});

const ClosePositionResponse = Type.Object({
  signature: Type.String(),
  returnedSOL: Type.Number(),
  fee: Type.Number(),
});

type ClosePositionRequestType = Static<typeof ClosePositionRequest>;
type ClosePositionResponseType = Static<typeof ClosePositionResponse>;

async function closePosition(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string
): Promise<ClosePositionResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  const { position: matchingLbPosition, info: matchingPositionInfo } = await meteora.getPosition(
    positionAddress,
    wallet.publicKey
  );

  if (!matchingLbPosition || !matchingPositionInfo) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const dlmmPool = await meteora.getDlmmPool(matchingPositionInfo.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  await dlmmPool.refetchStates();

  const closePositionTx = await dlmmPool.closePosition({
    owner: wallet.publicKey,
    position: matchingLbPosition,
  });

  const signature = await solana.sendAndConfirmTransaction(closePositionTx, [wallet], 200_000);

  const { balanceChange, fee } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
  const returnedSOL = Math.abs(balanceChange);

  return {
    signature,
    returnedSOL,
    fee,
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ClosePositionRequestType;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Meteora position',
        tags: ['meteora'],
        body: ClosePositionRequest,
        response: {
          200: ClosePositionResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, address, positionAddress } = request.body;
        
        return await closePosition(
          fastify,
          network,
          address,
          positionAddress
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default closePositionRoute; 