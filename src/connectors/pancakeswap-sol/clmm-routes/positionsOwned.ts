import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { PositionInfo, PositionInfoSchema } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { PancakeswapSol } from '../pancakeswap-sol';
import { PancakeswapSolClmmGetPositionsOwnedRequest, PancakeswapSolClmmGetPositionsOwnedRequestType } from '../schemas';

const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;

const GetPositionsOwnedResponse = Type.Array(PositionInfoSchema);

type GetPositionsOwnedResponseType = Static<typeof GetPositionsOwnedResponse>;

export async function getPositionsOwned(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress?: string,
): Promise<PositionInfo[]> {
  const solana = await Solana.getInstance(network);

  // Validate wallet address
  try {
    new PublicKey(walletAddress);
  } catch (error) {
    throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('wallet'));
  }

  // Validate pool address if provided
  if (poolAddress) {
    try {
      new PublicKey(poolAddress);
    } catch (error) {
      throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE('pool'));
    }
  }

  // Fetch from RPC (positions are cached individually by position address, not by wallet)
  let positions = await fetchPositionsFromRPC(solana, walletAddress);

  // Filter by poolAddress if provided
  if (poolAddress) {
    positions = positions.filter((pos) => pos.poolAddress === poolAddress);
  }

  // Populate cache for each position individually using "connector:clmm:address" format

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

  logger.debug(`Found ${nftAccounts.length} NFT token accounts, checking for positions...`);

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
      // Skip NFTs that aren't positions - this is expected
      logger.debug(`Skipping non-position NFT: ${nftAccount.account.data.parsed.info.mint}`);
    }
  }

  logger.info(`Found ${positions.length} PancakeSwap position(s) for wallet ${walletAddress.slice(0, 8)}...`);
  return positions;
}

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: PancakeswapSolClmmGetPositionsOwnedRequestType;
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
        const { network = 'mainnet-beta', walletAddress, poolAddress } = request.query;
        return await getPositionsOwned(fastify, network, walletAddress, poolAddress);
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
