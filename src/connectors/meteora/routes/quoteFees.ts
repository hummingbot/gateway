import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../../../services/logger';
import { convertDecimals } from '../../../services/base';

// Schema definitions
const GetFeesQuoteRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  positionAddress: Type.String({ default: '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtXchr' }),
  address: Type.String({ default: '<your-wallet-address>' }),
});

const GetFeesQuoteResponse = Type.Object({
  tokenX: Type.Object({
    address: Type.String(),
    amount: Type.String(),
  }),
  tokenY: Type.Object({
    address: Type.String(),
    amount: Type.String(),
  }),
});

type GetFeesQuoteRequestType = Static<typeof GetFeesQuoteRequest>;
type GetFeesQuoteResponseType = Static<typeof GetFeesQuoteResponse>;

async function getPositionFees(
  fastify: FastifyInstance,
  meteora: Meteora, 
  positionAddress: string, 
  address: string
): Promise<GetFeesQuoteResponseType> {
  try {
    const matchingPosition = await meteora.getPosition(positionAddress, new PublicKey(address));

    const dlmmPool = await meteora.getDlmmPool(matchingPosition.info.publicKey.toBase58());
    if (!dlmmPool) {
      throw fastify.httpErrors.notFound(`Pool not found: ${matchingPosition.info.publicKey.toBase58()}`);
    }

    await dlmmPool.refetchStates();

    const positionsState = await dlmmPool.getPositionsByUserAndLbPair(new PublicKey(address));
    const updatedPosition = positionsState.userPositions.find(
      position => position.publicKey.equals(matchingPosition.position.publicKey)
    );

    if (!updatedPosition) {
      throw fastify.httpErrors.notFound('Updated position not found');
    }

    return {
      tokenX: {
        address: matchingPosition.info.tokenX.publicKey.toBase58(),
        amount: convertDecimals(updatedPosition.positionData.feeX, matchingPosition.info.tokenX.decimal)
      },
      tokenY: {
        address: matchingPosition.info.tokenY.publicKey.toBase58(),
        amount: convertDecimals(updatedPosition.positionData.feeY, matchingPosition.info.tokenY.decimal)
      }
    };
  } catch (e) {
    if (e.statusCode) throw e;
    logger.error(e);
    throw fastify.httpErrors.internalServerError('Internal server error');
  }
}

export const quoteFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetFeesQuoteRequestType;
    Reply: GetFeesQuoteResponseType;
  }>(
    '/quote-fees',
    {
      schema: {
        description: 'Get the fees quote for a Meteora position',
        tags: ['meteora'],
        querystring: GetFeesQuoteRequest,
        response: {
          200: GetFeesQuoteResponse
        },
      }
    },
    async (request) => {
      const { network, positionAddress, address } = request.query;
      
      try {
        new PublicKey(positionAddress);
        new PublicKey(address);
      } catch (error) {
        throw fastify.httpErrors.badRequest('Invalid address format');
      }

      const meteora = await Meteora.getInstance(network);
      return await getPositionFees(fastify, meteora, positionAddress, address);
    }
  );
};

export default quoteFeesRoute; 