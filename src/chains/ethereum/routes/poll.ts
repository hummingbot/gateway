import { ethers } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PollRequestType,
  PollResponseType,
  PollResponseSchema,
  TransactionStatusCode,
} from '../../../schemas/chain-schema';
import { getConnector } from '../../../services/connection-manager';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { EthereumPollRequest } from '../schemas';

// Helper function for transaction response formatting

const toEthereumTransactionResponse = (response: ethers.providers.TransactionResponse | null) => {
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
    const txData = await ethereum.getTransaction(signature);
    let txBlock, txReceipt, txStatus;
    if (!txData) {
      // Unknown to the node: never received or dropped. eth_getTransactionByHash
      // returns mempool transactions, so not-found is distinct from pending.
      logger.info(`Transaction ${signature} not found in mempool or on-chain.`);
      txBlock = -1;
      txReceipt = null;
      txStatus = TransactionStatusCode.NOT_FOUND;
    } else {
      txReceipt = await ethereum.getTransactionReceipt(signature);
      if (txReceipt === null) {
        // In the mempool, awaiting inclusion
        txBlock = -1;
        txStatus = TransactionStatusCode.PENDING;
      } else {
        txBlock = txReceipt.blockNumber;
        // Receipt status 0 = reverted, 1 = success (undefined only pre-Byzantium)
        txStatus = txReceipt.status === 0 ? TransactionStatusCode.FAILED : TransactionStatusCode.CONFIRMED;

        // decode logs
        if (connector) {
          try {
            const connectorInstance: any = await getConnector('ethereum', network, connector);

            txReceipt.logs = connectorInstance.abiDecoder?.decodeLogs(txReceipt.logs);
          } catch (e) {
            logger.error('Error with connector:', e);
            throw fastify.httpErrors.internalServerError('Failed to decode logs');
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
      fee: null,
      error: null,
      txData: toEthereumTransactionResponse(txData),
    };
  } catch (error) {
    if (error.statusCode) {
      throw error; // Re-throw if it's already a Fastify error
    }
    logger.error(`Error polling transaction: ${error.message}`);
    throw fastify.httpErrors.internalServerError(`Failed to poll transaction: ${error.message}`);
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
        body: EthereumPollRequest,
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
