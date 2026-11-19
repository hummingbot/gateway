/**
 * The `privy` signer backend: a Privy server wallet signs, Gateway builds and sends.
 *
 * Solana: Privy's API signs whole transactions, so the signer wraps the message the seam
 * gives it in a transaction with empty signature slots, has Privy sign it, checks that
 * Privy returned the same message, and hands back the wallet's signature only. The seam
 * places and verifies that signature, so nothing Privy returns can change what is sent.
 *
 * Ethereum: the populated transaction goes to eth_signTransaction; the seam parses the
 * signed transaction and checks sender and fields before broadcasting.
 */
import { VersionedMessage, VersionedTransaction } from '@solana/web3.js';
import { BigNumber, BigNumberish, utils } from 'ethers';

import {
  PrivyError,
  PrivyEthereumTransaction,
  privySignEthereumTransaction,
  privySignSolanaTransaction,
  validatePrivyWalletId,
} from '../privy/privy-client';

import type {
  EthereumSigner,
  SignerFactories,
  SignResult,
  SolanaSigner,
  UnsignedEvmTransaction,
  WalletRecord,
} from './types';

function hexQuantity(value: BigNumberish): string {
  return utils.hexValue(BigNumber.from(value));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function walletIdOf(record: WalletRecord): string {
  if (record.signer !== 'privy') {
    throw new Error(`Wallet ${record.address} has signer '${record.signer}', not 'privy'`);
  }
  return validatePrivyWalletId(record.privyWalletId);
}

export class PrivySolanaSigner implements SolanaSigner {
  readonly kind = 'privy' as const;

  constructor(
    readonly address: string,
    private readonly walletId: string,
  ) {}

  async signTransactionMessage(message: Uint8Array): Promise<SignResult<Uint8Array>> {
    const unsigned = new VersionedTransaction(VersionedMessage.deserialize(message));
    const signerIndex = unsigned.message.staticAccountKeys
      .slice(0, unsigned.message.header.numRequiredSignatures)
      .findIndex((key) => key.toBase58() === this.address);
    if (signerIndex < 0) {
      throw new PrivyError(400, `Privy wallet ${this.address} is not a required signer of this transaction`);
    }

    const signedBase64 = await privySignSolanaTransaction(
      this.walletId,
      Buffer.from(unsigned.serialize()).toString('base64'),
    );
    const signed = VersionedTransaction.deserialize(new Uint8Array(Buffer.from(signedBase64, 'base64')));
    if (!bytesEqual(new Uint8Array(signed.message.serialize()), message)) {
      throw new PrivyError(502, 'Privy returned a transaction whose message differs from the one Gateway sent');
    }
    return { kind: 'signed', value: signed.signatures[signerIndex] };
  }
}

export class PrivyEthereumSigner implements EthereumSigner {
  readonly kind = 'privy' as const;

  constructor(
    readonly address: string,
    private readonly walletId: string,
  ) {}

  async signTransaction(tx: UnsignedEvmTransaction): Promise<SignResult<string>> {
    const transaction: PrivyEthereumTransaction = {
      from: this.address,
      to: tx.to,
      chain_id: hexQuantity(tx.chainId),
      nonce: hexQuantity(tx.nonce),
      data: tx.data,
      value: hexQuantity(tx.value),
      gas_limit: hexQuantity(tx.gasLimit),
      type: tx.type,
    };
    if (tx.type === 2) {
      transaction.max_fee_per_gas = hexQuantity(tx.maxFeePerGas);
      transaction.max_priority_fee_per_gas = hexQuantity(tx.maxPriorityFeePerGas);
    } else {
      transaction.gas_price = hexQuantity(tx.gasPrice);
    }
    return { kind: 'signed', value: await privySignEthereumTransaction(this.walletId, transaction) };
  }
}

export const privyBackend: SignerFactories = {
  solana: async (record) => new PrivySolanaSigner(record.address, walletIdOf(record)),
  ethereum: async (record) => new PrivyEthereumSigner(record.address, walletIdOf(record)),
};
