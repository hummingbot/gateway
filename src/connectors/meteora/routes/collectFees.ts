import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';

// Schema definitions
const CollectFeesRequest = Type.Object({
  network: Type.String({ default: 'mainnet-beta' }),
  address: Type.String({ default: '<your-wallet-address>' }),
  positionAddress: Type.String({ default: '' }),
});

const CollectFeesResponse = Type.Object({
  signature: Type.String(),
  collectedFeeX: Type.Number(),
  collectedFeeY: Type.Number(),
  fee: Type.Number(),
});

type CollectFeesRequestType = Static<typeof CollectFeesRequest>;
type CollectFeesResponseType = Static<typeof CollectFeesResponse>;

async function collectFees(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string
): Promise<CollectFeesResponseType> {
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

  const claimSwapFeeTx = await dlmmPool.claimSwapFee({
    owner: wallet.publicKey,
    position: matchingLbPosition,
  });

  const signature = await solana.sendAndConfirmTransaction(claimSwapFeeTx, [wallet]);

  const { balanceChange: collectedFeeX, fee } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenX.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  const { balanceChange: collectedFeeY } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenY.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  return {
    signature,
    collectedFeeX: Math.abs(collectedFeeX),
    collectedFeeY: Math.abs(collectedFeeY),
    fee,
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Meteora position',
        tags: ['meteora'],
        body: CollectFeesRequest,
        response: {
          200: CollectFeesResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, address, positionAddress } = request.body;
        
        return await collectFees(
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

export default collectFeesRoute; 