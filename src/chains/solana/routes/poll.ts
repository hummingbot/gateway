import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { PollRequestType, PollResponseType, PollResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaPollRequest } from '../schemas';
import { Solana } from '../solana';

// Transaction parse result type (used internally)
interface TransactionParseResult {
  signature: string;
  txBlock: number | null;
  txStatus: number;
  fee: number | null;
  tokenBalanceChanges?: Record<string, number>;
  txData: any;
  error?: string;
}

// Parse a single transaction and extract details (without currentBlock)
export async function parseSolanaTransaction(
  network: string,
  signature: string,
  tokens?: string[],
  walletAddress?: string,
): Promise<TransactionParseResult> {
  const solana = await Solana.getInstance(network);

  try {
    // Validate transaction signature format
    if (!signature || typeof signature !== 'string' || !signature.match(/^[A-Za-z0-9]{43,88}$/)) {
      return {
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
          const result = await solana.extractBalanceChangesAndFee(signature, walletAddress, tokenAddresses);
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

          logger.debug(
            `Transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL, Balance Changes: ${JSON.stringify(tokenBalanceChanges)}`,
          );
        } else {
          logger.warn('No valid tokens found');
          fee = 0;
        }
      } catch (error) {
        logger.error(`Error calculating balance changes for transaction ${signature}: ${error.message}`);
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
    }

    return {
      signature,
      txBlock: txData.slot,
      txStatus,
      fee,
      tokenBalanceChanges,
      txData,
    };
  } catch (error) {
    logger.error(`Error parsing transaction ${signature}: ${error.message}`);
    return {
      signature,
      txBlock: null,
      txStatus: 0,
      txData: null,
      fee: null,
      error: 'Transaction not found or invalid',
    };
  }
}

export async function pollSolanaTransaction(
  _fastify: FastifyInstance,
  network: string,
  signature: string,
  tokens?: string[],
  walletAddress?: string,
): Promise<PollResponseType> {
  const solana = await Solana.getInstance(network);
  const currentBlock = await solana.getCurrentBlockNumber();

  // Parse the transaction
  const txItem = await parseSolanaTransaction(network, signature, tokens, walletAddress);

  // Add currentBlock to match PollResponse schema
  return {
    currentBlock,
    ...txItem,
  };
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
        body: SolanaPollRequest,
        response: {
          200: PollResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature, tokens, walletAddress } = request.body;
      return await pollSolanaTransaction(fastify, network, signature, tokens, walletAddress);
    },
  );
};

export default pollRoute;
