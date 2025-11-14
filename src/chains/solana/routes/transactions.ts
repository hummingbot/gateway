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
      const { network, walletAddress, connector, sinceBlock, limit = 100 } = request.query;

      const solana = await Solana.getInstance(network);
      const currentBlock = await solana.getCurrentBlockNumber();

      try {
        // Program ID for Jupiter
        const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

        // Parse connector parameter (e.g., "jupiter/router")
        let filterByProgramId: string | undefined;
        if (connector) {
          const [connectorName, connectorType] = connector.split('/');
          if (connectorName === 'jupiter' && connectorType === 'router') {
            filterByProgramId = JUPITER_PROGRAM_ID;
            logger.info(`Filtering transactions for Jupiter Aggregator v6: ${JUPITER_PROGRAM_ID}`);
          }
        }

        // When filtering by connector, limit represents signatures to fetch (not results to return)
        // This is because we need to fetch and check each transaction
        const fetchLimit = Math.min(limit, 1000); // Cap at RPC max

        const signatures = await solana.connection.getSignaturesForAddress(new PublicKey(walletAddress), {
          limit: fetchLimit,
          ...(sinceBlock && { until: undefined }),
        });

        logger.info(
          `Fetched ${signatures.length} signatures for wallet ${walletAddress}${connector ? ` (will filter by ${connector})` : ''}`,
        );

        // Filter transactions by program ID if specified
        let filteredTransactions = signatures;
        if (filterByProgramId) {
          const filtered = [];

          for (const sig of signatures) {
            try {
              // Fetch the transaction to check program IDs
              const txData = await solana.getTransaction(sig.signature);
              if (!txData) continue;

              // Check if transaction interacted with the program
              const message = txData.transaction.message;
              const instructions = (message as any).compiledInstructions || (message as any).instructions || [];
              const accountKeys = (message as any).staticAccountKeys || (message as any).accountKeys || [];

              let programFound = false;
              for (const ix of instructions) {
                const programIdIndex = ix.programIdIndex;
                const programId = accountKeys[programIdIndex]?.toString();

                if (programId === filterByProgramId) {
                  programFound = true;
                  break;
                }
              }

              if (programFound) {
                filtered.push(sig);
              }
            } catch (error) {
              logger.warn(`Failed to check transaction ${sig.signature} for program filter: ${error.message}`);
            }
          }

          filteredTransactions = filtered;
          logger.info(`Filtered to ${filteredTransactions.length} transactions matching ${connector}`);
        }

        // Map signatures to transaction items (lightweight - no parsing)
        const transactions = filteredTransactions.map((sig) => ({
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
