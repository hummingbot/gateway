import { PublicKey } from '@solana/web3.js';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { LaunchPoolInfoResponseType } from '../../../schemas/launch-schema';
import { httpErrors } from '../../../services/error-handler';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import {
  LAUNCHLAB_DECIMALS,
  getLaunchpadPoolBaseProgram,
  launchlabPoolByMint,
  readPool,
  spotPrice,
} from '../launchlab/launchlab';

const toPk = (value: string, field: string): PublicKey => {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage(`Invalid ${field}: {}`, value));
  }
};

/**
 * A LaunchLab pool's state and curve progress, by pool address or base mint.
 * A base mint is found by the pool accounts themselves, whatever it is quoted in
 * (SOL, USDC, USD1, ...): a token launches on one curve, in one quote.
 */
export async function getPoolInfo(
  network: string,
  selector: { poolAddress?: string; baseMint?: string },
): Promise<LaunchPoolInfoResponseType> {
  const { poolAddress, baseMint } = selector;
  if (!poolAddress === !baseMint) throw httpErrors.badRequest('Pass poolAddress or baseMint, not both');
  const solana = await Solana.getInstance(network);
  let address: PublicKey;
  if (poolAddress) {
    address = toPk(poolAddress, 'poolAddress');
  } else {
    address = (await launchlabPoolByMint(solana.connection, toPk(baseMint!, 'baseMint'))).address;
  }
  const s = await readPool(solana.connection, address);
  const qd = s.mintDecimalsB;
  const ui = (v: { toString(): string }, d: number) => new Decimal(v.toString()).div(Decimal.pow(10, d)).toNumber();
  const price = spotPrice(s, qd);
  return {
    poolAddress: address.toBase58(),
    config: s.configId.toBase58(),
    creator: s.creator.toBase58(),
    baseMint: s.mintA.toBase58(),
    quoteMint: s.mintB.toBase58(),
    tokenProgram: getLaunchpadPoolBaseProgram(s.mintProgramFlag).toBase58(),
    isMigrated: s.status !== 0,
    migrationProgress: new Decimal(s.realB.toString()).div(s.totalFundRaisingB.toString()).toNumber(),
    quoteReserve: ui(s.realB, qd),
    migrationQuoteThreshold: ui(s.totalFundRaisingB, qd),
    price: price.toNumber(),
    marketCap: price.mul(ui(s.supply, LAUNCHLAB_DECIMALS)).toNumber(),
    partnerQuoteFee: ui(s.platformFee, qd),
    protocolQuoteFee: ui(s.protocolFee, qd),
    baseDecimals: s.mintDecimalsA,
    quoteDecimals: qd,
  };
}
