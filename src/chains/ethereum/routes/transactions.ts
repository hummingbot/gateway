import { FastifyPluginAsync } from 'fastify';

import {
  TransactionsRequestType,
  TransactionsResponseType,
  TransactionsResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Ethereum } from '../ethereum';
import { getEthereumChainConfig } from '../ethereum.config';
import { EtherscanService } from '../etherscan-service';
import { EthereumTransactionsRequest } from '../schemas';

/**
 * Note: Ethereum RPC providers (including Infura) do not provide a method to query
 * transaction history by address. This endpoint uses Etherscan API when available.
 *
 * Configuration: Set etherscanAPIKey in ethereum.config for transaction history support.
 *
 * Alternative services for transaction history:
 * - Alchemy SDK (https://docs.alchemy.com/reference/sdk-gettransactions)
 * - The Graph (https://thegraph.com)
 * - Self-hosted indexer (e.g., BlockScout)
 */
export const transactionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: TransactionsRequestType;
    Reply: TransactionsResponseType;
  }>(
    '/transactions',
    {
      schema: {
        description:
          'Get transaction history for an Ethereum wallet address using Etherscan API. Requires etherscanAPIKey in ethereum.config.',
        tags: ['/chain/ethereum'],
        querystring: EthereumTransactionsRequest,
        response: {
          200: TransactionsResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, walletAddress, limit = 100 } = request.query;

      const ethereum = await Ethereum.getInstance(network);
      const currentBlock = await ethereum.getCurrentBlockNumber();
      const config = getEthereumChainConfig();

      // Check if Etherscan API key is configured
      if (!config.etherscanAPIKey) {
        logger.warn(
          `Transaction history requested for ${walletAddress} but etherscanAPIKey is not configured. ` +
            `Add etherscanAPIKey to ethereum.config to enable transaction history.`,
        );
        return {
          currentBlock,
          transactions: [],
          count: 0,
        };
      }

      try {
        // Create Etherscan service instance and fetch transactions
        // The Etherscan V2 API will return an error if the chain is not supported
        const etherscan = new EtherscanService(ethereum.chainId, ethereum.network, config.etherscanAPIKey);
        const transactions = await etherscan.getTransactions(walletAddress, limit);

        logger.info(
          `Retrieved ${transactions.length} transactions for ${walletAddress} on ${ethereum.network} from Etherscan`,
        );

        return {
          currentBlock,
          transactions,
          count: transactions.length,
        };
      } catch (error: any) {
        logger.error(`Failed to fetch transactions from Etherscan for ${ethereum.network}: ${error.message}`);
        throw fastify.httpErrors.serviceUnavailable(`Failed to fetch transactions from Etherscan: ${error.message}`);
      }
    },
  );
};

export default transactionsRoute;
