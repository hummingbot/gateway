import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import {
  TransactionsRequestType,
  TransactionsResponseType,
  TransactionsResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaTransactionsRequest } from '../schemas';
import { Solana } from '../solana';

export const transactionsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: TransactionsRequestType;
    Reply: TransactionsResponseType;
  }>(
    '/transactions',
    {
      schema: {
        description: 'Get transaction history for a Solana wallet address',
        tags: ['/chain/solana'],
        querystring: SolanaTransactionsRequest,
        response: {
          200: TransactionsResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, walletAddress, limit = 100 } = request.query;

      const solana = await Solana.getInstance(network);
      const currentBlock = await solana.getCurrentBlockNumber();

      try {
        const fetchLimit = Math.min(limit, 1000); // Cap at RPC max

        const signatures = await solana.connection.getSignaturesForAddress(new PublicKey(walletAddress), {
          limit: fetchLimit,
        });

        logger.info(`Fetched ${signatures.length} signatures for wallet ${walletAddress}`);

        // Map signatures to transaction items (lightweight - no parsing)
        const transactions = signatures.map((sig) => ({
          signature: sig.signature,
          slot: sig.slot,
          blockTime: sig.blockTime,
          err: sig.err,
          memo: sig.memo || null,
          confirmationStatus: sig.confirmationStatus || null,
        }));

        return {
          currentBlock,
          transactions,
          count: transactions.length,
        };
      } catch (error) {
        logger.error(`Error fetching transactions for wallet ${walletAddress}: ${error.message}`);
        throw fastify.httpErrors.internalServerError(`Failed to fetch transactions: ${error.message}`);
      }
    },
  );
};

export default transactionsRoute;
