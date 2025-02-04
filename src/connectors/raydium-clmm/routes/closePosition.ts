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
import { ComputeBudgetProgram, VersionedTransaction, MessageV0, MessageCompiledInstruction } from '@solana/web3.js';

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
    const txVersion = TxVersion.V0;

    const position = await raydium.getClmmPosition(positionAddress);
    if (!position) throw new Error(`Position ${positionAddress} not found`);
    
    const poolId = position.poolId.toBase58();
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolId);
    if (!poolInfo) throw new Error(`Pool ${poolId} not found`);

    const { execute } = await raydium.raydium.clmm.closePosition({
      poolInfo,
      poolKeys,
      ownerPosition: position,
      txVersion,
    });

    let { signedTx: transaction } = await execute();
    // console.log("signedTx", signedTx)
    // let transaction = VersionedTransaction.deserialize(signedTx.serialize());
    console.log("transaction", transaction)
    
    let currentPriorityFee = solana.config.minPriorityFee * 1e9;
    const maxPriorityFee = solana.config.maxPriorityFee * 1e9;
    const priorityFeeMultiplier = solana.config.priorityFeeMultiplier;
    const retryCount = solana.config.retryCount;

    while (currentPriorityFee <= maxPriorityFee) {
      const modifyComputeBudget = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: currentPriorityFee,
      });

      // Create new message with proper instruction handling
      const newMessage = new MessageV0({
        header: transaction.message.header,
        staticAccountKeys: [
          ...transaction.message.staticAccountKeys,
          modifyComputeBudget.programId
        ],
        recentBlockhash: transaction.message.recentBlockhash,
        compiledInstructions: [
          ...transaction.message.compiledInstructions,
          {
            programIdIndex: transaction.message.staticAccountKeys.length, // Index of the newly added program ID
            accountKeyIndexes: modifyComputeBudget.keys.map(key => 
              transaction.message.staticAccountKeys.indexOf(key.pubkey)
            ),
            data: modifyComputeBudget.data as Buffer
          } as unknown as MessageCompiledInstruction
        ],
        addressTableLookups: transaction.message.addressTableLookups || [],
      });

      transaction = new VersionedTransaction(newMessage);
      transaction.sign([wallet]);

      let attempt = 0;
      while (attempt < retryCount) {
        console.log("sending transaction")
        try {
          const signature = await solana.connection.sendRawTransaction(
            Buffer.from(transaction.serialize()),
            { skipPreflight: true }
          );

          try {
            const { confirmed, txData } = await solana.confirmTransaction(signature);
            console.log('confirmed', confirmed);
            console.log('txData', txData);
            if (confirmed && txData) {
              const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
              const rentRefunded = Math.abs(balanceChange);

              return {
                signature,
                fee: txData.meta.fee,
                positionRentRefunded: rentRefunded,
                baseTokenAmountRemoved: 0,
                quoteTokenAmountRemoved: 0,
                baseFeeAmountCollected: 0,
                quoteFeeAmountCollected: 0,
              };
            }
          } catch (error) {
            logger.info(`Close position confirmation attempt ${attempt + 1}/10 failed with priority fee ${currentPriorityFee/1e9} SOL: ${error.message}`);
          }

          attempt++;
          await new Promise(resolve => setTimeout(resolve, solana.config.retryIntervalMs));
        } catch (error) {
          attempt++;
          await new Promise(resolve => setTimeout(resolve, solana.config.retryIntervalMs));
        }
      }

      currentPriorityFee = Math.ceil(currentPriorityFee * priorityFeeMultiplier);
      logger.info(`Increasing priority fee to ${currentPriorityFee/1e9} SOL`);
    }

    throw new Error(`Failed to confirm transaction after reaching max priority fee of ${maxPriorityFee/1e9} SOL`);
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
