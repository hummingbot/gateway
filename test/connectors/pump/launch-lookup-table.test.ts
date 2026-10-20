/**
 * A pump create with a dev buy compiles against an address lookup table: the request's,
 * the configured one, or one made for the launch in a transaction before it.
 */
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';

import { Solana } from '../../../src/chains/solana/solana';
import { captureUnsignedTransaction } from '../../../src/chains/solana/solana-build-mode';
import {
  CREATE_WITH_DEV_BUY_COMPUTE_UNITS,
  createToken,
  prepareCreateToken,
} from '../../../src/connectors/pump/launch-routes/createToken';
import { Pump } from '../../../src/connectors/pump/pump';

jest.mock('../../../src/chains/solana/solana');
jest.mock('../../../src/connectors/pump/pump');
jest.mock('../../../src/connectors/pump/pump.config', () => ({
  PumpConfig: { config: { slippagePct: 2, lookupTableAddress: '' } },
}));
jest.mock('@pump-fun/pump-sdk', () => ({
  GLOBAL_PDA: new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111112'),
  PUMP_FEE_CONFIG_PDA: new (jest.requireActual('@solana/web3.js').PublicKey)('11111111111111111111111111111113'),
  getBuyTokenAmountFromSolAmount: () => 1,
}));

const WALLET = Keypair.generate().publicKey;
const TABLE = Keypair.generate().publicKey;
const others = Array.from({ length: 12 }, () => Keypair.generate().publicKey);

const solana = {
  connection: {
    getMultipleAccountsInfo: jest.fn(async () => [{ data: Buffer.alloc(0) }, null]),
    getLatestBlockhash: jest.fn(async () => ({ blockhash: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi5' })),
    getSlot: jest.fn(async () => 1000),
    getAddressLookupTable: jest.fn(),
  },
  sendAndConfirmTransactionForWallet: jest.fn(async () => ({ signature: 'sig', fee: 0 })),
  getConfirmedTransactionData: jest.fn(async () => null),
  captureSequenceForExternalSigner: jest.fn(async () => {
    throw new Error('captured');
  }),
};

beforeEach(() => {
  jest.clearAllMocks();
  (Solana.getInstance as jest.Mock).mockResolvedValue(solana);
  (Pump.getInstance as jest.Mock).mockResolvedValue({
    sdk: {
      decodeGlobal: () => ({}),
      decodeFeeConfig: () => ({}),
      createV2AndBuyInstructions: async ({ mint }: { mint: PublicKey }) => [
        {
          programId: others[0],
          keys: [
            { pubkey: mint, isSigner: true, isWritable: true },
            { pubkey: WALLET, isSigner: true, isWritable: true },
            ...others.slice(1).map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })),
          ],
          data: Buffer.from([1]),
        },
      ],
    },
  });
});

const params = { name: 'T', symbol: 'T', metadataUri: 'https://a', devBuyAmount: 0.1 };

describe('pump create with a dev buy', () => {
  it('compiles against the lookup table the request names', async () => {
    solana.connection.getAddressLookupTable.mockResolvedValue({
      value: new AddressLookupTableAccount({
        key: TABLE,
        state: {
          deactivationSlot: BigInt('18446744073709551615'),
          lastExtendedSlot: 1,
          lastExtendedSlotStartIndex: 0,
          addresses: others,
        },
      }),
    });
    const prepared = await prepareCreateToken(params);
    await createToken('mainnet-beta', WALLET.toBase58(), { ...params, lookupTableAddress: TABLE.toBase58() }, prepared);

    expect(solana.connection.getAddressLookupTable).toHaveBeenCalledWith(TABLE);
    const [tx] = solana.sendAndConfirmTransactionForWallet.mock.calls[0] as unknown as [VersionedTransaction];
    expect(tx.message.addressTableLookups.map((l) => l.accountKey.toBase58())).toEqual([TABLE.toBase58()]);
  });

  it('refuses a lookup table that does not exist', async () => {
    solana.connection.getAddressLookupTable.mockResolvedValue({ value: null });
    const prepared = await prepareCreateToken(params);
    await expect(
      createToken('mainnet-beta', WALLET.toBase58(), { ...params, lookupTableAddress: TABLE.toBase58() }, prepared),
    ).rejects.toThrow('does not exist on this network');
  });

  it('with no table, builds one first and the atomic create and buy against it', async () => {
    const prepared = await prepareCreateToken(params);
    await expect(
      captureUnsignedTransaction({}, () => createToken('mainnet-beta', WALLET.toBase58(), params, prepared)),
    ).rejects.toThrow('captured');

    const [steps] = solana.captureSequenceForExternalSigner.mock.calls[0] as unknown as [
      { transaction: Transaction | VersionedTransaction; signers?: Keypair[]; computeUnits?: number }[],
    ];
    const [, expectedTable] = AddressLookupTableProgram.createLookupTable({
      authority: WALLET,
      payer: WALLET,
      recentSlot: 1000,
    });
    const tableTx = steps[0].transaction as Transaction;
    expect(tableTx.instructions.map((ix) => ix.programId.toBase58())).toEqual([
      AddressLookupTableProgram.programId.toBase58(),
      AddressLookupTableProgram.programId.toBase58(),
    ]);
    const createTx = steps[1].transaction as VersionedTransaction;
    expect(createTx.message.addressTableLookups[0].accountKey.toBase58()).toBe(expectedTable.toBase58());
    // Signers stay static: only the non-signer accounts are looked up.
    expect(createTx.message.staticAccountKeys.map((k) => k.toBase58())).toEqual(
      expect.arrayContaining([WALLET.toBase58(), prepared.mintKeypair.publicKey.toBase58()]),
    );
    expect(steps[1].signers).toEqual([prepared.mintKeypair]);
    expect(steps[1].computeUnits).toBe(CREATE_WITH_DEV_BUY_COMPUTE_UNITS);
    expect(solana.sendAndConfirmTransactionForWallet).not.toHaveBeenCalled();
  });
});
