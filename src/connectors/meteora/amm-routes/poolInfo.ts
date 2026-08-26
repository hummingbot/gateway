import { PoolInfo } from '../../../schemas/amm-schema';
import { MeteoraDamm } from '../meteora-damm';

/** Standard AMM pool-info entry point (network-based) — consumed by the unified /trading/amm dispatcher. */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const meteoraDamm = await MeteoraDamm.getInstance(network);
  return await meteoraDamm.getPoolInfo(poolAddress);
}
