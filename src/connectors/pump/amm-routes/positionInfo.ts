import { AccountLayout } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';

import { PositionInfo } from '../../../schemas/amm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Pump } from '../pump';
import { fromRawAmount } from '../pump.utils';

/**
 * A wallet's fungible LP holding in a PumpSwap pool, valued pro-rata against
 * the vault reserves.
 */
export async function getPositionInfo(
  network: string,
  poolAddress: string,
  walletAddress: string,
): Promise<PositionInfo> {
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(walletAddress);
  } catch {
    throw httpErrors.badRequest('Invalid wallet address');
  }

  const pump = await Pump.getInstance(network);
  const state = await pump.getLiquidityState(poolAddress, walletPk);

  const baseTokenInfo = await pump.getTokenInfo(state.pool.baseMint.toBase58());
  const quoteTokenInfo = await pump.getTokenInfo(state.pool.quoteMint.toBase58());
  // LP mint decimals are read from the chain rather than assumed: the LP mint is
  // Token-2022 and its decimals differ from the pool tokens'.
  const lpTokenInfo = await pump.getTokenInfo(state.pool.lpMint.toBase58());

  const lpBalance = state.userPoolAccountInfo
    ? new BN(AccountLayout.decode(new Uint8Array(state.userPoolAccountInfo.data)).amount.toString())
    : new BN(0);

  const poolBase = new BN(state.poolBaseTokenAccount.amount.toString());
  const poolQuote = new BN(state.poolQuoteTokenAccount.amount.toString());

  const baseAmount = fromRawAmount(poolBase, baseTokenInfo.decimals);
  const effectiveQuote = fromRawAmount(
    poolQuote.add(state.pool.virtualQuoteReserves ?? new BN(0)),
    quoteTokenInfo.decimals,
  );

  // share = user LP / total LP supply; both raw, so the ratio needs no decimals.
  const share = state.pool.lpSupply.isZero()
    ? new Decimal(0)
    : new Decimal(lpBalance.toString()).div(state.pool.lpSupply.toString());

  return {
    poolAddress,
    walletAddress,
    baseTokenAddress: state.pool.baseMint.toBase58(),
    quoteTokenAddress: state.pool.quoteMint.toBase58(),
    lpTokenAmount: fromRawAmount(lpBalance, lpTokenInfo.decimals),
    baseTokenAmount: share.mul(baseAmount).toNumber(),
    quoteTokenAmount: share.mul(fromRawAmount(poolQuote, quoteTokenInfo.decimals)).toNumber(),
    price: baseAmount > 0 ? effectiveQuote / baseAmount : 0,
  };
}
