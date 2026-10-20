import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { utils, Wallet } from 'ethers';
import nacl from 'tweetnacl';

import { privyBackend } from '../../../src/wallet/signers/privy';

import { clearPrivyEnv, RecordedPrivyRequest, setPrivyEnv, stubPrivyHttp } from './privy-http-stub';

const WALLET_ID = 'ckwalletid0000000000000a';
const RPC = `POST /v1/wallets/${WALLET_ID}/rpc`;

/** Privy's side of signTransaction: the enclave key signs the transaction it was sent. */
function privySolanaSigns(privyKey: Keypair, tamper = false) {
  return (req: RecordedPrivyRequest) => {
    const tx = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(req.body.params.transaction, 'base64')));
    if (tamper) tx.message.recentBlockhash = new PublicKey(new Uint8Array(32).fill(9)).toBase58();
    tx.sign([privyKey]);
    return {
      status: 200,
      body: {
        method: 'signTransaction',
        data: { signed_transaction: Buffer.from(tx.serialize()).toString('base64'), encoding: 'base64' },
      },
    };
  };
}

function solanaMessage(payer: PublicKey, coSigner?: PublicKey): Uint8Array {
  const instructions = [
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
  ];
  if (coSigner) {
    instructions.push(SystemProgram.transfer({ fromPubkey: coSigner, toPubkey: payer, lamports: 1 }));
  }
  return new TransactionMessage({
    payerKey: payer,
    recentBlockhash: new PublicKey(new Uint8Array(32).fill(1)).toBase58(),
    instructions,
  })
    .compileToV0Message()
    .serialize();
}

describe('privy signer', () => {
  beforeEach(() => setPrivyEnv());
  afterEach(() => {
    jest.restoreAllMocks();
    clearPrivyEnv();
  });

  describe('Solana', () => {
    const privyKey = Keypair.generate();
    const record = {
      chain: 'solana' as const,
      address: privyKey.publicKey.toBase58(),
      signer: 'privy' as const,
      privyWalletId: WALLET_ID,
    };

    it("returns the wallet's signature over the exact message, also as a co-signer", async () => {
      const coSigner = Keypair.generate();
      const message = solanaMessage(coSigner.publicKey, privyKey.publicKey);
      stubPrivyHttp({ [RPC]: privySolanaSigns(privyKey) });

      const signer = await privyBackend.solana(record);
      const result = await signer.signTransactionMessage(message);

      expect(result.kind).toBe('signed');
      const signature = (result as { value: Uint8Array }).value;
      expect(nacl.sign.detached.verify(message, signature, privyKey.publicKey.toBytes())).toBe(true);
    });

    it('rejects a signed transaction whose message Privy changed', async () => {
      stubPrivyHttp({ [RPC]: privySolanaSigns(privyKey, true) });
      const signer = await privyBackend.solana(record);

      await expect(signer.signTransactionMessage(solanaMessage(privyKey.publicKey))).rejects.toMatchObject({
        statusCode: 502,
        message: expect.stringMatching(/message differs/),
      });
    });

    it('refuses a message the wallet is not a signer of, without calling Privy', async () => {
      const requests = stubPrivyHttp({});
      const signer = await privyBackend.solana(record);

      await expect(signer.signTransactionMessage(solanaMessage(Keypair.generate().publicKey))).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(requests).toHaveLength(0);
    });
  });

  describe('Ethereum', () => {
    const privyKey = Wallet.createRandom();
    const record = {
      chain: 'ethereum' as const,
      address: privyKey.address,
      signer: 'privy' as const,
      privyWalletId: WALLET_ID,
    };

    it('signs a populated EIP-1559 transaction as the wallet', async () => {
      const requests = stubPrivyHttp({
        [RPC]: (req) => {
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
          // Privy's side: sign what was sent, with the wallet's key.
          const signature = privyKey._signingKey().signDigest(utils.keccak256(utils.serializeTransaction(unsigned)));
          const raw = utils.serializeTransaction(unsigned, signature);
          return {
            status: 200,
            body: { method: 'eth_signTransaction', data: { signed_transaction: raw, encoding: 'rlp' } },
          };
        },
      });

      const signer = await privyBackend.ethereum(record);
      const result = await signer.signTransaction({
        chainId: 137,
        to: '0x000000000000000000000000000000000000dEaD',
        data: '0x1234',
        value: 5,
        nonce: 3,
        gasLimit: 21000,
        type: 2,
        maxFeePerGas: 100,
        maxPriorityFeePerGas: 2,
      });

      expect(requests[0].body.params.transaction).toEqual({
        from: privyKey.address,
        to: '0x000000000000000000000000000000000000dEaD',
        chain_id: '0x89',
        nonce: '0x03',
        data: '0x1234',
        value: '0x05',
        gas_limit: '0x5208',
        type: 2,
        max_fee_per_gas: '0x64',
        max_priority_fee_per_gas: '0x02',
      });
      const parsed = utils.parseTransaction((result as { value: string }).value);
      expect(parsed.from).toBe(privyKey.address);
      expect(parsed.chainId).toBe(137);
    });
  });

  it('refuses a record that is not a privy wallet', async () => {
    await expect(
      privyBackend.solana({
        chain: 'solana',
        address: Keypair.generate().publicKey.toBase58(),
        signer: 'local',
      }),
    ).rejects.toThrow(/not 'privy'/);
  });
});
