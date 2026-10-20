/**
 * The activity reader names a transaction by program and discriminator, and measures it
 * by the wallet's own balances. Both halves are pinned here: the derived discriminators
 * against bytes the venues' SDKs publish, and the reading of a synthetic transaction — a
 * venue call made as an inner CPI still classifies, a plain transfer is a deposit, and
 * the fee is kept out of the SOL change.
 */
import { CP_AMM_PROGRAM_ID } from '@meteora-ag/cp-amm-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import { discriminatorOf, readActivity } from '../../../src/chains/solana/solana-activity';

const hex = (bytes: number[]) => Buffer.from(bytes).toString('hex');

describe('anchor discriminators', () => {
  it('match the bytes the SDKs publish', () => {
    // Orca whirlpools-client and cp-amm both publish `swap`; cp-amm publishes
    // remove_all_liquidity.
    expect(discriminatorOf('swap')).toBe(hex([248, 198, 158, 145, 225, 117, 135, 200]));
    expect(discriminatorOf('increase_liquidity')).toBe(hex([46, 156, 243, 118, 13, 205, 251, 178]));
    expect(discriminatorOf('collect_fees')).toBe(hex([164, 152, 207, 99, 30, 186, 19, 182]));
    expect(discriminatorOf('close_position')).toBe(hex([123, 134, 81, 0, 49, 68, 98, 98]));
    expect(discriminatorOf('remove_all_liquidity')).toBe(hex([10, 51, 61, 35, 112, 105, 24, 85]));
  });
});

const WALLET = Keypair.generate().publicKey;
const OTHER = Keypair.generate().publicKey;
const UNKNOWN_PROGRAM = Keypair.generate().publicKey;
const MINT = Keypair.generate().publicKey.toBase58();

const ix = (programId: typeof WALLET, name: string) => ({
  programId,
  accounts: [],
  data: bs58.encode(Uint8Array.from([...Buffer.from(discriminatorOf(name), 'hex'), ...Buffer.alloc(8)])),
});

function tx(opts: {
  outer: any[];
  inner?: any[];
  pre?: { index: number; mint: string; owner: string; amount: string; decimals: number }[];
  post?: { index: number; mint: string; owner: string; amount: string; decimals: number }[];
  lamports?: [number, number];
}): any {
  const bal = (rows: any[] = []) =>
    rows.map((r) => ({
      accountIndex: r.index,
      mint: r.mint,
      owner: r.owner,
      uiTokenAmount: { amount: r.amount, decimals: r.decimals, uiAmount: null, uiAmountString: '' },
    }));
  return {
    transaction: { message: { accountKeys: [{ pubkey: WALLET }, { pubkey: OTHER }], instructions: opts.outer } },
    meta: {
      fee: 5000,
      preBalances: [opts.lamports?.[0] ?? 10_000_000, 0],
      postBalances: [opts.lamports?.[1] ?? 10_000_000 - 5000, 0],
      preTokenBalances: bal(opts.pre),
      postTokenBalances: bal(opts.post),
      innerInstructions: opts.inner ? [{ index: 0, instructions: opts.inner }] : [],
    },
  };
}

const sig = { signature: 'sig', slot: 1, blockTime: 2, err: null } as any;

describe('readActivity', () => {
  it('names a venue call made through another program by the venue call', () => {
    const read = readActivity(
      tx({
        outer: [ix(UNKNOWN_PROGRAM, 'execute')],
        inner: [ix(CP_AMM_PROGRAM_ID, 'add_liquidity')],
        pre: [{ index: 1, mint: MINT, owner: WALLET.toBase58(), amount: '1000000', decimals: 6 }],
        post: [{ index: 1, mint: MINT, owner: WALLET.toBase58(), amount: '250000', decimals: 6 }],
      }),
      WALLET.toBase58(),
      sig,
    );
    expect(read.kind).toBe('add_liquidity');
    expect(read.protocol).toBe('meteora/amm');
    expect(read.actions.map((a) => a.instruction)).toEqual(['add_liquidity']);
    expect(read.raw).toEqual([{ mint: MINT, decimals: 6, raw: -750000n }]);
  });

  it('ranks a close above the removal and collection that come with it', () => {
    const read = readActivity(
      tx({
        outer: [
          ix(CP_AMM_PROGRAM_ID, 'claim_position_fee'),
          ix(CP_AMM_PROGRAM_ID, 'remove_all_liquidity'),
          ix(CP_AMM_PROGRAM_ID, 'close_position'),
        ],
      }),
      WALLET.toBase58(),
      sig,
    );
    expect(read.kind).toBe('close_position');
    expect(read.actions.map((a) => a.kind)).toEqual(['collect_fees', 'remove_liquidity', 'close_position']);
  });

  it('reads money that moved with no venue as a deposit or a withdrawal, fee excluded', () => {
    const received = readActivity(
      tx({ outer: [], post: [{ index: 1, mint: MINT, owner: WALLET.toBase58(), amount: '5', decimals: 0 }] }),
      WALLET.toBase58(),
      sig,
    );
    expect(received.kind).toBe('deposit');
    const sent = readActivity(tx({ outer: [], lamports: [10_000_000, 4_000_000 - 5000] }), WALLET.toBase58(), sig);
    expect(sent.kind).toBe('withdraw');
    expect(sent.raw).toEqual([{ mint: 'SOL', decimals: 9, raw: -6_000_000n }]);
    expect(sent.feeLamports).toBe(5000);
  });

  it('reads a token received into a new account as a deposit, not the rent it cost', () => {
    const read = readActivity(
      tx({
        outer: [],
        post: [{ index: 1, mint: MINT, owner: WALLET.toBase58(), amount: '5', decimals: 0 }],
        lamports: [10_000_000, 10_000_000 - 2_039_280 - 5000],
      }),
      WALLET.toBase58(),
      sig,
    );
    expect(read.kind).toBe('deposit');
  });

  it('reads a wrap of SOL as neither a deposit nor a withdrawal', () => {
    const read = readActivity(
      tx({
        outer: [],
        post: [{ index: 1, mint: NATIVE_MINT.toBase58(), owner: WALLET.toBase58(), amount: '1000000', decimals: 9 }],
        lamports: [10_000_000, 10_000_000 - 1_000_000 - 2_039_280 - 5000],
      }),
      WALLET.toBase58(),
      sig,
    );
    expect(read.kind).toBe('other');
  });

  it('counts a token account handed to another owner as leaving the wallet', () => {
    const read = readActivity(
      tx({
        outer: [],
        pre: [{ index: 1, mint: MINT, owner: WALLET.toBase58(), amount: '5', decimals: 0 }],
        post: [{ index: 1, mint: MINT, owner: OTHER.toBase58(), amount: '5', decimals: 0 }],
      }),
      WALLET.toBase58(),
      sig,
    );
    expect(read.kind).toBe('withdraw');
    expect(read.raw).toEqual([{ mint: MINT, decimals: 0, raw: -5n }]);
  });

  it("does not count another owner's balances, and a fee-only transaction is other", () => {
    const read = readActivity(
      tx({ outer: [], post: [{ index: 1, mint: MINT, owner: OTHER.toBase58(), amount: '5', decimals: 0 }] }),
      WALLET.toBase58(),
      sig,
    );
    expect(read.kind).toBe('other');
    expect(read.raw).toEqual([]);
  });
});
