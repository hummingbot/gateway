import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { Wallet, utils } from 'ethers';

jest.mock('../../src/wallet/privy/privy-service');

import { PrivyEvmSigner } from '../../src/wallet/privy/privy-evm-signer';
import { getPrivyService } from '../../src/wallet/privy/privy-service';
import { PrivySolanaSigner } from '../../src/wallet/privy/privy-solana-signer';

const WALLET_ID = 'wallet_abc123';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

function buildSolanaTransaction(payer: PublicKey, lamports: number): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports })],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

describe('PrivySolanaSigner round-trip verification', () => {
  const keypair = Keypair.generate();
  let mockSignSolanaTransaction: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignSolanaTransaction = jest.fn();
    (getPrivyService as jest.Mock).mockReturnValue({
      signSolanaTransaction: mockSignSolanaTransaction,
    });
  });

  it('accepts a correctly signed transaction', async () => {
    mockSignSolanaTransaction.mockImplementation(async (_walletId: string, serialized: string) => {
      const tx = VersionedTransaction.deserialize(Uint8Array.from(Buffer.from(serialized, 'base64')));
      tx.sign([keypair]);
      return Buffer.from(tx.serialize()).toString('base64');
    });

    const signer = new PrivySolanaSigner(WALLET_ID, keypair.publicKey.toBase58());
    const tx = buildSolanaTransaction(keypair.publicKey, 1000);
    const signed = await signer.signTransaction(tx);

    expect(signed.signatures[0].some((byte) => byte !== 0)).toBe(true);
  });

  it('rejects a signed transaction whose message was altered', async () => {
    mockSignSolanaTransaction.mockImplementation(async () => {
      // Return a different transaction (altered lamports), properly signed
      const tampered = buildSolanaTransaction(keypair.publicKey, 999999);
      tampered.sign([keypair]);
      return Buffer.from(tampered.serialize()).toString('base64');
    });

    const signer = new PrivySolanaSigner(WALLET_ID, keypair.publicKey.toBase58());
    const tx = buildSolanaTransaction(keypair.publicKey, 1000);

    await expect(signer.signTransaction(tx)).rejects.toThrow('does not match the submitted transaction');
  });

  it('rejects a transaction Privy did not actually sign', async () => {
    mockSignSolanaTransaction.mockImplementation(async (_walletId: string, serialized: string) => serialized);

    const signer = new PrivySolanaSigner(WALLET_ID, keypair.publicKey.toBase58());
    const tx = buildSolanaTransaction(keypair.publicKey, 1000);

    await expect(signer.signTransaction(tx)).rejects.toThrow('did not sign the transaction');
  });
});

describe('PrivyEvmSigner round-trip verification', () => {
  const wallet = Wallet.createRandom();
  const CHAIN_ID = 1;
  let mockSignEthereumTransaction: jest.Mock;

  const baseTx = {
    to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    value: utils.parseEther('0.1'),
    nonce: 7,
    gasLimit: 21000,
    maxFeePerGas: utils.parseUnits('20', 'gwei'),
    maxPriorityFeePerGas: utils.parseUnits('1', 'gwei'),
    type: 2,
  };

  const signWithWallet = (input: any) =>
    wallet.signTransaction({
      to: input.to,
      nonce: input.nonce,
      chainId: input.chainId,
      data: input.data,
      value: input.value ?? 0,
      gasLimit: input.gasLimit ?? 0,
      maxFeePerGas: input.maxFeePerGas ?? 0,
      maxPriorityFeePerGas: input.maxPriorityFeePerGas ?? 0,
      type: 2,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignEthereumTransaction = jest.fn();
    (getPrivyService as jest.Mock).mockReturnValue({
      signEthereumTransaction: mockSignEthereumTransaction,
    });
  });

  it('accepts a correctly signed transaction', async () => {
    mockSignEthereumTransaction.mockImplementation(async (_walletId: string, input: any) => signWithWallet(input));

    const signer = new PrivyEvmSigner(WALLET_ID, wallet.address, CHAIN_ID, {} as any);
    const signed = await signer.signTransaction(baseTx);

    const parsed = utils.parseTransaction(signed);
    expect(parsed.from).toBe(wallet.address);
    expect(parsed.to?.toLowerCase()).toBe(baseTx.to.toLowerCase());
  });

  it('rejects a signed transaction whose fields were altered', async () => {
    mockSignEthereumTransaction.mockImplementation(async (_walletId: string, input: any) =>
      signWithWallet({ ...input, to: wallet.address, value: 0 }),
    );

    const signer = new PrivyEvmSigner(WALLET_ID, wallet.address, CHAIN_ID, {} as any);

    await expect(signer.signTransaction(baseTx)).rejects.toThrow('does not match the submitted transaction');
  });

  it('rejects a transaction signed by a different key', async () => {
    const otherWallet = Wallet.createRandom();
    mockSignEthereumTransaction.mockImplementation(async (_walletId: string, input: any) =>
      otherWallet.signTransaction({
        to: input.to,
        nonce: input.nonce,
        chainId: input.chainId,
        value: input.value ?? 0,
        gasLimit: input.gasLimit ?? 0,
        maxFeePerGas: input.maxFeePerGas ?? 0,
        maxPriorityFeePerGas: input.maxPriorityFeePerGas ?? 0,
        type: 2,
      }),
    );

    const signer = new PrivyEvmSigner(WALLET_ID, wallet.address, CHAIN_ID, {} as any);

    await expect(signer.signTransaction(baseTx)).rejects.toThrow('does not match the submitted transaction');
  });
});
