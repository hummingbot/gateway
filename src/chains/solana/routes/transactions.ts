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
      const { network, walletAddress, connector, sinceBlock, limit = 10 } = request.query;

      const solana = await Solana.getInstance(network);
      const currentBlock = await solana.getCurrentBlockNumber();

      try {
        // Fetch signatures for the wallet address
        const signatures = await solana.connection.getSignaturesForAddress(new PublicKey(walletAddress), {
          limit,
          ...(sinceBlock && { until: undefined }), // TODO: Convert sinceBlock to signature if needed
        });

        logger.info(
          `Fetched ${signatures.length} signatures for wallet ${walletAddress}${connector ? ` with connector filter: ${connector}` : ''}`,
        );

        // Map signatures to transaction items (lightweight - no parsing)
        const transactions = signatures.map((sig) => ({
          signature: sig.signature,
          slot: sig.slot,
          blockTime: sig.blockTime,
          err: sig.err,
          memo: sig.memo || null,
          confirmationStatus: sig.confirmationStatus || null,
        }));

        // TODO: Add connector filtering by fetching and checking program IDs
        // For now, return all transactions since filtering requires parsing each tx

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
