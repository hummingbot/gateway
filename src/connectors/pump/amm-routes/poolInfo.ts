import { PoolInfo } from '../../../schemas/amm-schema';
import { Pump } from '../pump';

/**
 * Standardized network-first pool-info fetcher for the PumpSwap AMM.
 * Imported by the unified /trading/amm dispatcher.
 */
export async function getPoolInfo(network: string, poolAddress: string): Promise<PoolInfo> {
  const pump = await Pump.getInstance(network);
  return await pump.getAmmPoolInfo(poolAddress);
}
