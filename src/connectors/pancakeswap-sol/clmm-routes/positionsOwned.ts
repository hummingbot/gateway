import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema, GetPositionsOwnedRequestType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol, PANCAKESWAP_CLMM_PROGRAM_ID } from '../pancakeswap-sol';
import { PancakeswapSolClmmGetPositionsOwnedRequest } from '../schemas';

const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
): Promise<PositionInfo[]> {
  const solana = await Solana.getInstance(network);

  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch (error) {
    throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('wallet'));
  }

  // Check cache first
  const positionCache = solana.getPositionCache();
  if (positionCache) {
    const cached = positionCache.get(walletAddress);
    if (cached) {
      // Filter for pancakeswap-sol positions only
      const pancakeswapPositions = cached.positions.filter((pos) => pos.connector === 'pancakeswap-sol');

      logger.debug(
        `[position-cache] HIT for ${walletAddress} (${pancakeswapPositions.length} pancakeswap-sol positions)`,
      );

      // Check if stale and trigger background refresh
      if (positionCache.isStale(walletAddress)) {
        logger.debug(`[position-cache] STALE for ${walletAddress}, triggering background refresh`);
        // Non-blocking refresh
        refreshPositionsInBackground(solana, walletAddress).catch((err) =>
          logger.warn(`Background position refresh failed for ${walletAddress}: ${err.message}`),
        );
      }

      // Extract PositionInfo from cached position data
      const positions: PositionInfo[] = pancakeswapPositions.map((pos) => {
        const { connector, positionId, poolAddress, baseToken, quoteToken, liquidity, ...positionInfo } = pos;
        return positionInfo as PositionInfo;
      });

      return positions;
    }
    logger.debug(`[position-cache] MISS for ${walletAddress}`);
  }

  // Cache miss or disabled - fetch from RPC
  const positions = await fetchPositionsFromRPC(solana, walletAddress);

  // Populate cache for future requests
  if (positionCache && positions.length > 0) {
    const positionData = positions.map((positionInfo) => ({
      connector: 'pancakeswap-sol',
      positionId: positionInfo.address,
      poolAddress: positionInfo.poolAddress,
      baseToken: positionInfo.baseTokenAddress,
      quoteToken: positionInfo.quoteTokenAddress,
      liquidity: positionInfo.baseTokenAmount + positionInfo.quoteTokenAmount,
      ...positionInfo,
    }));

    positionCache.set(walletAddress, { positions: positionData });
    logger.debug(`[position-cache] SET for ${walletAddress} (${positions.length} positions)`);
  }

  return positions;
}

/**
 * Fetch positions from RPC
 */
async function fetchPositionsFromRPC(solana: Solana, walletAddress: string): Promise<PositionInfo[]> {
  const pancakeswapSol = await PancakeswapSol.getInstance(solana.network);

  logger.info(`Fetching all positions for wallet ${walletAddress}`);

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

  // Filter for NFT token accounts (amount = 1, decimals = 0)
  const nftAccounts = allTokenAccounts.filter((account) => {
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
    const decimals = account.account.data.parsed.info.tokenAmount.decimals;
    return amount === 1 && decimals === 0;
  });

  logger.info(`Found ${nftAccounts.length} NFT token accounts`);

  // Fetch position info for each NFT
  const positions: PositionInfo[] = [];
  for (const nftAccount of nftAccounts) {
    try {
      const mint = nftAccount.account.data.parsed.info.mint;
      const positionInfo = await pancakeswapSol.getPositionInfo(mint);
      if (positionInfo) {
        positions.push(positionInfo);
      }
    } catch (error) {
      logger.debug(`Skipping non-position NFT: ${nftAccount.account.data.parsed.info.mint}`);
    }
  }

  logger.info(`Found ${positions.length} total positions`);
  return positions;
}

/**
 * Background refresh of positions
 */
async function refreshPositionsInBackground(solana: Solana, walletAddress: string): Promise<void> {
  const positions = await fetchPositionsFromRPC(solana, walletAddress);
  const positionCache = solana.getPositionCache();

  if (positionCache && positions.length > 0) {
    const positionData = positions.map((positionInfo) => ({
      connector: 'pancakeswap-sol',
      positionId: positionInfo.address,
      poolAddress: positionInfo.poolAddress,
      baseToken: positionInfo.baseTokenAddress,
      quoteToken: positionInfo.quoteTokenAddress,
      liquidity: positionInfo.baseTokenAmount + positionInfo.quoteTokenAmount,
      ...positionInfo,
    }));

    positionCache.set(walletAddress, { positions: positionData });
    logger.debug(`[position-cache] Background refresh completed for ${walletAddress} (${positions.length} positions)`);
  }
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionsOwnedRequestType;
    Reply: GetPositionsOwnedResponseType;
  }>(
    '/positions-owned',
    {
      schema: {
        description: "Retrieve all positions owned by a user's wallet across all PancakeSwap Solana CLMM pools",
        tags: ['/connector/pancakeswap-sol'],
        querystring: PancakeswapSolClmmGetPositionsOwnedRequest,
        response: {
          200: GetPositionsOwnedResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'mainnet-beta', walletAddress } = request.query;
        return await getPositionsOwned(fastify, network, walletAddress);
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
