import { bondingCurvePda, GLOBAL_PDA } from '@pump-fun/pump-sdk';
import { getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { LaunchPoolInfoResponseType } from '../../../schemas/launch-schema';
import { httpErrors } from '../../../services/error-handler';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Pump } from '../pump';

const toPk = (value: string, field: string): PublicKey => {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage(`Invalid ${field}: {}`, value));
  }
};

/**
 * A pump.fun bonding curve's state, by base mint (or the curve PDA, which is
 * derived from it — so a poolAddress is checked against the mint it names).
 *
 * A pump curve graduates when its real token reserve is sold out, so the
 * migration threshold in quote is what the curve will hold then: the quote
 * already in it plus what the constant product asks for the tokens left
 * (fees excluded). Pump keeps no per-curve platform or protocol fee account,
 * so those fields are absent; the creator's fee accrues per creator, across
 * all its coins — read it with /trading/launch/creator-fees.
 *
 * Once migrated, the curve is empty and the token trades on its canonical
 * PumpSwap pool: `migratedPool` names it and `price` is that pool's.
 */
export async function getPoolInfo(
  network: string,
  selector: { poolAddress?: string; baseMint?: string },
): Promise<LaunchPoolInfoResponseType> {
  if (!selector.baseMint) {
    throw httpErrors.badRequest('pump pool-info takes baseMint: the curve is derived from the mint');
  }
  const mint = toPk(selector.baseMint, 'baseMint');
  const curvePda = bondingCurvePda(mint);
  if (selector.poolAddress && selector.poolAddress !== curvePda.toBase58()) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(`poolAddress is not the pump curve of ${mint.toBase58()} (that is {})`, curvePda.toBase58()),
    );
  }
  const pump = await Pump.getInstance(network);
  const state = await pump.getCurveState(mint);
  const c = state.bondingCurve;
  const connection = pump.solana.connection;
  const [base, quote] = await Promise.all([
    getMint(connection, mint, 'confirmed', state.tokenProgram),
    connection.getAccountInfo(state.quoteMint).then((info) => {
      if (!info) throw httpErrors.internalServerError(`Quote mint ${state.quoteMint.toBase58()} not found`);
      return getMint(connection, state.quoteMint, 'confirmed', info.owner);
    }),
  ]);
  const bd = base.decimals;
  const qd = quote.decimals;
  const ui = (v: BN, d: number) => new Decimal(v.toString()).div(Decimal.pow(10, d));

  const quoteReserve = ui(c.realQuoteReserves, qd);
  const soldOut = c.virtualTokenReserves.lte(c.realTokenReserves);
  const quoteToFinish = soldOut
    ? new Decimal(0)
    : ui(c.virtualQuoteReserves.mul(c.realTokenReserves).div(c.virtualTokenReserves.sub(c.realTokenReserves)), qd);
  const threshold = quoteReserve.add(quoteToFinish);
  const pool = state.graduated ? pump.canonicalPoolAddress(mint, state.quoteMint) : null;
  const migrated = pool !== null && (await connection.getAccountInfo(pool)) !== null;
  if (!migrated && c.virtualTokenReserves.isZero()) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage(
        'The pump curve of {} is empty and not yet migrated: POST /trading/launch/migrate',
        mint.toBase58(),
      ),
    );
  }
  const price = migrated
    ? new Decimal((await pump.getAmmPoolInfo(pool!.toBase58())).price)
    : ui(c.virtualQuoteReserves, qd).div(ui(c.virtualTokenReserves, bd));

  return {
    poolAddress: curvePda.toBase58(),
    config: GLOBAL_PDA.toBase58(),
    creator: c.creator.toBase58(),
    baseMint: mint.toBase58(),
    quoteMint: state.quoteMint.toBase58(),
    tokenProgram: state.tokenProgram.toBase58(),
    isMigrated: state.graduated,
    ...(migrated ? { migratedPool: pool!.toBase58() } : {}),
    migrationProgress: state.graduated ? 1 : threshold.isZero() ? 0 : quoteReserve.div(threshold).toNumber(),
    quoteReserve: quoteReserve.toNumber(),
    migrationQuoteThreshold: threshold.toNumber(),
    price: price.toNumber(),
    marketCap: price.mul(ui(c.tokenTotalSupply, bd)).toNumber(),
    baseDecimals: bd,
    quoteDecimals: qd,
  };
}
