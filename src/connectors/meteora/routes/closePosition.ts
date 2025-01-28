import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { removeLiquidity } from './removeLiquidity';
import { collectFees } from './collectFees';

// Schema definitions
const ClosePositionRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  walletAddress: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  positionAddress: Type.String({ default: '' }),
});

const ClosePositionResponse = Type.Object({
  signature: Type.String(),
  positionRentRefunded: Type.Number(),
  transactionFee: Type.Number(),
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

  const positionInfo = await meteora.getPositionInfo(positionAddress, wallet.publicKey);
  const dlmmPool = await meteora.getDlmmPool(positionInfo.poolAddress);

  // Remove liquidity if baseTokenAmount or quoteTokenAmount is greater than 0
  if (positionInfo.baseTokenAmount > 0 || positionInfo.quoteTokenAmount > 0) {
    await removeLiquidity(fastify, network, address, positionAddress, 100);
  }

  // Remove liquidity if baseTokenFees or quoteTokenFees is greater than 0
  if (positionInfo.baseFeeAmount > 0 || positionInfo.quoteFeeAmount > 0) {
    await collectFees(fastify, network, address, positionAddress);
  }

  // Now close the position
  const { position } = await meteora.getRawPosition(positionAddress, wallet.publicKey);
  const closePositionTx = await dlmmPool.closePosition({
    owner: wallet.publicKey,
    position: position,
  });

  const signature = await solana.sendAndConfirmTransaction(closePositionTx, [wallet], 200_000);

  const { balanceChange, fee } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
  const returnedSOL = Math.abs(balanceChange);

  return {
    signature,
    positionRentRefunded: returnedSOL,
    transactionFee: fee,
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  ClosePositionRequest.properties.walletAddress.examples = [firstWalletAddress];

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
        const { network, walletAddress, positionAddress } = request.body;
        const networkToUse = network || 'mainnet-beta';
        
        return await closePosition(
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

export default closePositionRoute; 