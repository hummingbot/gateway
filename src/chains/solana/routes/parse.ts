import { FastifyPluginAsync } from 'fastify';

import { ParseRequestType, ParseResponseType, ParseResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaParseRequest } from '../schemas';
import { Solana } from '../solana';

export const parseRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ParseRequestType;
    Reply: ParseResponseType;
  }>(
    '/parse',
    {
      schema: {
        description: 'Parse a Solana transaction to extract balance changes and fees',
        tags: ['/chain/solana'],
        body: SolanaParseRequest,
        response: {
          200: ParseResponseSchema,
        },
      },
    },
    async (request) => {
      const { network, signature, walletAddress, tokens } = request.body;

      const solana = await Solana.getInstance(network);

      try {
        // Validate transaction signature format
        if (!signature || typeof signature !== 'string' || !signature.match(/^[A-Za-z0-9]{43,88}$/)) {
          return {
            signature,
            slot: null,
            blockTime: null,
            status: 0,
            fee: null,
            error: 'Invalid transaction signature format',
          };
        }

        const txData = await solana.getTransaction(signature);

        if (!txData) {
          return {
            signature,
            slot: null,
            blockTime: null,
            status: 0,
            fee: null,
            error: 'Transaction not found',
          };
        }

        const txStatus = await solana.getTransactionStatusCode(txData as any);

        // Always calculate native currency (SOL) balance change
        const nativeTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL mint address
        const tokensToTrack = [nativeTokenAddress];
        const tokenMap = new Map<string, string>();
        tokenMap.set('SOL', nativeTokenAddress);

        // Add user-specified tokens if provided
        if (tokens && tokens.length > 0) {
          for (const token of tokens) {
            const tokenInfo = await solana.getToken(token);
            if (tokenInfo) {
              tokensToTrack.push(tokenInfo.address);
              tokenMap.set(token, tokenInfo.address);
            } else {
              logger.warn(`Could not find token info for: ${token}`);
            }
          }
        }

        // Extract balance changes and fee
        const result = await solana.extractBalanceChangesAndFee(signature, walletAddress, tokensToTrack);
        const fee = result.fee;

        // Native SOL balance change (first item in array)
        const nativeBalanceChange = result.balanceChanges[0];

        // Build token balance changes dictionary
        const tokenBalanceChanges: Record<string, number> = {};
        let i = 1; // Start from index 1 (after SOL)
        if (tokens && tokens.length > 0) {
          for (const token of tokens) {
            const address = tokenMap.get(token);
            if (address && address !== nativeTokenAddress) {
              tokenBalanceChanges[token] = result.balanceChanges[i];
              i++;
            }
          }
        }

        logger.info(
          `Parsed transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL, Native change: ${nativeBalanceChange} SOL`,
        );

        return {
          signature,
          slot: txData.slot,
          blockTime: txData.blockTime,
          status: txStatus,
          fee,
          nativeBalanceChange,
          tokenBalanceChanges: Object.keys(tokenBalanceChanges).length > 0 ? tokenBalanceChanges : undefined,
        };
      } catch (error) {
        logger.error(`Error parsing transaction ${signature}: ${error.message}`);
        return {
          signature,
          slot: null,
          blockTime: null,
          status: 0,
          fee: null,
          error: error.message || 'Failed to parse transaction',
        };
      }
    },
  );
};

export default parseRoute;
