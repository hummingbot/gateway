import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
import { Solana } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { 
  ClosePositionRequest, 
  ClosePositionResponse, 
  ClosePositionRequestType, 
  ClosePositionResponseType,
} from '../../../services/clmm-interfaces';
import { VersionedTransaction } from '@solana/web3.js';

async function closePosition(
  _fastify: FastifyInstance,
  network: string,
  _address: string,
  positionAddress: string
): Promise<ClosePositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await RaydiumCLMM.getInstance(network);
    const wallet = await solana.getWallet(_address);

    const position = await raydium.getClmmPosition(positionAddress);
    if (!position) throw new Error(`Position ${positionAddress} not found`);
    
    const poolId = position.poolId.toBase58();
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolId);
    if (!poolInfo) throw new Error(`Pool ${poolId} not found`);

    const result = await raydium.raydium.clmm.closePosition({
      poolInfo,
      poolKeys,
      ownerPosition: position,
      txVersion: TxVersion.V0,
    });

    // Type-safe check for V0 transaction structure
    const transactions = 'tx' in result ? [result.tx] : [result.transaction];
    console.log(transactions[0]);

    // const { signedTx } = await execute({ sendAndConfirm: false });
    const { signature, fee } = await solana.sendAndConfirmVersionedTransaction(
      transactions[0] as VersionedTransaction,
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
