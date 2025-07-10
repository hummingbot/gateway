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
  tokens?: string[],
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

    let fee: number;
    let tokenBalanceChanges: Record<string, number> | undefined;

    // Calculate token balance changes if tokens array is provided and not empty, and wallet address is provided
    if (tokens && tokens.length > 0 && walletAddress) {
      try {
        // Convert symbols to addresses
        const tokenAddresses: string[] = [];
        const tokenMap = new Map<string, string>(); // Map from input value to address

        for (const token of tokens) {
          const tokenInfo = await solana.getToken(token);
          if (tokenInfo) {
            tokenAddresses.push(tokenInfo.address);
            tokenMap.set(token, tokenInfo.address);
          } else {
            logger.warn(`Could not find token info for: ${token}`);
          }
        }

        if (tokenAddresses.length > 0) {
          const result = await solana.extractBalanceChangesAndFee(
            signature,
            walletAddress,
            tokenAddresses,
          );
          fee = result.fee;

          // Build balance changes dictionary with original input values as keys
          tokenBalanceChanges = {};
          let i = 0;
          for (const token of tokens) {
            const address = tokenMap.get(token);
            if (address) {
              tokenBalanceChanges[token] = result.balanceChanges[i];
              i++;
            }
          }

          logger.info(
            `Transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL, Balance Changes: ${JSON.stringify(tokenBalanceChanges)}`,
          );
        } else {
          logger.warn('No valid tokens found');
          fee = 0;
        }
      } catch (error) {
        logger.error(
          `Error calculating balance changes for transaction ${signature}: ${error.message}`,
        );
        // Set fee to 0 on error
        fee = 0;
      }
    } else {
      // Just get the fee when no tokens specified or empty array
      const feeResult = await solana.extractBalanceChangesAndFee(
        signature,
        walletAddress || '', // Use provided wallet address or empty string
        [],
      );
      fee = feeResult.fee;
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
      tokenBalanceChanges,
      txData,
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
  const walletAddressExample = await Solana.getWalletAddressExample();

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
            tokens: {
              type: 'array',
              items: { type: 'string' },
              examples: [['SOL', 'USDC']],
            },
            walletAddress: {
              type: 'string',
              examples: [walletAddressExample],
            },
          },
        },
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature, tokens, walletAddress } = request.body;
      return await pollSolanaTransaction(
        fastify,
        network,
        signature,
        tokens,
        walletAddress,
      );
    },
  );
};

export default pollRoute;
