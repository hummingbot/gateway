/**
 * Privy EVM Signer
 * Provides an ethers.js compatible Signer implementation using Privy server wallets
 */

import { Provider, TransactionRequest, TransactionResponse } from '@ethersproject/abstract-provider';
import { BigNumber, Signer, utils } from 'ethers';

import { logger } from '../../services/logger';

import { getPrivyClient, PrivyClient } from './privy-client';

// Type definitions for TypedData
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

/**
 * EVM Signer that uses Privy server wallets
 * Implements ethers.js Signer interface
 */
export class PrivyEvmSigner extends Signer {
  private privyClient: PrivyClient;
  private walletId: string;
  private _address: string;
  private chainId: number;

  constructor(walletId: string, address: string, chainId: number, provider: Provider) {
    super();
    this.privyClient = getPrivyClient();
    this.walletId = walletId;
    this._address = address;
    this.chainId = chainId;
    // Use Object.defineProperty to set provider since base class declares it as readonly
    Object.defineProperty(this, 'provider', {
      value: provider,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  /**
   * Get the wallet address
   */
  async getAddress(): Promise<string> {
    return this._address;
  }

  /**
   * Sign a message using Privy
   * @param message Message to sign
   * @returns Signature
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    logger.info(`Signing message with Privy wallet ${this.walletId}`);

    // Convert message to hex if it's bytes
    const messageHex = typeof message === 'string' ? utils.hexlify(utils.toUtf8Bytes(message)) : utils.hexlify(message);

    const signature = await this.privyClient.signMessage(this.walletId, messageHex, 'ethereum');

    return signature;
  }

  /**
   * Sign a transaction using Privy
   * @param transaction Transaction to sign
   * @returns Signed transaction hex
   */
  async signTransaction(transaction: TransactionRequest): Promise<string> {
    logger.info(`Signing transaction with Privy wallet ${this.walletId}`);

    // Convert transaction to serializable format
    const tx: any = {
      to: transaction.to,
      nonce: transaction.nonce ? BigNumber.from(transaction.nonce).toNumber() : undefined,
      gasLimit: transaction.gasLimit ? BigNumber.from(transaction.gasLimit).toHexString() : undefined,
      gasPrice: transaction.gasPrice ? BigNumber.from(transaction.gasPrice).toHexString() : undefined,
      data: transaction.data ? utils.hexlify(transaction.data) : undefined,
      value: transaction.value ? BigNumber.from(transaction.value).toHexString() : undefined,
      chainId: this.chainId,
      type: transaction.type,
      maxFeePerGas: transaction.maxFeePerGas ? BigNumber.from(transaction.maxFeePerGas).toHexString() : undefined,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas
        ? BigNumber.from(transaction.maxPriorityFeePerGas).toHexString()
        : undefined,
    };

    // Serialize the unsigned transaction
    const serializedTx = utils.serializeTransaction(tx);

    // Sign via Privy
    const signedTx = await this.privyClient.signEthereumTransaction(this.walletId, serializedTx, this.chainId);

    return signedTx;
  }

  /**
   * Send a transaction using Privy signing
   * @param transaction Transaction to send
   * @returns Transaction response
   */
  async sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse> {
    logger.info(`Sending transaction with Privy wallet ${this.walletId}`);

    // Fill in missing fields
    const tx = { ...transaction };

    if (tx.nonce === undefined) {
      tx.nonce = await this.provider.getTransactionCount(this._address, 'pending');
    }
    if (tx.chainId === undefined) {
      tx.chainId = this.chainId;
    }
    if (tx.from === undefined) {
      tx.from = this._address;
    }

    // Sign the transaction
    const signedTx = await this.signTransaction(tx);

    // Broadcast the signed transaction
    return this.provider.sendTransaction(signedTx);
  }

  /**
   * Sign typed data (EIP-712)
   * @param domain Domain object
   * @param types Type definitions
   * @param value Value to sign
   * @returns Signature
   */
  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, any>,
  ): Promise<string> {
    logger.info(`Signing typed data with Privy wallet ${this.walletId}`);

    const caip2 = `eip155:${this.chainId}`;

    const response = await this.privyClient.rpc(this.walletId, {
      method: 'eth_signTypedData_v4',
      caip2,
      params: {
        typedData: {
          domain,
          types,
          primaryType: Object.keys(types).find((key) => key !== 'EIP712Domain') || 'Message',
          message: value,
        },
      },
    });

    if (!response.data.signature) {
      throw new Error('Privy did not return signature for typed data');
    }

    return response.data.signature;
  }

  /**
   * Connect to a new provider
   * @param provider New provider
   * @returns New signer connected to provider
   */
  connect(provider: Provider): PrivyEvmSigner {
    return new PrivyEvmSigner(this.walletId, this._address, this.chainId, provider);
  }
}
