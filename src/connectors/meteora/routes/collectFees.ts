import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';

// Schema definitions
const CollectFeesRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  walletAddress: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
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

export async function collectFees(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  const { position, info } = await meteora.getRawPosition(
    positionAddress,
    wallet.publicKey
  );

  if (!position) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  const claimSwapFeeTx = await dlmmPool.claimSwapFee({
    owner: wallet.publicKey,
    position: position,
  });

  const { signature, fee } = await solana.sendAndConfirmTransaction(claimSwapFeeTx, [wallet], 300_000);

  const { balanceChange: collectedFeeX } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenX.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  const { balanceChange: collectedFeeY } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenY.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  logger.info(`Fees collected from position ${positionAddress}: ${Math.abs(collectedFeeX).toFixed(4)} ${tokenXSymbol}, ${Math.abs(collectedFeeY).toFixed(4)} ${tokenYSymbol}`);

  return {
    signature,
    collectedFeeX: Math.abs(collectedFeeX),
    collectedFeeY: Math.abs(collectedFeeY),
    fee,
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  CollectFeesRequest.properties.walletAddress.examples = [firstWalletAddress];

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
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network || 'mainnet-beta';
        
        return await collectFees(
          fastify,
          networkToUse,
          walletAddress,
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
