import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfoSchema, GetPositionsOwnedRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../pancakeswap-sol';
import { PancakeswapSolClmmGetPositionsOwnedRequest } from '../schemas';

const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve a list of positions owned by a user's wallet in a specific PancakeSwap Solana CLMM pool",
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmGetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', poolAddress, walletAddress } = request.query;
        const solana = await Solana.getInstance(network);
        const pancakeswapSol = await PancakeswapSol.getInstance(network);

        // Validate pool address
        try {
          new PublicKey(poolAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('pool'));
        }

        // Validate wallet address
        try {
          new PublicKey(walletAddress);
        } catch (error) {
          throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('wallet'));
        }

        logger.info(`Fetching positions for wallet ${walletAddress} in pool ${poolAddress}`);

        // Get all token accounts owned by the wallet from both SPL Token and Token2022 programs
        const walletPubkey = new PublicKey(walletAddress);
        const [splTokenAccounts, token2022Accounts] = await Promise.all([
          solana.connection.getParsedTokenAccountsByOwner(walletPubkey, {
            programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
          }),
          solana.connection.getParsedTokenAccountsByOwner(walletPubkey, {
            programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
          }),
        ]);

        const allTokenAccounts = [...splTokenAccounts.value, ...token2022Accounts.value];
        logger.info(
          `Found ${splTokenAccounts.value.length} SPL token accounts and ${token2022Accounts.value.length} Token2022 accounts (${allTokenAccounts.length} total)`,
        );

        // Filter for NFTs (amount = 1, decimals = 0) and get position info
        const positions = [];
        for (const tokenAccount of allTokenAccounts) {
          const accountData = tokenAccount.account.data.parsed.info;

          // Check if this is an NFT (supply = 1, decimals = 0)
          if (accountData.tokenAmount.decimals === 0 && accountData.tokenAmount.amount === '1') {
            const mintAddress = accountData.mint;

            try {
              // Try to get position info - this will return null if not a PancakeSwap position
              const positionInfo = await pancakeswapSol.getPositionInfo(mintAddress);

              // If position exists and matches the pool, add it
              if (positionInfo && positionInfo.poolAddress === poolAddress) {
                positions.push(positionInfo);
                logger.info(`Found position: ${mintAddress}`);
              }
            } catch (error) {
              // Silently skip non-position NFTs
              logger.debug(`Skipping NFT ${mintAddress}: not a PancakeSwap position`);
            }
          }
        }

        logger.info(`Found ${positions.length} positions in pool ${poolAddress}`);
        return positions;
      } catch (e: any) {
        logger.error('Positions owned error:', e);
        // Re-throw httpErrors as-is
        if (e.statusCode) {
          throw e;
        }
        // Handle unknown errors
        const errorMessage = e.message || 'Failed to fetch positions';
        throw fastify.httpErrors.internalServerError(errorMessage);
      }
    },
  );
};

export default positionsOwnedRoute;
