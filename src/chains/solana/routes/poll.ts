import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import {
  PollRequestType,
  PollResponseType,
  PollRequestSchema,
  PollResponseSchema,
} from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { Solana } from '../solana';

export async function pollSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  signature: string,
  baseToken?: string,
  quoteToken?: string,
  walletAddress?: string,
): Promise<PollResponseType> {
  const solana = await Solana.getInstance(network);

  try {
    const currentBlock = await solana.getCurrentBlockNumber();

    // Validate transaction signature format
    if (
      !signature ||
      typeof signature !== 'string' ||
      !signature.match(/^[A-Za-z0-9]{43,88}$/)
    ) {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
        error: 'Invalid transaction signature format',
      };
    }

    const txData = await solana.getTransaction(signature);

    if (!txData) {
      return {
        currentBlock,
        signature,
        txBlock: null,
        txStatus: 0,
        txData: null,
        fee: null,
      };
    }

    const txStatus = await solana.getTransactionStatusCode(txData as any);
    const { fee } = await solana.extractBalanceChangeAndFee(signature, 0);

    let baseTokenBalanceChange: number | undefined;
    let quoteTokenBalanceChange: number | undefined;

    // Calculate token balance changes if tokens and wallet address are provided
    if (baseToken && quoteToken && walletAddress) {
      try {
        const baseTokenInfo = await solana.getToken(baseToken);
        const quoteTokenInfo = await solana.getToken(quoteToken);

        if (baseTokenInfo && quoteTokenInfo) {
          const balanceChanges = await solana.extractPairBalanceChangesAndFee(
            signature,
            baseTokenInfo,
            quoteTokenInfo,
            walletAddress,
          );
          baseTokenBalanceChange = balanceChanges.baseTokenBalanceChange;
          quoteTokenBalanceChange = balanceChanges.quoteTokenBalanceChange;

          logger.info(
            `Transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL, Base Token (${baseTokenInfo.symbol}) Change: ${baseTokenBalanceChange}, Quote Token (${quoteTokenInfo.symbol}) Change: ${quoteTokenBalanceChange}`,
          );
        } else {
          logger.warn(
            `Could not find token info for base: ${baseToken} or quote: ${quoteToken}`,
          );
        }
      } catch (error) {
        logger.error(
          `Error calculating balance changes for transaction ${signature}: ${error.message}`,
        );
      }
    } else {
      logger.info(
        `Polling for transaction ${signature}, Status: ${txStatus}, Fee: ${fee} SOL`,
      );
    }

    return {
      currentBlock,
      signature,
      txBlock: txData.slot,
      txStatus,
      fee,
      txData,
      baseTokenBalanceChange,
      quoteTokenBalanceChange,
    };
  } catch (error) {
    logger.error(`Error polling transaction ${signature}: ${error.message}`);
    return {
      currentBlock: await solana.getCurrentBlockNumber(),
      signature,
      txBlock: null,
      txStatus: 0,
      txData: null,
      fee: null,
      error: 'Transaction not found or invalid',
    };
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
        description: 'Poll for the status of a Solana transaction',
        tags: ['/chain/solana'],
        body: {
          ...PollRequestSchema,
          properties: {
            ...PollRequestSchema.properties,
            network: { type: 'string', examples: ['mainnet-beta', 'devnet'] },
            signature: {
              type: 'string',
              examples: [
                '55ukR6VCt1sQFMC8Nyeo51R1SMaTzUC7jikmkEJ2jjkQNdqBxXHraH7vaoaNmf8rX4Y55EXAj8XXoyzvvsrQqWZa',
              ],
            },
            baseToken: {
              type: 'string',
              examples: ['SOL', 'USDC'],
            },
            quoteToken: {
              type: 'string',
              examples: ['USDC', 'SOL'],
            },
            walletAddress: {
              type: 'string',
              examples: ['GJJKFjQLkPtKmqvBjmjoBGfpZDJGr65J8YCvGcCFrKBh'],
            },
          },
        },
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature, baseToken, quoteToken, walletAddress } =
        request.body;
      return await pollSolanaTransaction(
        fastify,
        network,
        signature,
        baseToken,
        quoteToken,
        walletAddress,
      );
    },
  );
};

export default pollRoute;
