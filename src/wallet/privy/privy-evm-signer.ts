/**
 * Privy EVM Signer
 * An ethers.js v5 compatible Signer backed by a Privy wallet. Gateway builds and
 * broadcasts transactions itself; Privy only signs.
 */

import { Provider, TransactionRequest, TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, BigNumberish, Signer, utils } from 'ethers';

import { logger } from '../../services/logger';

import { getPrivyService, PrivyService, PrivyEthereumTransactionInput } from './privy-service';

interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

interface TypedDataField {
  name: string;
  type: string;
}

function toHexQuantity(value: BigNumberish | undefined): string | undefined {
  return value === undefined || value === null ? undefined : BigNumber.from(value).toHexString();
}

export class PrivyEvmSigner extends Signer {
  // Public for drop-in compatibility with ethers.Wallet
  public readonly address: string;
  private privyService: PrivyService;
  private walletId: string;
  private chainId: number;

  constructor(walletId: string, address: string, chainId: number, provider: Provider) {
    super();
    this.privyService = getPrivyService();
    this.walletId = walletId;
    this.address = address;
    this.chainId = chainId;
    // Use Object.defineProperty to set provider since base class declares it as readonly
    Object.defineProperty(this, 'provider', {
      value: provider,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    logger.info(`Signing message with Privy wallet ${this.walletId}`);
    const messageBytes = typeof message === 'string' ? utils.toUtf8Bytes(message) : message;
    return await this.privyService.signMessage(this.walletId, messageBytes, 'ethereum');
  }

  /**
   * Sign a transaction with the Privy wallet.
   *
   * The returned RLP-encoded transaction is parsed and verified against the request
   * (sender, recipient, calldata, value, nonce, chain) before it is returned, so a
   * manipulated response can never be broadcast.
   */
  async signTransaction(transaction: TransactionRequest): Promise<string> {
    logger.info(`Signing transaction with Privy wallet ${this.walletId}`);

    const resolved = await utils.resolveProperties(transaction);
    const tx: PrivyEthereumTransactionInput = {
      to: resolved.to,
      from: this.address,
      nonce: resolved.nonce !== undefined ? BigNumber.from(resolved.nonce).toNumber() : undefined,
      chainId: this.chainId,
      data: resolved.data ? utils.hexlify(resolved.data) : undefined,
      value: toHexQuantity(resolved.value),
      gasLimit: toHexQuantity(resolved.gasLimit),
      gasPrice: toHexQuantity(resolved.gasPrice),
      maxFeePerGas: toHexQuantity(resolved.maxFeePerGas),
      maxPriorityFeePerGas: toHexQuantity(resolved.maxPriorityFeePerGas),
      type: (resolved.type ?? undefined) as 0 | 1 | 2 | undefined,
    };

    const signedTx = await this.privyService.signEthereumTransaction(this.walletId, tx);
    this.verifySignedTransaction(tx, signedTx);
    return signedTx;
  }

  /**
   * Round-trip verification: the signed transaction must encode the same intent
   * Gateway submitted and recover to this wallet's address.
   */
  private verifySignedTransaction(submitted: PrivyEthereumTransactionInput, signedTx: string): void {
    const parsed = utils.parseTransaction(signedTx);

    const mismatches: string[] = [];
    if (parsed.from?.toLowerCase() !== this.address.toLowerCase()) {
      mismatches.push('from');
    }
    if ((parsed.to?.toLowerCase() ?? undefined) !== submitted.to?.toLowerCase()) {
      mismatches.push('to');
    }
    if (parsed.chainId !== submitted.chainId) {
      mismatches.push('chainId');
    }
    if (submitted.nonce !== undefined && parsed.nonce !== submitted.nonce) {
      mismatches.push('nonce');
    }
    if (!BigNumber.from(parsed.value ?? 0).eq(submitted.value ?? 0)) {
      mismatches.push('value');
    }
    if ((parsed.data ?? '0x') !== (submitted.data ?? '0x')) {
      mismatches.push('data');
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Privy returned a signed transaction that does not match the submitted transaction (${mismatches.join(', ')})`,
      );
    }
  }

  async sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse> {
    logger.info(`Sending transaction with Privy wallet ${this.walletId}`);

    const tx = { ...transaction };

    if (tx.nonce === undefined) {
      tx.nonce = await this.provider.getTransactionCount(this.address, 'pending');
    }
    if (tx.gasLimit === undefined) {
      tx.gasLimit = await this.provider.estimateGas({ ...tx, from: this.address });
    }
    if (tx.gasPrice === undefined && tx.maxFeePerGas === undefined) {
      const feeData = await this.provider.getFeeData();
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        tx.maxFeePerGas = feeData.maxFeePerGas;
        tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        tx.type = 2;
      } else if (feeData.gasPrice) {
        tx.gasPrice = feeData.gasPrice;
      }
    }

    const signedTx = await this.signTransaction(tx);
    return this.provider.sendTransaction(signedTx);
  }

  /**
   * Sign typed data (EIP-712)
   */
  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    logger.info(`Signing typed data with Privy wallet ${this.walletId}`);

    return await this.privyService.signEthereumTypedData(this.walletId, {
      domain,
      types,
      primaryType: Object.keys(types).find((key) => key !== 'EIP712Domain') || 'Message',
      message: value,
    });
  }

  connect(provider: Provider): PrivyEvmSigner {
    return new PrivyEvmSigner(this.walletId, this.address, this.chainId, provider);
  }
}
