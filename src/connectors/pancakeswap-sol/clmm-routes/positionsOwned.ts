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
        const { poolAddress, walletAddress } = request.query;
        const network = request.query.network;
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

        // Get all token accounts owned by the wallet
        const walletPubkey = new PublicKey(walletAddress);
        const tokenAccounts = await solana.connection.getParsedTokenAccountsByOwner(walletPubkey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        });

        logger.info(`Found ${tokenAccounts.value.length} token accounts`);

        // Filter for NFTs (amount = 1, decimals = 0) and get position info
        const positions = [];
        for (const tokenAccount of tokenAccounts.value) {
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
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default positionsOwnedRoute;
