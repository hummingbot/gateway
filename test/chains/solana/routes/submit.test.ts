/**
 * Unit tests for /chains/solana/submit's implementation: deserialize a caller-signed
 * transaction, re-merge the build step's ephemeral signatures, verify every signature
 * locally (broadcast skips preflight, so a bad signature would otherwise vanish
 * silently), and broadcast.
 */
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

import { submitSolanaTransaction } from '../../../../src/chains/solana/routes/submit';
import { Solana } from '../../../../src/chains/solana/solana';

const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

const wallet = Keypair.generate();
const ephemeral = Keypair.generate();

/** A two-signer transaction like build-open returns: wallet fee payer + ephemeral account. */
function buildTx(): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: ephemeral.publicKey,
        lamports: 1,
        space: 82,
        programId: SystemProgram.programId,
      }),
    ],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

const b64 = (tx: VersionedTransaction) => Buffer.from(tx.serialize()).toString('base64');

const ephemeralSignatureFor = (tx: VersionedTransaction) =>
  Buffer.from(nacl.sign.detached(new Uint8Array(tx.message.serialize()), ephemeral.secretKey)).toString('base64');

describe('submitSolanaTransaction', () => {
  let fakeSolana: {
    sendAndConfirmRawTransaction: jest.Mock;
    throwIfLandedWithError: jest.Mock;
    connection: { isBlockhashValid: jest.Mock };
  };

  beforeEach(() => {
    fakeSolana = {
      sendAndConfirmRawTransaction: jest.fn(async () => ({
        confirmed: true,
        signature: 'landed-sig',
        txData: { meta: { fee: 5000 } },
      })),
      throwIfLandedWithError: jest.fn(async () => undefined),
      connection: { isBlockhashValid: jest.fn(async () => ({ value: true })) },
    };
    jest.spyOn(Solana, 'getInstance').mockResolvedValue(fakeSolana as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('re-merges ephemeral signatures the wallet dropped, verifies, and broadcasts', async () => {
    // The wallet signs; the ephemeral signature arrives ONLY via extraSigners — the
    // hardware-in-browser case where the adapter re-serializes with just its own signature.
    const tx = buildTx();
    const extraSignature = ephemeralSignatureFor(tx);
    tx.sign([wallet]);

    const result = await submitSolanaTransaction({} as any, 'mainnet-beta', b64(tx), [
      { pubkey: ephemeral.publicKey.toBase58(), signature: extraSignature },
    ]);

    expect(result).toEqual({ signature: 'landed-sig', status: 1, fee: 5000 / 1e9 });
    // What was broadcast carries BOTH signatures.
    const sent = fakeSolana.sendAndConfirmRawTransaction.mock.calls[0][0] as VersionedTransaction;
    expect(sent.signatures.every((s) => !s.every((b: number) => b === 0))).toBe(true);
  });

  it('refuses a transaction whose blockhash expired, and sends nothing', async () => {
    fakeSolana.connection.isBlockhashValid.mockResolvedValue({ value: false });
    const tx = buildTx();
    const extraSignature = ephemeralSignatureFor(tx);
    tx.sign([wallet]);

    await expect(
      submitSolanaTransaction({} as any, 'mainnet-beta', b64(tx), [
        { pubkey: ephemeral.publicKey.toBase58(), signature: extraSignature },
      ]),
    ).rejects.toThrow('expired before it was sent');
    expect(fakeSolana.connection.isBlockhashValid).toHaveBeenCalledWith(tx.message.recentBlockhash, {
      commitment: 'processed',
    });
    expect(fakeSolana.sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });

  it('rejects a transaction missing the wallet signature', async () => {
    const tx = buildTx();
    const extraSignature = ephemeralSignatureFor(tx);

    await expect(
      submitSolanaTransaction({} as any, 'mainnet-beta', b64(tx), [
        { pubkey: ephemeral.publicKey.toBase58(), signature: extraSignature },
      ]),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/missing the signature/) });
    expect(fakeSolana.sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });

  it('rejects a mutated message with a clear error instead of broadcasting', async () => {
    // The ephemeral signature is taken from the ORIGINAL message; the caller then mutates
    // the message (fresh blockhash) before signing — invalidating that signature.
    const original = buildTx();
    const staleSignature = ephemeralSignatureFor(original);

    const mutated = buildTx();
    mutated.message.recentBlockhash = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi5';
    mutated.sign([wallet]);

    await expect(
      submitSolanaTransaction({} as any, 'mainnet-beta', b64(mutated), [
        { pubkey: ephemeral.publicKey.toBase58(), signature: staleSignature },
      ]),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/does not verify/) });
    expect(fakeSolana.sendAndConfirmRawTransaction).not.toHaveBeenCalled();
  });

  it('rejects extraSigners that are not required signers of the transaction', async () => {
    const tx = buildTx();
    tx.sign([wallet, ephemeral]);
    const stranger = Keypair.generate();

    await expect(
      submitSolanaTransaction({} as any, 'mainnet-beta', b64(tx), [
        { pubkey: stranger.publicKey.toBase58(), signature: ephemeralSignatureFor(tx) },
      ]),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/not a required signer/) });
  });

  it('reports PENDING with the signature when the broadcast is not yet confirmed', async () => {
    fakeSolana.sendAndConfirmRawTransaction.mockResolvedValue({
      confirmed: false,
      signature: 'inflight-sig',
      txData: null,
    });

    const tx = buildTx();
    tx.sign([wallet, ephemeral]);

    const result = await submitSolanaTransaction({} as any, 'mainnet-beta', b64(tx));
    expect(result).toEqual({ signature: 'inflight-sig', status: 0, fee: null });
    // Landed-but-failed was checked before reporting pending.
    expect(fakeSolana.throwIfLandedWithError).toHaveBeenCalledWith('inflight-sig');
  });

  it('rejects garbage input as a 400, not a crash', async () => {
    await expect(submitSolanaTransaction({} as any, 'mainnet-beta', 'not-a-transaction')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
