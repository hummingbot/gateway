/**
 * Regression tests for ComputeBudget handling in Solana.prepareVersionedTx (the legacy
 * path is covered in sendAndConfirmTransactionForWallet.test.ts): Gateway replaces its own CU-limit (discriminator 2) and
 * CU-price (3) instructions, but must PRESERVE other ComputeBudget instruction
 * types. Titan's swap transactions carry RequestHeapFrame (1) — the program
 * needs a 256KB heap and crashes on-chain with "Access violation in heap
 * section" if it is stripped.
 */

import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';

const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

const isReplaced = (Solana as any).isReplacedComputeBudgetInstruction as (
  programId: PublicKey,
  data: Uint8Array | Buffer,
) => boolean;

describe('Solana.isReplacedComputeBudgetInstruction', () => {
  it('flags only SetComputeUnitLimit (2) and SetComputeUnitPrice (3)', () => {
    const cb = ComputeBudgetProgram.programId;
    expect(isReplaced(cb, ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }).data)).toBe(true);
    expect(isReplaced(cb, ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }).data)).toBe(true);
    expect(isReplaced(cb, ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }).data)).toBe(false);
  });

  it('never flags instructions of other programs, even with matching discriminators', () => {
    expect(isReplaced(SystemProgram.programId, Uint8Array.from([2]))).toBe(false);
    expect(isReplaced(SystemProgram.programId, Uint8Array.from([3]))).toBe(false);
  });
});

describe('Solana.prepareVersionedTx', () => {
  const prepareVersionedTx = (Solana.prototype as any).prepareVersionedTx as (
    this: unknown,
    tx: VersionedTransaction,
    currentPriorityFee: number,
    computeUnits: number,
    signers: Keypair[],
  ) => Promise<VersionedTransaction>;

  it('replaces CU-price/limit but preserves RequestHeapFrame when ComputeBudget is already referenced', async () => {
    const payer = Keypair.generate();
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [
        ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 99 }), // stale, must be replaced
        SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }),
      ],
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    const prepared = await prepareVersionedTx.call({}, tx, 0.00001, 200000, [payer]);

    const staticKeys = prepared.message.staticAccountKeys;
    const cbData = prepared.message.compiledInstructions
      .filter((ix) => staticKeys[ix.programIdIndex].equals(ComputeBudgetProgram.programId))
      .map((ix) => ix.data[0])
      .sort();
    expect(cbData).toEqual([1, 2, 3]);
    expect(
      prepared.message.compiledInstructions.some((ix) => staticKeys[ix.programIdIndex].equals(SystemProgram.programId)),
    ).toBe(true);
    expect(prepared.message.compiledInstructions).toHaveLength(4);
  });
});
