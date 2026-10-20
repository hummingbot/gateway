/**
 * A `privy` wallet through the signer seam, end to end: the wallet record comes from
 * privy-wallets.json, the registry picks the Privy backend, the chain's chokepoint has
 * Privy sign (Privy stubbed at the HTTP edge only) and broadcasts the result.
 */
import { Keypair, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { BigNumber, utils, Wallet } from 'ethers';

jest.mock('fs-extra');

import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { Solana } from '../../../src/chains/solana/solana';
import { MemoryFs } from '../../helpers/memory-fs';

import { clearPrivyEnv, RecordedPrivyRequest, setPrivyEnv, stubPrivyHttp } from './privy-http-stub';

const WALLET_ID = 'ckwalletid0000000000000a';
const RPC = `POST /v1/wallets/${WALLET_ID}/rpc`;
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';

function privyFile(address: string): string {
  return JSON.stringify({ wallets: [{ address, privyWalletId: WALLET_ID, addedAt: '2026-10-19T00:00:00.000Z' }] });
}

describe('privy wallets through the signer seam', () => {
  let memoryFs: MemoryFs;

  beforeEach(() => {
    setPrivyEnv();
    memoryFs = new MemoryFs();
    memoryFs.install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearPrivyEnv();
  });

  it('Solana: the chokepoint has Privy sign the prepared transaction and sends it', async () => {
    const privyKey = Keypair.generate();
    const address = privyKey.publicKey.toBase58();
    memoryFs.files.set('./conf/wallets/solana/privy-wallets.json', privyFile(address));
    const requests = stubPrivyHttp({
      [RPC]: (req: RecordedPrivyRequest) => {
        const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(req.body.params.transaction, 'base64')));
        tx.sign([privyKey]);
        return {
          status: 200,
          body: {
            method: 'signTransaction',
            data: { signed_transaction: Buffer.from(tx.serialize()).toString('base64'), encoding: 'base64' },
          },
        };
      },
    });
    const fakeThis = {
      simulateWithErrorHandling: jest.fn(),
      estimateGasPrice: jest.fn(async () => 0.00001),
      prepareVersionedTx: (Solana.prototype as any).prepareVersionedTx,
      signThroughSeam: (Solana.prototype as any).signThroughSeam,
      _sendAndConfirmRawTransaction: jest.fn(async () => ({
        confirmed: true,
        signature: 'sig',
        txData: { meta: { fee: 5000 } },
      })),
      getFee: jest.fn(() => 0.000005),
      config: { defaultComputeUnits: 200000 },
      connection: {
        simulateTransaction: jest.fn(async () => ({ value: { err: null, unitsConsumed: 100000 } })),
        getLatestBlockhashAndContext: jest.fn(async () => ({
          value: { lastValidBlockHeight: 100, blockhash: BLOCKHASH },
        })),
      },
    };
    const newAccount = Keypair.generate();
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: privyKey.publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: 1,
        space: 0,
        programId: SystemProgram.programId,
      }),
    );

    const result = await (Solana.prototype as any).sendAndConfirmTransactionForWallet.call(fakeThis, tx, address, [
      newAccount,
    ]);

    expect(result).toEqual({ signature: 'sig', fee: 0.000005 });
    expect(requests).toHaveLength(1);
    const [raw] = fakeThis._sendAndConfirmRawTransaction.mock.calls[0] as unknown as [Uint8Array];
    const sent = Transaction.from(raw);
    // Privy's signature and the ephemeral co-signer's both verify over the sent message.
    expect(sent.verifySignatures()).toBe(true);
    expect(sent.feePayer?.toBase58()).toBe(address);
  });

  it('Ethereum: the chokepoint has Privy sign the populated transaction and broadcasts it', async () => {
    const privyKey = Wallet.createRandom();
    memoryFs.files.set('./conf/wallets/ethereum/privy-wallets.json', privyFile(privyKey.address));
    stubPrivyHttp({
      [RPC]: (req: RecordedPrivyRequest) => {
        const t = req.body.params.transaction;
        const unsigned = {
          type: t.type,
          chainId: Number(t.chain_id),
          nonce: Number(t.nonce),
          to: t.to,
          data: t.data,
          value: t.value,
          gasLimit: t.gas_limit,
          maxFeePerGas: t.max_fee_per_gas,
          maxPriorityFeePerGas: t.max_priority_fee_per_gas,
        };
        const signature = privyKey._signingKey().signDigest(utils.keccak256(utils.serializeTransaction(unsigned)));
        return {
          status: 200,
          body: {
            method: 'eth_signTransaction',
            data: { signed_transaction: utils.serializeTransaction(unsigned, signature), encoding: 'rlp' },
          },
        };
      },
    });
    const fakeThis = {
      chainId: 8453,
      populateForWallet: Ethereum.prototype.populateForWallet,
      prepareGasOptions: jest.fn(),
      provider: {
        getTransactionCount: jest.fn(async () => 7),
        sendTransaction: jest.fn(async (raw: string) => ({ hash: utils.keccak256(raw) })),
      },
    };

    await Ethereum.prototype.sendTransactionForWallet.call(fakeThis, privyKey.address, {
      to: ROUTER,
      data: '0xdeadbeef',
      value: 5,
      gasLimit: 300000,
      maxFeePerGas: utils.parseUnits('2', 'gwei'),
      maxPriorityFeePerGas: utils.parseUnits('1', 'gwei'),
    });

    const [raw] = fakeThis.provider.sendTransaction.mock.calls[0];
    const sent = utils.parseTransaction(raw);
    expect(sent.from).toBe(privyKey.address);
    expect(sent).toMatchObject({ chainId: 8453, nonce: 7, to: ROUTER, data: '0xdeadbeef', type: 2 });
    expect(sent.value.eq(BigNumber.from(5))).toBe(true);
  });

  it('a Privy policy denial reaches the caller as a 403 and nothing is sent', async () => {
    const privyKey = Wallet.createRandom();
    memoryFs.files.set('./conf/wallets/ethereum/privy-wallets.json', privyFile(privyKey.address));
    stubPrivyHttp({
      [RPC]: () => ({ status: 400, body: { error: 'Policy denied', code: 'policy_violation' } }),
    });
    const fakeThis = {
      chainId: 8453,
      populateForWallet: Ethereum.prototype.populateForWallet,
      prepareGasOptions: jest.fn(),
      provider: { getTransactionCount: jest.fn(async () => 7), sendTransaction: jest.fn() },
    };

    await expect(
      Ethereum.prototype.sendTransactionForWallet.call(fakeThis, privyKey.address, {
        to: ROUTER,
        data: '0x',
        value: 0,
        gasLimit: 21000,
        maxFeePerGas: 2,
        maxPriorityFeePerGas: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/violates a policy/) });
    expect(fakeThis.provider.sendTransaction).not.toHaveBeenCalled();
  });
});
