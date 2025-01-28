import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { BN } from '@coral-xyz/anchor';
import { logger } from '../../../services/logger';

// Schema definitions
const RemoveLiquidityRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  address: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  positionAddress: Type.String({ default: '' }),
  percentageToRemove: Type.Number({ minimum: 0, maximum: 100, default: 50 }),
});

const RemoveLiquidityResponse = Type.Object({
  signature: Type.String(),
  tokenXRemovedAmount: Type.Number(),
  tokenYRemovedAmount: Type.Number(),
  fee: Type.Number(),
});

type RemoveLiquidityRequestType = Static<typeof RemoveLiquidityRequest>;
type RemoveLiquidityResponseType = Static<typeof RemoveLiquidityResponse>;

export async function removeLiquidity(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
  percentageToRemove: number
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  const position = await meteora.getRawPosition(
    positionAddress,
    wallet.publicKey
  );

  if (!position) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const dlmmPool = await meteora.getDlmmPool(position.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  await dlmmPool.refetchStates();

  const binIdsToRemove = position.positionData.positionBinData.map((bin) => bin.binId);
  const bps = new BN(percentageToRemove * 100);

  const removeLiquidityTx = await dlmmPool.removeLiquidity({
    position: position.publicKey,
    user: wallet.publicKey,
    binIds: binIdsToRemove,
    bps: bps,
    shouldClaimAndClose: false,
  });

  if (Array.isArray(removeLiquidityTx)) {
    throw fastify.httpErrors.internalServerError('Unexpected array of transactions');
  }
  const signature = await solana.sendAndConfirmTransaction(removeLiquidityTx, [wallet], 1_000_000);

  const { balanceChange: tokenXRemovedAmount, fee } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenX.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  const { balanceChange: tokenYRemovedAmount } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    dlmmPool.tokenY.publicKey.toBase58(),
    dlmmPool.pubkey.toBase58()
  );

  return {
    signature,
    tokenXRemovedAmount: Math.abs(tokenXRemovedAmount),
    tokenYRemovedAmount: Math.abs(tokenYRemovedAmount),
    fee,
  };
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  RemoveLiquidityRequest.properties.address.examples = [firstWalletAddress];

  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Meteora position',
        tags: ['meteora'],
        body: RemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, address, positionAddress, percentageToRemove } = request.body;
        
        const networkToUse = network || 'mainnet-beta';
        
        return await removeLiquidity(
          fastify,
          networkToUse,
          address,
          positionAddress,
          percentageToRemove
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default removeLiquidityRoute;
