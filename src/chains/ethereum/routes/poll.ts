import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PollRequestType,
  PollResponseType,
  PollRequestSchema,
  PollResponseSchema,
} from '../../../schemas/chain-schema';
import { getConnector } from '../../../services/connection-manager';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';

// Helper function for transaction response formatting

const toEthereumTransactionResponse = (
  response: ethers.providers.TransactionResponse | null,
) => {
  if (response) {
    let gasPrice = null;
    if (response.gasPrice) {
      gasPrice = response.gasPrice.toString();
    }
    return {
      ...response,
      gasPrice,
      gasLimit: response.gasLimit.toString(),
      value: response.value.toString(),
    };
  }

  return null;
};

export async function pollEthereumTransaction(
  fastify: FastifyInstance,
  network: string,
  signature: string,
  connector?: string,
): Promise<PollResponseType> {
  try {
    const ethereum = await Ethereum.getInstance(network);

    const currentBlock = await ethereum.getCurrentBlockNumber();
    let txData = await ethereum.getTransaction(signature);
    let txBlock, txReceipt, txStatus;
    if (!txData) {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 1000;
      let retryCount = 0;

      while (retryCount < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        txData = await ethereum.getTransaction(signature);
        if (txData) break;
        retryCount++;
      }

      if (!txData) {
        // tx not found after retries
        logger.info(
          `Transaction ${signature} not found in mempool or does not exist after ${MAX_RETRIES} retries.`,
        );
        txBlock = -1;
        txReceipt = null;
        txStatus = -1;
      }
    }

    if (txData) {
      txReceipt = await ethereum.getTransactionReceipt(signature);
      if (txReceipt === null) {
        // tx is in the mempool
        txBlock = -1;
        txReceipt = null;

        // In stateless approach, we simply check if the transaction is still pending
        // We use a basic status code of 0 for pending transactions in mempool
        txStatus = 0;

        // Check if transaction is likely to be processed based on gas price
        if (txData.gasPrice) {
          const currentGasPrice = await ethereum.estimateGasPrice();
          // Convert current gas price from GWEI to wei for comparison
          const currentGasPriceWei = currentGasPrice * 1e9;
          // If the transaction's gas price is significantly lower than current gas price,
          // it might be stuck (status 3), otherwise it's likely to be processed (status 2)
          if (txData.gasPrice.toNumber() < currentGasPriceWei * 0.8) {
            txStatus = 3; // Likely stuck
          } else {
            txStatus = 2; // Likely to be processed
          }
        }
      } else {
        // tx has been processed
        txBlock = txReceipt.blockNumber;
        txStatus = typeof txReceipt.status === 'number' ? 1 : -1;

        // decode logs
        if (connector) {
          try {
            const connectorInstance: any = await getConnector(
              'ethereum',
              network,
              connector,
            );

            txReceipt.logs = connectorInstance.abiDecoder?.decodeLogs(
              txReceipt.logs,
            );
          } catch (e) {
            logger.error(`Error with connector: ${e.message}`);
            throw fastify.httpErrors.internalServerError(
              `Failed to decode logs: ${e.message}`,
            );
          }
        }
      }
    }

    logger.info(`Poll ethereum, signature ${signature}, status ${txStatus}.`);

    return {
      currentBlock,
      signature,
      txBlock,
      txStatus,
      txData: toEthereumTransactionResponse(txData),
      fee: null, // Optional field
    };
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw if it's already a Fastify error
    }
    logger.error(`Error polling transaction: ${error.message}`);
    throw fastify.httpErrors.internalServerError(
      `Failed to poll transaction: ${error.message}`,
    );
  }
}

export const pollRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: PollRequestType;
    Reply: PollResponseType;
  }>(
    '/poll',
    {
      schema: {
        description: 'Poll Ethereum transaction status',
        tags: ['/chain/ethereum'],
        body: {
          ...PollRequestSchema,
          properties: {
            ...PollRequestSchema.properties,
            network: {
              type: 'string',
              examples: [
                'mainnet',
                'arbitrum',
                'optimism',
                'base',
                'sepolia',
                'bsc',
                'avalanche',
                'celo',
                'polygon',
              ],
            },
            signature: { type: 'string', examples: ['0x123...'] },
          },
        },
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature } = request.body;
      return await pollEthereumTransaction(fastify, network, signature);
    },
  );
};

export default pollRoute;
