/**
 * Privy Service
 * Wraps the official @privy-io/node SDK for signing transactions with Privy wallets.
 *
 * Gateway uses the sign-only flow: transactions are built and broadcast by Gateway
 * through its own RPC connections; Privy only signs. Policies attached to the wallet
 * (allowlisted programs, contracts, recipients) are enforced inside Privy's TEE at
 * signing time.
 */

import { createPrivateKey, createPublicKey } from 'crypto';

// Type-only import: the SDK is loaded lazily in getClient() because it pulls in
// ESM-only dependencies that must not load unless Privy is actually used.
import type { PrivyClient, AuthorizationContext } from '@privy-io/node';

import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

export interface PrivyWalletInfo {
  id: string;
  address: string;
  chainType: string;
  policyIds: string[];
  ownerId: string | null;
}

export interface PrivyEthereumTransactionInput {
  to?: string;
  from?: string;
  nonce?: number;
  chainId: number;
  data?: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  type?: 0 | 1 | 2;
}

export interface PrivyPolicyRuleCondition {
  field_source: string;
  field: string;
  operator: string;
  value: string | string[];
}

export interface PrivyPolicyRule {
  name: string;
  method: string;
  action: 'ALLOW' | 'DENY';
  conditions: PrivyPolicyRuleCondition[];
}

export interface PrivyCreatePolicyParams {
  chainType: 'ethereum' | 'solana';
  name: string;
  rules: PrivyPolicyRule[];
}

export interface PrivyPolicyInfo {
  id: string;
  name: string;
  chainType: string;
  ownerId: string | null;
}

interface PrivyCredentials {
  appId: string;
  appSecret: string;
  authorizationKey?: string;
}

/**
 * Validate wallet ID before passing it to the SDK (it is interpolated into the request path).
 */
function validateWalletId(walletId: string): void {
  if (!walletId || typeof walletId !== 'string' || walletId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(walletId)) {
    throw new Error('Invalid Privy wallet ID');
  }
}

export class PrivyService {
  private client: PrivyClient | null = null;
  private clientCredentials: string = '';

  /**
   * Read credentials from config at call time so runtime config updates take effect.
   */
  private getCredentials(): PrivyCredentials {
    const configManager = ConfigManagerV2.getInstance();
    return {
      appId: configManager.get('apiKeys.privyAppId') || '',
      appSecret: configManager.get('apiKeys.privyAppSecret') || '',
      authorizationKey: configManager.get('apiKeys.privyAuthorizationKey') || undefined,
    };
  }

  public isConfigured(): boolean {
    const { appId, appSecret } = this.getCredentials();
    return !!(appId && appSecret);
  }

  private getClient(): PrivyClient {
    const credentials = this.getCredentials();
    if (!credentials.appId || !credentials.appSecret) {
      throw new Error('Privy credentials not configured. Set apiKeys.privyAppId and apiKeys.privyAppSecret.');
    }
    const fingerprint = `${credentials.appId}:${credentials.appSecret}`;
    if (!this.client || this.clientCredentials !== fingerprint) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PrivyClient: PrivyClientImpl } = require('@privy-io/node') as typeof import('@privy-io/node');
      this.client = new PrivyClientImpl({ appId: credentials.appId, appSecret: credentials.appSecret });
      this.clientCredentials = fingerprint;
    }
    return this.client;
  }

  /**
   * Authorization context for signing requests. Required when the wallet has an owner
   * (authorization key); Privy verifies the P-256 signature in addition to the app secret.
   */
  private getAuthorizationContext(): AuthorizationContext | undefined {
    const { authorizationKey } = this.getCredentials();
    if (!authorizationKey) {
      return undefined;
    }
    return { authorization_private_keys: [authorizationKey] };
  }

  /**
   * Log the full provider error at debug level, throw a sanitized error to callers.
   * Privy error bodies can include wallet addresses and internal trace IDs.
   *
   * Known Privy error shapes (verified live):
   * - Policy denial: HTTP 400, body {"error": "...", "code": "policy_violation"}
   * - Missing owner signature: HTTP 401, body {"error": "Missing `privy-authorization-signature` header ..."}
   */
  private handleError(operation: string, error: any): never {
    const status = error?.status ? ` (HTTP ${error.status})` : '';
    logger.debug(`Privy ${operation} error detail: ${error?.message ?? error}`);
    if (error?.error?.code === 'policy_violation') {
      const message = `Privy ${operation} denied by wallet policy: the transaction violates the policy attached to this wallet`;
      logger.error(message);
      throw new Error(message);
    }
    if (
      error?.status === 401 &&
      typeof error?.error?.error === 'string' &&
      error.error.error.includes('authorization')
    ) {
      const message = `Privy ${operation} rejected: wallet has an owner and requires an authorization key signature. Set apiKeys.privyAuthorizationKey to the wallet owner's private key`;
      logger.error(message);
      throw new Error(message);
    }
    logger.error(`Privy ${operation} failed${status}`);
    throw new Error(`Privy ${operation} failed${status}`);
  }

  /**
   * Fetch wallet metadata from Privy, including attached policies and owner.
   */
  async getWalletInfo(walletId: string): Promise<PrivyWalletInfo> {
    validateWalletId(walletId);
    try {
      const wallet = await this.getClient().wallets().get(walletId);
      return {
        id: wallet.id,
        address: wallet.address,
        chainType: wallet.chain_type,
        policyIds: wallet.policy_ids ?? [],
        ownerId: wallet.owner_id ?? null,
      };
    } catch (error) {
      this.handleError('getWalletInfo', error);
    }
  }

  /**
   * Sign a Solana transaction.
   * @param serializedTx Base64 encoded serialized transaction (network identity is in the blockhash)
   * @returns Signed transaction, base64 encoded
   */
  async signSolanaTransaction(walletId: string, serializedTx: string): Promise<string> {
    validateWalletId(walletId);
    try {
      const response = await this.getClient().wallets().solana().signTransaction(walletId, {
        transaction: serializedTx,
        authorization_context: this.getAuthorizationContext(),
      });
      return response.signed_transaction;
    } catch (error) {
      this.handleError('signSolanaTransaction', error);
    }
  }

  /**
   * Sign an Ethereum transaction.
   * @returns Signed transaction, RLP hex encoded
   */
  async signEthereumTransaction(walletId: string, tx: PrivyEthereumTransactionInput): Promise<string> {
    validateWalletId(walletId);
    try {
      const response = await this.getClient()
        .wallets()
        .ethereum()
        .signTransaction(walletId, {
          params: {
            transaction: {
              to: tx.to,
              from: tx.from,
              nonce: tx.nonce,
              chain_id: tx.chainId,
              data: tx.data,
              value: tx.value,
              gas_limit: tx.gasLimit,
              gas_price: tx.gasPrice,
              max_fee_per_gas: tx.maxFeePerGas,
              max_priority_fee_per_gas: tx.maxPriorityFeePerGas,
              type: tx.type,
            },
          },
          authorization_context: this.getAuthorizationContext(),
        });
      return response.signed_transaction;
    } catch (error) {
      this.handleError('signEthereumTransaction', error);
    }
  }

  /**
   * Sign EIP-712 typed data with an Ethereum wallet.
   */
  async signEthereumTypedData(
    walletId: string,
    typedData: {
      domain: Record<string, any>;
      types: Record<string, Array<{ name: string; type: string }>>;
      primaryType: string;
      message: Record<string, any>;
    },
  ): Promise<string> {
    validateWalletId(walletId);
    try {
      const response = await this.getClient()
        .wallets()
        .ethereum()
        .signTypedData(walletId, {
          params: {
            typed_data: {
              domain: typedData.domain,
              types: typedData.types,
              primary_type: typedData.primaryType,
              message: typedData.message,
            },
          },
          authorization_context: this.getAuthorizationContext(),
        });
      return response.signature;
    } catch (error) {
      this.handleError('signEthereumTypedData', error);
    }
  }

  /**
   * Sign a message (personal_sign on Ethereum, signMessage on Solana).
   */
  async signMessage(walletId: string, message: string | Uint8Array, chainType: 'ethereum' | 'solana'): Promise<string> {
    validateWalletId(walletId);
    try {
      if (chainType === 'ethereum') {
        const response = await this.getClient()
          .wallets()
          .ethereum()
          .signMessage(walletId, { message, authorization_context: this.getAuthorizationContext() });
        return response.signature;
      }
      const response = await this.getClient()
        .wallets()
        .solana()
        .signMessage(walletId, { message, authorization_context: this.getAuthorizationContext() });
      return response.signature;
    } catch (error) {
      this.handleError('signMessage', error);
    }
  }

  /**
   * Whether an authorization (owner) key is configured. Resources created while a key is
   * configured are owned by that key, so the app secret alone cannot modify them.
   */
  public hasAuthorizationKey(): boolean {
    const { authorizationKey } = this.getCredentials();
    return !!authorizationKey;
  }

  /**
   * Derive the P-256 public key (base64 SPKI, no PEM headers — the format Privy accepts
   * as a resource owner) from the configured authorization private key (base64 PKCS8).
   * The SDK only exposes generateP256KeyPair, not public-key derivation, so use node:crypto.
   */
  private getAuthorizationPublicKey(): string {
    const { authorizationKey } = this.getCredentials();
    if (!authorizationKey) {
      throw new Error('Privy authorization key not configured. Set apiKeys.privyAuthorizationKey.');
    }
    const privateKey = createPrivateKey({
      key: Buffer.from(authorizationKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    return createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
  }

  /**
   * Create a signing policy in Privy. If an authorization key is configured, the policy is
   * owned by that key (Privy then requires its signature to modify or detach the policy).
   */
  async createPolicy(params: PrivyCreatePolicyParams): Promise<PrivyPolicyInfo> {
    try {
      const owner = this.hasAuthorizationKey() ? { public_key: this.getAuthorizationPublicKey() } : undefined;
      const policy = await this.getClient()
        .policies()
        .create({
          version: '1.0',
          name: params.name,
          chain_type: params.chainType,
          rules: params.rules as any,
          ...(owner ? { owner } : {}),
        });
      return {
        id: policy.id,
        name: policy.name,
        chainType: policy.chain_type,
        ownerId: policy.owner_id ?? null,
      };
    } catch (error) {
      this.handleError('createPolicy', error);
    }
  }

  /**
   * Attach a policy to a wallet. Includes the authorization context when an authorization
   * key is configured (required when the wallet has an owner).
   */
  async attachPolicyToWallet(walletId: string, policyId: string): Promise<void> {
    validateWalletId(walletId);
    try {
      await this.getClient()
        .wallets()
        .update(walletId, {
          policy_ids: [policyId],
          authorization_context: this.getAuthorizationContext(),
        });
    } catch (error) {
      this.handleError('attachPolicyToWallet', error);
    }
  }
}

// Singleton instance
let privyServiceInstance: PrivyService | null = null;

export function getPrivyService(): PrivyService {
  if (!privyServiceInstance) {
    privyServiceInstance = new PrivyService();
  }
  return privyServiceInstance;
}
