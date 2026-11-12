import { PublicKey } from '@solana/web3.js';

import { httpErrors } from '../../../services/error-handler';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { DbcPoolInfo, MeteoraDbc } from '../meteora-dbc';

const toPk = (value: string, field: string): PublicKey => {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage(`Invalid ${field}: {}`, value));
  }
};

/** Pool state and curve progress for a DBC virtual pool, by pool address or base mint. */
export async function getPoolInfo(
  network: string,
  selector: { poolAddress?: string; baseMint?: string },
): Promise<DbcPoolInfo> {
  const { poolAddress, baseMint } = selector;
  if (!poolAddress && !baseMint) {
    throw httpErrors.badRequest('Pass poolAddress or baseMint');
  }
  if (poolAddress && baseMint) {
    throw httpErrors.badRequest('Pass poolAddress or baseMint, not both');
  }
  const dbc = await MeteoraDbc.getInstance(network);
  const state = poolAddress
    ? await dbc.getPool(toPk(poolAddress, 'poolAddress'))
    : await dbc.getPoolByBaseMint(toPk(baseMint, 'baseMint'));
  return dbc.poolInfo(state);
}
