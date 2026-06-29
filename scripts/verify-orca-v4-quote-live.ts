/**
 * Live verification of the v4-SDK getOrcaSwapQuote across whirlpool classes:
 *  - classic SPL mints (ts=4 and ts=1)
 *  - Token-2022 with transfer fee/hook extensions (PYUSD)
 *  - adaptive-fee pools (CASH/USDC feeTierIndex 1026, USDM1/USDC) — these
 *    panic on the legacy whirlpools-core quote path with WASM `unreachable`
 *    even when the oracle account is fetched and supplied
 *
 * Usage: SOLANA_RPC_URL=<url> npx ts-node --transpile-only scripts/verify-orca-v4-quote-live.ts
 */
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { isInitializedWithAdaptiveFee } from '@orca-so/whirlpools-core';
import { address, createSolanaRpc } from '@solana/kit';

import { getOrcaSwapQuote } from '../src/connectors/orca/orca.utils';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const CASES: Array<{ label: string; pool: string; base: string; quote: string; amount: number }> = [
  {
    label: 'SOL/USDC   (classic, ts=4)          ',
    pool: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    base: 'So11111111111111111111111111111111111111112',
    quote: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 1,
  },
  {
    label: 'USDC/USDT  (classic, ts=1)          ',
    pool: '4fuUiYxTQ6QCrdSq9ouBYcTM7bqSwYTSyLueGZLTy4T4',
    base: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quote: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    amount: 100,
  },
  {
    label: 'PYUSD/USDC (t22 fee/hook, ts=1)     ',
    pool: '9tXiuRRw7kbejLhZXtxDxYs2REe43uH2e7k1kocgdM9B',
    base: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
    quote: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 100,
  },
  {
    label: 'USDM1/USDC (t22 + adaptive fee)     ',
    pool: '6U4cpqp5eBGJdL2EsuNosnjDuxGMaDzHfTYiEsuwT5Ey',
    base: 'BNgsQdjfWmjoy3cw8T3VXWswHfgCzEMyQzUno8gmzmRC',
    quote: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 100,
  },
  {
    label: 'CASH/USDC  (adaptive fee, ts=1)     ',
    pool: '3wijQvPKm6jHQrAkfPpok5o8WjCWPm1DGG17NmeW8q1w',
    base: 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH',
    quote: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 100,
  },
];

(async () => {
  const rpc = createSolanaRpc(RPC_URL);
  let failures = 0;
  for (const c of CASES) {
    const whirlpool = await fetchWhirlpool(rpc, address(c.pool));
    const adaptive = isInitializedWithAdaptiveFee(whirlpool.data as any);
    for (const side of ['BUY', 'SELL'] as const) {
      try {
        const q = await getOrcaSwapQuote(rpc as any, c.pool, c.base, c.quote, c.amount, side, 1);
        const ok = q.price > 0 && q.inputAmount > 0 && q.outputAmount > 0 && isFinite(q.priceImpactPct);
        if (!ok) failures++;
        console.log(
          `${c.label} ${side.padEnd(4)} ${ok ? 'OK ' : 'BAD'} price=${q.price.toFixed(6)} ` +
            `impact=${q.priceImpactPct.toFixed(4)}% adaptiveFee=${adaptive}`,
        );
      } catch (e: any) {
        failures++;
        console.log(`${c.label} ${side.padEnd(4)} FAIL ${String(e.message).slice(0, 80)}`);
      }
    }
  }
  process.exit(failures > 0 ? 1 : 0);
})();
