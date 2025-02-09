import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { removeLiquidity } from './removeLiquidity';
import { 
  ClosePositionRequest, 
  ClosePositionResponse, 
  ClosePositionRequestType, 
  ClosePositionResponseType,
} from '../../../services/clmm-interfaces';

async function closePosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await RaydiumCLMM.getInstance(network);
    const wallet = await solana.getWallet(walletAddress);

    const position = await raydium.getClmmPosition(positionAddress);
    logger.debug('Position Info:', position);

    // Handle positions with remaining liquidity first
    if (!position.liquidity.isZero()) {
      const removeLiquidityResponse = await removeLiquidity(
        _fastify,
        network,
        walletAddress,
        positionAddress,
        100,
        true
      );
      
      const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(removeLiquidityResponse.signature, 0);
      const rentRefunded = Math.abs(balanceChange);

      return {
        signature: removeLiquidityResponse.signature,
        fee: removeLiquidityResponse.fee,
        positionRentRefunded: rentRefunded,
        baseTokenAmountRemoved: removeLiquidityResponse.baseTokenAmountRemoved,
        quoteTokenAmountRemoved: removeLiquidityResponse.quoteTokenAmountRemoved,
        baseFeeAmountCollected: 0,
        quoteFeeAmountCollected: 0,
      };
    }

    // Original close position logic for empty positions
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58());
    logger.debug('Pool Info:', poolInfo);

    const result = await raydium.raydium.clmm.closePosition({
      poolInfo,
      poolKeys,
      ownerPosition: position,
      txVersion: TxVersion.V0,
    });

    logger.info('Close position transaction created:', result.transaction);

    const { signature, fee } = await solana.sendAndConfirmTransaction(
      result.transaction,
      [wallet],
      200_000
    );

    const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
    const rentRefunded = Math.abs(balanceChange);

    return {
      signature,
      fee,
      positionRentRefunded: rentRefunded,
      baseTokenAmountRemoved: 0,
      quoteTokenAmountRemoved: 0,
      baseFeeAmountCollected: 0,
      quoteFeeAmountCollected: 0,
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  const foundWallet = await solana.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
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
        description: 'Close a Raydium CLMM position',
        tags: ['raydium-clmm'],
        body: {
          ...ClosePositionRequest,
          properties: {
            ...ClosePositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            positionAddress: { type: 'string' }
          }
        },
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
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default closePositionRoute;
