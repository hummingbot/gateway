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
      const { network, signature, walletAddress, connector } = request.body;

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

        // Program ID for Jupiter
        const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

        // Check if transaction interacted with Jupiter
        let connectorDetected = false;
        let action = '';

        // Parse connector parameter (e.g., "jupiter/router")
        let connectorName: string | undefined;
        let connectorType: string | undefined;
        if (connector) {
          [connectorName, connectorType] = connector.split('/');
        }

        if (connectorName && connectorName.toLowerCase() === 'jupiter' && connectorType === 'router') {
          // Check if any instruction in the transaction called Jupiter program
          const message = txData.transaction.message;
          const instructions = (message as any).compiledInstructions || (message as any).instructions || [];
          const accountKeys = (message as any).staticAccountKeys || (message as any).accountKeys || [];

          for (const ix of instructions) {
            const programIdIndex = ix.programIdIndex;
            const programId = accountKeys[programIdIndex]?.toString();

            if (programId === JUPITER_PROGRAM_ID) {
              connectorDetected = true;
              logger.info(`Transaction ${signature} interacted with Jupiter Aggregator v6: ${JUPITER_PROGRAM_ID}`);
              break;
            }
          }
        }

        // Always calculate native currency (SOL) balance change
        const nativeTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL mint address
        const tokensToTrack = [nativeTokenAddress];
        const tokenMap = new Map<string, string>();
        tokenMap.set('SOL', nativeTokenAddress);

        // If connector provided and detected, auto-detect tokens from transaction
        if (connector && connectorDetected) {
          logger.info(`Auto-detecting tokens from transaction using connector: ${connector}`);

          // Get all token account changes from the transaction
          const preTokenBalances = txData.meta?.preTokenBalances || [];
          const postTokenBalances = txData.meta?.postTokenBalances || [];

          // Extract unique mint addresses that had balance changes
          const mintAddresses = new Set<string>();
          for (const balance of [...preTokenBalances, ...postTokenBalances]) {
            if (balance.mint) {
              mintAddresses.add(balance.mint);
            }
          }

          // Look up symbols for each mint and build action string
          const detectedTokens: Array<{ symbol: string; mint: string; change: number }> = [];
          for (const mint of mintAddresses) {
            try {
              const token = await solana.getToken(mint);
              if (token) {
                tokensToTrack.push(mint);
                tokenMap.set(token.symbol, mint);

                // Calculate balance change for this token
                const index = Array.from(postTokenBalances).findIndex((b) => b.mint === mint);
                if (index >= 0) {
                  const preBalance = preTokenBalances[index]?.uiTokenAmount?.uiAmount || 0;
                  const postBalance = postTokenBalances[index]?.uiTokenAmount?.uiAmount || 0;
                  const change = postBalance - preBalance;

                  if (change !== 0) {
                    detectedTokens.push({ symbol: token.symbol, mint, change });
                  }
                }

                logger.info(`Auto-detected token: ${token.symbol} (${mint})`);
              }
            } catch (error) {
              logger.warn(`Could not resolve token for mint ${mint}: ${error.message}`);
            }
          }

          // Build action string for Jupiter swap (e.g., "Swap 0.001 WSOL for 12602.89 BONK on Jupiter Aggregator v6")
          if (detectedTokens.length >= 2) {
            const sold = detectedTokens.find((t) => t.change < 0);
            const bought = detectedTokens.find((t) => t.change > 0);

            if (sold && bought) {
              action = `Swap ${Math.abs(sold.change).toFixed(6)} ${sold.symbol} for ${Math.abs(bought.change).toFixed(6)} ${bought.symbol} on Jupiter Aggregator v6`;
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
        for (const [symbol, address] of tokenMap.entries()) {
          if (address !== nativeTokenAddress) {
            tokenBalanceChanges[symbol] = result.balanceChanges[i];
            i++;
          }
        }

        logger.info(
          `Parsed transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL, Native change: ${nativeBalanceChange} SOL, Tokens: ${Object.keys(tokenBalanceChanges).join(', ')}${action ? `, Action: ${action}` : ''}`,
        );

        return {
          signature,
          slot: txData.slot,
          blockTime: txData.blockTime,
          status: txStatus,
          fee,
          nativeBalanceChange,
          tokenBalanceChanges: Object.keys(tokenBalanceChanges).length > 0 ? tokenBalanceChanges : undefined,
          connector: connectorDetected ? connectorName : undefined,
          action: action || undefined,
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
