import { AddressLookupTableAccount, PublicKey, VersionedTransaction } from '@solana/web3.js';

import {
  buildVersionedTransactionFromInstructions,
  dedupeComputeBudgetInstructions,
  deserializeInstructions,
  resolveAddressLookupTables,
  TitanApiInstruction,
} from '../../../src/connectors/titan/titan.utils';

const PAYER = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const ALT_ADDRESS = '9mQGjcTFmhVDMEkP7Nq3wzYRTztTv8XibnwvyR3ZQ1FS';
const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';

const rawInstruction: TitanApiInstruction = {
  programId: PROGRAM,
  accounts: [
    { pubkey: PAYER, isSigner: true, isWritable: true },
    { pubkey: ALT_ADDRESS, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([1, 2, 3, 4]).toString('base64'),
};

describe('deserializeInstructions', () => {
  it('converts Titan API instructions to web3.js TransactionInstructions', () => {
    const [instruction] = deserializeInstructions([rawInstruction]);

    expect(instruction.programId.toBase58()).toBe(PROGRAM);
    expect(instruction.keys).toHaveLength(2);
    expect(instruction.keys[0].pubkey.toBase58()).toBe(PAYER);
    expect(instruction.keys[0].isSigner).toBe(true);
    expect(instruction.keys[0].isWritable).toBe(true);
    expect(instruction.keys[1].isSigner).toBe(false);
    expect(Array.from(instruction.data)).toEqual([1, 2, 3, 4]);
  });

  it('throws on malformed instructions', () => {
    expect(() => deserializeInstructions([{ programId: PROGRAM } as any])).toThrow(/Malformed Titan instruction/);
  });
});

describe('dedupeComputeBudgetInstructions', () => {
  const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';

  const computeBudgetIx = (discriminator: number, extra: number[] = [0, 0, 0, 0]): TitanApiInstruction => ({
    programId: COMPUTE_BUDGET,
    accounts: [],
    data: Buffer.from([discriminator, ...extra]).toString('base64'),
  });

  it('drops repeated ComputeBudget instructions of the same type (live DART duplicate-heap-frame shape)', () => {
    // Shape observed from the live DART API: RequestHeapFrame (1), SetComputeUnitLimit (2),
    // SetComputeUnitPrice (3), then a DUPLICATE RequestHeapFrame (1), then the swap ix
    const instructions = deserializeInstructions([
      computeBudgetIx(1),
      computeBudgetIx(2),
      computeBudgetIx(3, [0, 0, 0, 0, 0, 0, 0, 0]),
      computeBudgetIx(1),
      rawInstruction,
    ]);

    const deduped = dedupeComputeBudgetInstructions(instructions);

    expect(deduped).toHaveLength(4);
    const discriminators = deduped.filter((ix) => ix.programId.toBase58() === COMPUTE_BUDGET).map((ix) => ix.data[0]);
    expect(discriminators).toEqual([1, 2, 3]);
    // Non-ComputeBudget instruction passes through untouched
    expect(deduped[3].programId.toBase58()).toBe(PROGRAM);
  });

  it('leaves instruction lists without duplicates unchanged', () => {
    const instructions = deserializeInstructions([computeBudgetIx(2), rawInstruction]);
    expect(dedupeComputeBudgetInstructions(instructions)).toHaveLength(2);
  });
});

describe('resolveAddressLookupTables', () => {
  it('throws a clear error when a lookup table is missing on-chain', async () => {
    const connection: any = {
      getAddressLookupTable: jest.fn().mockResolvedValue({ value: null }),
    };

    await expect(resolveAddressLookupTables(connection, [ALT_ADDRESS])).rejects.toThrow(
      `Address lookup table not found: ${ALT_ADDRESS}`,
    );
  });
});

describe('buildVersionedTransactionFromInstructions', () => {
  const altAccount = new AddressLookupTableAccount({
    key: new PublicKey(ALT_ADDRESS),
    state: {
      deactivationSlot: BigInt('18446744073709551615'),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: [],
    },
  });

  it('compiles an unsigned V0 transaction with a fresh blockhash', async () => {
    const connection: any = {
      getAddressLookupTable: jest.fn().mockResolvedValue({ value: altAccount }),
      getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: BLOCKHASH, lastValidBlockHeight: 1 }),
    };

    const transaction = await buildVersionedTransactionFromInstructions(
      connection,
      PAYER,
      [rawInstruction],
      [ALT_ADDRESS],
    );

    expect(transaction).toBeInstanceOf(VersionedTransaction);
    expect(transaction.message.version).toBe(0);
    expect(transaction.message.recentBlockhash).toBe(BLOCKHASH);
    // Unsigned: signature slots are present but zero-filled
    expect(transaction.signatures.every((sig) => sig.every((byte) => byte === 0))).toBe(true);
    // Payer is the first static account key
    expect(transaction.message.staticAccountKeys[0].toBase58()).toBe(PAYER);
    expect(connection.getAddressLookupTable).toHaveBeenCalledTimes(1);
  });

  it('throws when there are no instructions', async () => {
    const connection: any = {};
    await expect(buildVersionedTransactionFromInstructions(connection, PAYER, [], [])).rejects.toThrow(
      /No instructions/,
    );
  });
});
