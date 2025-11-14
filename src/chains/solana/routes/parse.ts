import { PublicKey } from '@solana/web3.js';
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

        // Calculate native currency (SOL) balance change including fees
        const nativeTokenAddress = 'So11111111111111111111111111111111111111112'; // SOL mint address

        // Get transaction fee
        const fee = txData.meta?.fee ? txData.meta.fee / 1e9 : 0; // Convert lamports to SOL

        // Calculate native SOL balance change
        const preBalance = txData.meta?.preBalances?.[0] || 0;
        const postBalance = txData.meta?.postBalances?.[0] || 0;
        const nativeBalanceChange = (postBalance - preBalance) / 1e9; // Convert lamports to SOL

        // Build token balance changes dictionary
        const tokenBalanceChanges: Record<string, number> = {};

        // If connector provided and detected, auto-detect tokens from transaction
        if (connector && connectorDetected) {
          logger.info(`Auto-detecting tokens from transaction using connector: ${connector}`);

          // Get all token account changes from the transaction
          const preTokenBalances = txData.meta?.preTokenBalances || [];
          const postTokenBalances = txData.meta?.postTokenBalances || [];

          // Build a map of account index to balance info for easier lookup
          const preBalanceMap = new Map<number, any>();
          const postBalanceMap = new Map<number, any>();

          for (const balance of preTokenBalances) {
            preBalanceMap.set(balance.accountIndex, balance);
          }
          for (const balance of postTokenBalances) {
            postBalanceMap.set(balance.accountIndex, balance);
          }

          // Filter to only include token accounts owned by the specified wallet
          const walletPubkey = new PublicKey(walletAddress);
          const accountIndices = new Set<number>();

          for (const balance of [...preTokenBalances, ...postTokenBalances]) {
            // Check if this token account is owned by the wallet
            if (balance.owner === walletAddress || balance.owner === walletPubkey.toString()) {
              accountIndices.add(balance.accountIndex);
            }
          }

          // Look up symbols for each mint and calculate balance changes
          const detectedTokens: Array<{ symbol: string; mint: string; change: number }> = [];
          for (const accountIndex of accountIndices) {
            const preBalance = preBalanceMap.get(accountIndex);
            const postBalance = postBalanceMap.get(accountIndex);

            // Get the mint address (should be same in both pre and post)
            const mint = preBalance?.mint || postBalance?.mint;
            if (!mint) continue;

            try {
              const token = await solana.getToken(mint);
              if (token) {
                // Calculate balance change for this token account
                const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
                const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
                const change = postAmount - preAmount;

                if (change !== 0) {
                  detectedTokens.push({ symbol: token.symbol, mint, change });
                  tokenBalanceChanges[token.symbol] = change;
                }

                logger.info(`Auto-detected token: ${token.symbol} (${mint})`);
              }
            } catch (error) {
              logger.warn(`Could not resolve token for mint ${mint}: ${error.message}`);
            }
          }

          // Build action string for Jupiter swap (e.g., "Swap 0.001 WSOL for 12602.89 BONK on Jupiter Aggregator v6")
          // For swaps involving native SOL/WSOL, use the native balance change
          if (detectedTokens.length >= 1) {
            const bought = detectedTokens.find((t) => t.change > 0);
            const sold = detectedTokens.find((t) => t.change < 0);

            if (bought && nativeBalanceChange < 0) {
              // User sold SOL/WSOL to buy token
              const solSold = Math.abs(nativeBalanceChange + fee); // Add back fee to get actual amount sold
              action = `Swap ${solSold.toFixed(6)} SOL for ${Math.abs(bought.change).toFixed(6)} ${bought.symbol} on Jupiter Aggregator v6`;
            } else if (sold && bought) {
              // Token-to-token swap
              action = `Swap ${Math.abs(sold.change).toFixed(6)} ${sold.symbol} for ${Math.abs(bought.change).toFixed(6)} ${bought.symbol} on Jupiter Aggregator v6`;
            } else if (sold && nativeBalanceChange > 0) {
              // User sold token to buy SOL/WSOL
              const solBought = nativeBalanceChange + fee; // Add back fee to get actual amount received
              action = `Swap ${Math.abs(sold.change).toFixed(6)} ${sold.symbol} for ${solBought.toFixed(6)} SOL on Jupiter Aggregator v6`;
            }
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
