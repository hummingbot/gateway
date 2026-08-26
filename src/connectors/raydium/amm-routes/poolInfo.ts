import { PoolInfo } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Raydium } from '../raydium';

/**
 * Standardized network-first pool-info fetcher for the Raydium AMM/CPMM connector.
 * Imported by the unified /trading/amm dispatcher and by the Fastify route below.
 */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const raydium = await Raydium.getInstance(network);

  const poolInfo = await raydium.getAmmPoolInfo(poolAddress);
  if (!poolInfo) throw httpErrors.notFound('Pool not found');

  // Return only the fields defined in the schema
  const { poolType, ...basePoolInfo } = poolInfo;
  return basePoolInfo;
}
