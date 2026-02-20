import { PriceMath } from '@orca-so/whirlpools-sdk';
import { PublicKey } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { GetPoolInfoRequestType, PoolInfo } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaClmmGetPoolInfoRequest, OrcaPoolInfo, OrcaPoolInfoSchema } from '../schemas';

export async function getPoolInfo(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
): Promise<PoolInfo | OrcaPoolInfo> {
  const orca = await Orca.getInstance(network);
  if (!orca) {
    throw fastify.httpErrors.serviceUnavailable('Orca service unavailable');
  }

  if (!poolAddress) {
    throw fastify.httpErrors.badRequest('Pool address is required');
  }

  // Fetch on-chain whirlpool data for real-time price AND API data for analytics fields
  const [whirlpool, apiPoolInfo] = await Promise.all([
    orca.getWhirlpool(poolAddress),
    orca.getPoolInfo(poolAddress), // API data for tvlUsdc, yieldOverTvl, etc.
  ]);

  if (!whirlpool) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }

  // Get Solana connection for token info
  const solana = await Solana.getInstance(network);

  // Fetch token mint info for decimals (supports both Token and Token2022)
  const [mintA, mintB] = await fetchAllMint(orca.solanaKitRpc, [whirlpool.tokenMintA, whirlpool.tokenMintB]);

  // Calculate price from on-chain sqrtPrice (real-time)
  const price = PriceMath.sqrtPriceX64ToPrice(whirlpool.sqrtPrice, mintA.data.decimals, mintB.data.decimals);

  // Fetch vault balances for token amounts
  const [vaultA, vaultB] = await Promise.all([
    solana.connection.getTokenAccountBalance(new PublicKey(whirlpool.tokenVaultA)),
    solana.connection.getTokenAccountBalance(new PublicKey(whirlpool.tokenVaultB)),
  ]);

  // Fee rate is stored in hundredths of basis points (e.g., 400 = 0.04%)
  const feePct = Number(whirlpool.feeRate) / 10000;

  // Protocol fee rate is stored in hundredths of basis points
  const protocolFeeRate = Number(whirlpool.protocolFeeRate) / 10000;

  // Build pool info: use on-chain data for price/ticks, API data for analytics
  const poolInfo: OrcaPoolInfo = {
    address: poolAddress,
    baseTokenAddress: whirlpool.tokenMintA.toString(),
    quoteTokenAddress: whirlpool.tokenMintB.toString(),
    binStep: whirlpool.tickSpacing,
    feePct,
    price: price.toNumber(), // Real-time from on-chain sqrtPrice
    baseTokenAmount: Number(vaultA.value.amount) / Math.pow(10, mintA.data.decimals),
    quoteTokenAmount: Number(vaultB.value.amount) / Math.pow(10, mintB.data.decimals),
    activeBinId: whirlpool.tickCurrentIndex, // Real-time from on-chain
    // Orca-specific fields
    liquidity: whirlpool.liquidity.toString(),
    sqrtPrice: whirlpool.sqrtPrice.toString(), // Real-time from on-chain
    // Analytics fields from API (not available on-chain)
    tvlUsdc: apiPoolInfo?.tvlUsdc ?? 0,
    protocolFeeRate,
    yieldOverTvl: apiPoolInfo?.yieldOverTvl ?? 0,
  };

  return poolInfo;
}

export const poolInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPoolInfoRequestType;
    Reply: OrcaPoolInfo;
  }>(
    '/pool-info',
    {
      schema: {
        description: 'Get pool information for a Orca pool',
        tags: ['/connector/orca'],
        querystring: OrcaClmmGetPoolInfoRequest,
        response: {
          200: OrcaPoolInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { poolAddress } = request.query;
        const network = request.query.network;
        return (await getPoolInfo(fastify, network, poolAddress)) as OrcaPoolInfo;
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e; // Re-throw HttpErrors with original message
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default poolInfoRoute;
