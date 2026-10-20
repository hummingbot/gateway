import { FeeConfig as PumpAmmFeeConfig, GlobalConfig, Pool, pumpPoolAuthorityPda } from '@pump-fun/pump-swap-sdk';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { httpErrors } from '../../services/error-handler';
import { logger } from '../../services/logger';

/** Convert a UI amount to raw units without float drift. */
export function toRawAmount(amount: number, decimals: number): BN {
  return new BN(new Decimal(amount).mul(new Decimal(10).pow(decimals)).toFixed(0));
}

/** Convert raw units back to a UI amount. */
export function fromRawAmount(amount: BN, decimals: number): number {
  return new Decimal(amount.toString()).div(new Decimal(10).pow(decimals)).toNumber();
}

/**
 * Total swap fee in bps for a PumpSwap pool, mirroring the SDK's internal
 * `getFees` (sdk/fees.ts, not exported from the package): tier-based fees apply
 * only when the fee program's FeeConfig exists AND the pool is a canonical pump
 * pool (creator = the pump program's pool authority PDA); other pools pay the
 * flat fees; with no FeeConfig everything falls back to the AMM GlobalConfig.
 * The coin-creator fee is only charged when the pool has a coin creator.
 */
export function pumpSwapTotalFeeBps({
  globalConfig,
  feeConfig,
  pool,
  baseReserve,
  quoteReserve,
  baseMintSupply,
}: {
  globalConfig: GlobalConfig;
  feeConfig: PumpAmmFeeConfig | null;
  pool: Pool;
  baseReserve: BN;
  quoteReserve: BN;
  baseMintSupply: BN;
}): number {
  const hasCoinCreator = !pool.coinCreator.equals(PublicKey.default);

  let fees: { lpFeeBps: BN; protocolFeeBps: BN; creatorFeeBps: BN };
  if (feeConfig === null) {
    fees = {
      lpFeeBps: globalConfig.lpFeeBasisPoints,
      protocolFeeBps: globalConfig.protocolFeeBasisPoints,
      creatorFeeBps: globalConfig.coinCreatorFeeBasisPoints,
    };
  } else if (pumpPoolAuthorityPda(pool.baseMint).equals(pool.creator)) {
    const marketCap = quoteReserve.mul(baseMintSupply).div(baseReserve);
    fees = calculateFeeTierFees(feeConfig.feeTiers, marketCap);
  } else {
    fees = feeConfig.flatFees;
  }

  const total = fees.lpFeeBps.add(fees.protocolFeeBps).add(hasCoinCreator ? fees.creatorFeeBps : new BN(0));
  return total.toNumber();
}

/** rust reference: pump-fees-math::calculate_fee_tier() */
function calculateFeeTierFees(
  feeTiers: PumpAmmFeeConfig['feeTiers'],
  marketCap: BN,
): { lpFeeBps: BN; protocolFeeBps: BN; creatorFeeBps: BN } {
  const firstTier = feeTiers[0];
  if (marketCap.lt(firstTier.marketCapLamportsThreshold)) {
    return firstTier.fees;
  }
  for (const tier of feeTiers.slice().reverse()) {
    if (marketCap.gte(tier.marketCapLamportsThreshold)) {
      return tier.fees;
    }
  }
  return firstTier.fees;
}

/**
 * Price impact of trading `baseAmount` against constant-product reserves,
 * as a percentage of the spot price. Fees are excluded — this is the pure
 * curve movement, matching how routers report impact.
 */
export function constantProductPriceImpactPct(side: 'BUY' | 'SELL', baseAmount: BN, baseReserve: BN): number {
  const t = new Decimal(baseAmount.toString());
  const x = new Decimal(baseReserve.toString());
  if (x.lte(0)) return 0;
  // BUY removes base from the pool: avg/spot - 1 = t / (x - t).
  // SELL adds base to the pool: 1 - avg/spot = t / (x + t).
  const impact = side === 'BUY' ? t.div(x.sub(t)) : t.div(x.add(t));
  return impact.mul(100).toNumber();
}

export interface TokenMetadataUpload {
  name: string;
  symbol: string;
  description?: string;
  imageUrl: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

/**
 * Upload a token image + metadata to IPFS via the configured endpoint
 * (pump.fun's own uploader by default) and return the metadata URI that
 * `create_v2` embeds on-chain. Callers who pin metadata themselves pass
 * metadataUri to create-token instead and skip this entirely.
 */
export async function uploadTokenMetadata(uploadUrl: string, params: TokenMetadataUpload): Promise<string> {
  let imageResponse: Response;
  try {
    imageResponse = await fetch(params.imageUrl);
  } catch (e: any) {
    throw httpErrors.badRequest(`Failed to fetch token image from imageUrl: ${e?.message ?? e}`);
  }
  if (!imageResponse.ok) {
    throw httpErrors.badRequest(`Failed to fetch token image from imageUrl: HTTP ${imageResponse.status}`);
  }
  const imageBlob = await imageResponse.blob();

  const form = new FormData();
  form.append('file', imageBlob, 'token-image');
  form.append('name', params.name);
  form.append('symbol', params.symbol);
  form.append('description', params.description ?? '');
  if (params.twitter) form.append('twitter', params.twitter);
  if (params.telegram) form.append('telegram', params.telegram);
  if (params.website) form.append('website', params.website);
  form.append('showName', 'true');

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(uploadUrl, { method: 'POST', body: form });
  } catch (e: any) {
    throw httpErrors.internalServerError(
      `Metadata upload to ${uploadUrl} failed: ${e?.message ?? e}. ` +
        'Upload the metadata yourself and pass metadataUri instead.',
    );
  }
  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => '');
    throw httpErrors.internalServerError(
      `Metadata upload to ${uploadUrl} failed: HTTP ${uploadResponse.status} ${body.slice(0, 200)}. ` +
        'Upload the metadata yourself and pass metadataUri instead.',
    );
  }

  const result = (await uploadResponse.json()) as { metadataUri?: string };
  if (!result.metadataUri) {
    throw httpErrors.internalServerError(
      `Metadata upload to ${uploadUrl} returned no metadataUri. ` +
        'Upload the metadata yourself and pass metadataUri instead.',
    );
  }
  logger.info(`Uploaded token metadata for ${params.symbol}: ${result.metadataUri}`);
  return result.metadataUri;
}
