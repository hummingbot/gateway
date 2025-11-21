import { LBCLMM_PROGRAM_IDS } from '@meteora-ag/dlmm';
import { CLMM_PROGRAM_ID, AMM_V4, AMM_STABLE } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { PANCAKESWAP_CLMM_PROGRAM_ID } from '../../../connectors/pancakeswap-sol/pancakeswap-sol';
import { ParseRequestType, ParseResponseType, ParseResponseSchema } from '../../../schemas/chain-schema';
import { logger } from '../../../services/logger';
import { SolanaParseRequest } from '../schemas';
import { Solana } from '../solana';

// Program ID constants
const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

// Map program IDs to connector types
const PROGRAM_ID_MAP: Record<string, string> = {
  // Jupiter
  [JUPITER_PROGRAM_ID]: 'jupiter/router',
  // Raydium AMM
  [AMM_V4.toBase58()]: 'raydium/amm',
  [AMM_STABLE.toBase58()]: 'raydium/amm',
  // Raydium CLMM
  [CLMM_PROGRAM_ID.toBase58()]: 'raydium/clmm',
  // Meteora DLMM
  [LBCLMM_PROGRAM_IDS['mainnet-beta']]: 'meteora/clmm',
  // PancakeSwap CLMM
  [PANCAKESWAP_CLMM_PROGRAM_ID.toBase58()]: 'pancakeswap/clmm',
};

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
      const { network, signature, walletAddress } = request.body;

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

        // Auto-detect connector from transaction program IDs
        let detectedConnector: string | undefined;

        // Scan all instructions to detect which connector was used
        const message = txData.transaction.message;
        const instructions = (message as any).compiledInstructions || (message as any).instructions || [];
        const accountKeys = (message as any).staticAccountKeys || (message as any).accountKeys || [];

        for (const ix of instructions) {
          const programIdIndex = ix.programIdIndex;
          const programId = accountKeys[programIdIndex]?.toString();

          if (programId && PROGRAM_ID_MAP[programId]) {
            detectedConnector = PROGRAM_ID_MAP[programId];
            logger.info(`Transaction ${signature} interacted with ${detectedConnector} (program: ${programId})`);
            break;
          }
        }

        // Get transaction fee
        const fee = txData.meta?.fee ? txData.meta.fee / 1e9 : 0; // Convert lamports to SOL

        // Calculate native currency balance change
        const preBalance = txData.meta?.preBalances?.[0] || 0;
        const postBalance = txData.meta?.postBalances?.[0] || 0;
        const nativeBalanceChange = (postBalance - preBalance) / 1e9; // Convert lamports to SOL

        // Build token balance changes dictionary
        const tokenBalanceChanges: Record<string, number> = {};

        // Include native currency in token balance changes
        const nativeCurrencySymbol = solana.config.nativeCurrencySymbol;
        tokenBalanceChanges[nativeCurrencySymbol] = nativeBalanceChange;

        // Auto-detect tokens from transaction
        logger.info(
          `Auto-detecting token balance changes from transaction${detectedConnector ? ` (connector: ${detectedConnector})` : ''}`,
        );

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
        for (const accountIndex of accountIndices) {
          const preBalance = preBalanceMap.get(accountIndex);
          const postBalance = postBalanceMap.get(accountIndex);

          // Get the mint address (should be same in both pre and post)
          const mint = preBalance?.mint || postBalance?.mint;
          if (!mint) continue;

          // Calculate balance change for this token account
          const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
          const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
          const change = postAmount - preAmount;

          if (change !== 0) {
            const token = await solana.getToken(mint);

            // Use token symbol if found in local list, otherwise use mint address
            const identifier = token ? token.symbol : mint;

            tokenBalanceChanges[identifier] = change;

            if (token) {
              logger.info(`Auto-detected token: ${token.symbol} (${mint})`);
            } else {
              logger.info(`Auto-detected token not in list, using mint address: ${mint}`);
            }
          }
        }

        logger.info(
          `Parsed transaction ${signature} - Status: ${txStatus}, Fee: ${fee} SOL, Token changes: ${Object.entries(
            tokenBalanceChanges,
          )
            .map(([token, change]) => `${token}: ${change}`)
            .join(', ')}${detectedConnector ? `, Connector: ${detectedConnector}` : ''}`,
        );

        return {
          signature,
          slot: txData.slot,
          blockTime: txData.blockTime,
          status: txStatus,
          fee,
          tokenBalanceChanges,
          connector: detectedConnector,
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
