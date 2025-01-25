import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { Meteora } from '../meteora';
import { Solana } from '../../../chains/solana/solana';
import { Keypair } from '@solana/web3.js';
import { logger } from '../../../services/logger';

// Schema definitions
const OpenPositionRequest = Type.Object({
  network: Type.Optional(Type.String({ default: 'mainnet-beta' })),
  address: Type.String({ 
    description: 'Will use first available wallet if not specified',
    examples: [] // Will be populated during route registration
  }),
  lowerPrice: Type.Number({ default: 0.05 }),
  upperPrice: Type.Number({ default: 0.10 }),
  poolAddress: Type.String({ default: 'FtFUzuXbbw6oBbU53SDUGspEka1D5Xyc4cwnkxer6xKz' }),
});

const OpenPositionResponse = Type.Object({
  signature: Type.String(),
  positionAddress: Type.String(),
  sentSOL: Type.Number(),
  fee: Type.Number(),
});

type OpenPositionRequestType = Static<typeof OpenPositionRequest>;
type OpenPositionResponseType = Static<typeof OpenPositionResponse>;

async function openPosition(
  fastify: FastifyInstance,
  network: string,
  address: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);
  const newImbalancePosition = new Keypair();

  const dlmmPool = await meteora.getDlmmPool(poolAddress);
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  await dlmmPool.refetchStates();

  const lowerPricePerLamport = dlmmPool.toPricePerLamport(lowerPrice);
  const upperPricePerLamport = dlmmPool.toPricePerLamport(upperPrice);

  const minBinId = dlmmPool.getBinIdFromPrice(Number(lowerPricePerLamport), true) - 1;
  const maxBinId = dlmmPool.getBinIdFromPrice(Number(upperPricePerLamport), false) + 1;

  // Add validation for bin width
  const binWidth = maxBinId - minBinId;
  if (binWidth <= 0) {
    throw fastify.httpErrors.badRequest('Upper price must be greater than lower price');
  }
  
  // Only set a single bin array
  const MAX_BIN_WIDTH = 69;
  if (binWidth > MAX_BIN_WIDTH) {
    throw fastify.httpErrors.badRequest(
      `Position width (${binWidth} bins) exceeds ${MAX_BIN_WIDTH} bins for a single bin array.`
    );
  }

  const createPositionTx = await dlmmPool.createEmptyPosition({
    positionPubKey: newImbalancePosition.publicKey,
    user: wallet.publicKey,
    maxBinId,
    minBinId,
  });

  const signature = await solana.sendAndConfirmTransaction(createPositionTx, [
    wallet,
    newImbalancePosition,
  ], 100_000);

  const { balanceChange, fee } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
  const sentSOL = Math.abs(balanceChange - fee);

  return {
    signature,
    positionAddress: newImbalancePosition.publicKey.toBase58(),
    sentSOL,
    fee,
  };
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress();
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }
  
  // Update schema example
  OpenPositionRequest.properties.address.examples = [firstWalletAddress];

  fastify.post<{
    Body: OpenPositionRequestType;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Meteora position',
        tags: ['meteora'],
        body: OpenPositionRequest,
        response: {
          200: OpenPositionResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, address, lowerPrice, upperPrice, poolAddress } = request.body;
        const networkToUse = network || 'mainnet-beta';
        
        return await openPosition(
          fastify,
          networkToUse,
          address,
          lowerPrice,
          upperPrice,
          poolAddress
        );
      } catch (e) {
        if (e.statusCode) return e;
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default openPositionRoute; 