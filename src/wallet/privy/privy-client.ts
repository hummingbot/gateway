/**
 * Privy REST API Client
 * Handles communication with Privy's server wallet API for signing transactions
 */

import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

export interface PrivyRpcRequest {
  method: string;
  caip2?: string;
  params: {
    encoding?: string;
    transaction?: string;
    message?: string;
    typedData?: any;
  };
}

export interface PrivyRpcResponse {
  method: string;
  data: {
    signature?: string;
    signedTransaction?: string;
    encoding?: string;
    transactionHash?: string;
  };
}

export interface PrivyWalletInfo {
  id: string;
  address: string;
  chainType: string;
  createdAt?: string;
}

/**
 * Client for Privy Server Wallet API
 */
export class PrivyClient {
  private appId: string;
  private appSecret: string;
  private baseUrl: string = 'https://auth.privy.io/api/v1';

  constructor() {
    const configManager = ConfigManagerV2.getInstance();
    this.appId = configManager.get('apiKeys.privyAppId') || '';
    this.appSecret = configManager.get('apiKeys.privyAppSecret') || '';

    if (!this.appId || !this.appSecret) {
      logger.warn('Privy credentials not configured. Set apiKeys.privyAppId and apiKeys.privyAppSecret.');
    }
  }

  /**
   * Check if Privy is properly configured
   */
  public isConfigured(): boolean {
    return !!(this.appId && this.appSecret && !this.appId.includes('YOUR_') && !this.appSecret.includes('YOUR_'));
  }

  /**
   * Get the authorization header for Privy API requests
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Make an RPC request to a Privy wallet
   * @param walletId The Privy wallet ID
   * @param request The RPC request
   * @returns The RPC response
   */
  async rpc(walletId: string, request: PrivyRpcRequest): Promise<PrivyRpcResponse> {
    if (!this.isConfigured()) {
      throw new Error('Privy credentials not configured');
    }

    const url = `${this.baseUrl}/wallets/${walletId}/rpc`;
    logger.info(`Privy RPC request to wallet ${walletId}: ${request.method}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        'privy-app-id': this.appId,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Privy RPC error: ${response.status} - ${errorText}`);
      throw new Error(`Privy RPC failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    logger.info(`Privy RPC response received for method ${request.method}`);
    return result as PrivyRpcResponse;
  }

  /**
   * Get wallet information from Privy
   * @param walletId The Privy wallet ID
   * @returns Wallet information including address and chain type
   */
  async getWallet(walletId: string): Promise<PrivyWalletInfo> {
    if (!this.isConfigured()) {
      throw new Error('Privy credentials not configured');
    }

    const url = `${this.baseUrl}/wallets/${walletId}`;
    logger.info(`Fetching Privy wallet info for ${walletId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        'privy-app-id': this.appId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Privy getWallet error: ${response.status} - ${errorText}`);
      throw new Error(`Privy getWallet failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      address: result.address,
      chainType: result.chain_type,
      createdAt: result.created_at,
    };
  }

  /**
   * Sign a Solana transaction using Privy wallet
   * @param walletId The Privy wallet ID
   * @param serializedTx Base64 encoded serialized transaction
   * @returns Signed transaction (base64 encoded)
   */
  async signSolanaTransaction(walletId: string, serializedTx: string): Promise<string> {
    const response = await this.rpc(walletId, {
      method: 'signTransaction',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Solana mainnet
      params: {
        encoding: 'base64',
        transaction: serializedTx,
      },
    });

    if (!response.data.signedTransaction) {
      throw new Error('Privy did not return signed transaction');
    }

    return response.data.signedTransaction;
  }

  /**
   * Sign and send a Solana transaction using Privy wallet
   * @param walletId The Privy wallet ID
   * @param serializedTx Base64 encoded serialized transaction
   * @returns Transaction signature
   */
  async signAndSendSolanaTransaction(walletId: string, serializedTx: string): Promise<string> {
    const response = await this.rpc(walletId, {
      method: 'signAndSendTransaction',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Solana mainnet
      params: {
        encoding: 'base64',
        transaction: serializedTx,
      },
    });

    if (!response.data.transactionHash) {
      throw new Error('Privy did not return transaction hash');
    }

    return response.data.transactionHash;
  }

  /**
   * Sign an Ethereum transaction using Privy wallet
   * @param walletId The Privy wallet ID
   * @param serializedTx Hex encoded serialized transaction
   * @param chainId Ethereum chain ID
   * @returns Signed transaction (hex encoded)
   */
  async signEthereumTransaction(walletId: string, serializedTx: string, chainId: number): Promise<string> {
    const caip2 = `eip155:${chainId}`;
    const response = await this.rpc(walletId, {
      method: 'eth_signTransaction',
      caip2,
      params: {
        transaction: serializedTx,
      },
    });

    if (!response.data.signedTransaction) {
      throw new Error('Privy did not return signed transaction');
    }

    return response.data.signedTransaction;
  }

  /**
   * Sign a message using Privy wallet
   * @param walletId The Privy wallet ID
   * @param message Message to sign (hex or utf8 for Ethereum, base58 for Solana)
   * @param chainType 'ethereum' or 'solana'
   * @returns Signature
   */
  async signMessage(walletId: string, message: string, chainType: 'ethereum' | 'solana'): Promise<string> {
    const method = chainType === 'ethereum' ? 'personal_sign' : 'signMessage';
    const caip2 = chainType === 'ethereum' ? 'eip155:1' : 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

    const response = await this.rpc(walletId, {
      method,
      caip2,
      params: {
        message,
      },
    });

    if (!response.data.signature) {
      throw new Error('Privy did not return signature');
    }

    return response.data.signature;
  }
}

// Singleton instance
let privyClientInstance: PrivyClient | null = null;

/**
 * Get the singleton PrivyClient instance
 */
export function getPrivyClient(): PrivyClient {
  if (!privyClientInstance) {
    privyClientInstance = new PrivyClient();
  }
  return privyClientInstance;
}
