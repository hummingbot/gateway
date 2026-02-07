# Privy Server Wallet Integration for Hummingbot Gateway

## Overview

Add support for Privy server wallets to enable wallet-level transaction policies (allowlisted contracts, max amounts, time restrictions). Policies are managed in Privy Dashboard; Gateway just registers wallets and signs transactions.

## Files to Create

### 1. `src/wallet/privy/privy-client.ts`
```typescript
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { logger } from '../../services/logger';

interface PrivyRpcRequest {
  method: string;
  caip2: string;
  params: Record<string, unknown>;
}

interface PrivyRpcResponse {
  data: Record<string, unknown>;
}

export class PrivyClient {
  private static _instance: PrivyClient;
  private appId: string;
  private appSecret: string;

  private constructor() {
    const config = ConfigManagerV2.getInstance();
    this.appId = config.get('apiKeys.privyAppId');
    this.appSecret = config.get('apiKeys.privyAppSecret');

    if (!this.appId || !this.appSecret) {
      throw new Error('Privy credentials must be configured in conf/apiKeys.yml (privyAppId, privyAppSecret)');
    }
  }

  static getInstance(): PrivyClient {
    if (!PrivyClient._instance) {
      PrivyClient._instance = new PrivyClient();
    }
    return PrivyClient._instance;
  }

  private getAuthHeaders(): Record<string, string> {
    const basicAuth = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    return {
      'Content-Type': 'application/json',
      'privy-app-id': this.appId,
      'Authorization': `Basic ${basicAuth}`,
    };
  }

  async rpc(walletId: string, request: PrivyRpcRequest): Promise<PrivyRpcResponse> {
    const url = `https://api.privy.io/v1/wallets/${walletId}/rpc`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`Privy RPC error: ${response.status} ${body}`);
      throw new Error(`Privy RPC failed: ${response.status} - ${body}`);
    }

    return response.json();
  }

  async getWallet(walletId: string): Promise<{ address: string; chainType: string }> {
    const url = `https://api.privy.io/v1/wallets/${walletId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to get Privy wallet: ${response.status} - ${body}`);
    }

    const data = await response.json();
    return { address: data.address, chainType: data.chain_type };
  }
}
```

### 2. `src/wallet/privy/privy-evm-signer.ts`
```typescript
import { Signer, providers, utils, BytesLike } from 'ethers';
import { Deferrable } from 'ethers/lib/utils';
import { PrivyClient } from './privy-client';
import { logger } from '../../services/logger';

export class PrivyEvmSigner extends Signer {
  readonly provider: providers.Provider;
  private privyClient: PrivyClient;
  private walletId: string;
  private _address: string;
  private chainId: number;

  constructor(
    walletId: string,
    address: string,
    chainId: number,
    provider: providers.Provider
  ) {
    super();
    this.walletId = walletId;
    this._address = utils.getAddress(address);
    this.chainId = chainId;
    this.provider = provider;
    this.privyClient = PrivyClient.getInstance();
  }

  async getAddress(): Promise<string> {
    return this._address;
  }

  async signTransaction(
    transaction: Deferrable<providers.TransactionRequest>
  ): Promise<string> {
    const tx = await utils.resolveProperties(transaction);

    const resp = await this.privyClient.rpc(this.walletId, {
      method: 'eth_signTransaction',
      caip2: `eip155:${this.chainId}`,
      params: {
        transaction: {
          to: tx.to,
          value: tx.value ? utils.hexlify(tx.value) : undefined,
          data: tx.data ? utils.hexlify(tx.data) : undefined,
          gasLimit: tx.gasLimit ? utils.hexlify(tx.gasLimit) : undefined,
          maxFeePerGas: tx.maxFeePerGas ? utils.hexlify(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? utils.hexlify(tx.maxPriorityFeePerGas) : undefined,
          nonce: tx.nonce,
          chain_id: this.chainId,
        },
      },
    });

    return resp.data.signedTransaction as string;
  }

  async sendTransaction(
    transaction: Deferrable<providers.TransactionRequest>
  ): Promise<providers.TransactionResponse> {
    const tx = await utils.resolveProperties(transaction);

    const resp = await this.privyClient.rpc(this.walletId, {
      method: 'eth_sendTransaction',
      caip2: `eip155:${this.chainId}`,
      params: {
        transaction: {
          to: tx.to,
          value: tx.value ? utils.hexlify(tx.value) : undefined,
          data: tx.data ? utils.hexlify(tx.data) : undefined,
          gasLimit: tx.gasLimit ? utils.hexlify(tx.gasLimit) : undefined,
          maxFeePerGas: tx.maxFeePerGas ? utils.hexlify(tx.maxFeePerGas) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? utils.hexlify(tx.maxPriorityFeePerGas) : undefined,
          nonce: tx.nonce,
          chain_id: this.chainId,
        },
      },
    });

    const hash = resp.data.hash as string;
    logger.info(`Privy EVM tx sent: ${hash} on chain ${this.chainId}`);

    return this.provider.getTransaction(hash);
  }

  async signMessage(message: string | BytesLike): Promise<string> {
    const msgHex = typeof message === 'string'
      ? utils.hexlify(utils.toUtf8Bytes(message))
      : utils.hexlify(message);

    const resp = await this.privyClient.rpc(this.walletId, {
      method: 'personal_sign',
      caip2: `eip155:${this.chainId}`,
      params: { message: msgHex },
    });

    return resp.data.signature as string;
  }

  connect(provider: providers.Provider): PrivyEvmSigner {
    return new PrivyEvmSigner(this.walletId, this._address, this.chainId, provider);
  }
}
```

### 3. `src/wallet/privy/privy-solana-signer.ts`
```typescript
import { VersionedTransaction, Transaction } from '@solana/web3.js';
import { PrivyClient } from './privy-client';
import { logger } from '../../services/logger';

// CAIP-2 chain IDs for Solana networks
const SOLANA_CAIP2: Record<string, string> = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

export class PrivySolanaSigner {
  readonly publicKey: string;
  private walletId: string;
  private privyClient: PrivyClient;
  private caip2: string;

  constructor(walletId: string, publicKey: string, network: string = 'mainnet-beta') {
    this.walletId = walletId;
    this.publicKey = publicKey;
    this.privyClient = PrivyClient.getInstance();
    this.caip2 = SOLANA_CAIP2[network] || SOLANA_CAIP2['mainnet-beta'];
  }

  async signTransaction(
    tx: VersionedTransaction | Transaction
  ): Promise<VersionedTransaction> {
    const serialized = Buffer.from(tx.serialize()).toString('base64');

    const resp = await this.privyClient.rpc(this.walletId, {
      method: 'signTransaction',
      caip2: this.caip2,
      params: {
        transaction: serialized,
        encoding: 'base64',
      },
    });

    const signedBytes = Buffer.from(resp.data.signedTransaction as string, 'base64');
    return VersionedTransaction.deserialize(signedBytes);
  }

  async signAndSendTransaction(
    tx: VersionedTransaction | Transaction
  ): Promise<string> {
    const serialized = Buffer.from(tx.serialize()).toString('base64');

    const resp = await this.privyClient.rpc(this.walletId, {
      method: 'signAndSendTransaction',
      caip2: this.caip2,
      params: {
        transaction: serialized,
        encoding: 'base64',
      },
    });

    const hash = resp.data.hash as string;
    logger.info(`Privy Solana tx sent: ${hash}`);
    return hash;
  }
}
```

---

## Files to Modify

### 4. `src/templates/apiKeys.yml`

Add Privy credentials:
```yaml
# Privy - Server wallet provider with policy engine
# Get your credentials from https://dashboard.privy.io
privyAppId: ''
privyAppSecret: ''
```

### 5. `src/templates/namespace/apiKeys-schema.json`

Add Privy properties to the schema:
```json
"privyAppId": {
  "type": "string",
  "description": "Privy App ID for server wallets (https://dashboard.privy.io)"
},
"privyAppSecret": {
  "type": "string",
  "description": "Privy App Secret for server wallets"
}
```

### 6. `src/wallet/utils.ts`

Add these imports at the top:
```typescript
import fse from 'fs-extra';
```

Add these types and functions after existing hardware wallet functions:

```typescript
// ============ PRIVY WALLET FUNCTIONS ============

export interface PrivyWalletData {
  address: string;
  privyWalletId: string;
  addedAt: string;
}

export function getPrivyWalletPath(chain: string): string {
  const safeChain = sanitizePathComponent(chain.toLowerCase());
  return `${walletPath}/${safeChain}/privy-wallets.json`;
}

export async function getPrivyWallets(chain: string): Promise<PrivyWalletData[]> {
  const filePath = getPrivyWalletPath(chain);

  if (!(await fse.pathExists(filePath))) {
    return [];
  }

  try {
    const content = await fse.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    return data.wallets || [];
  } catch (error) {
    logger.error(`Failed to read privy wallets for ${chain}: ${error.message}`);
    return [];
  }
}

export async function savePrivyWallets(
  chain: string,
  wallets: PrivyWalletData[]
): Promise<void> {
  const filePath = getPrivyWalletPath(chain);
  const dirPath = `${walletPath}/${sanitizePathComponent(chain.toLowerCase())}`;

  await mkdirIfDoesNotExist(dirPath);
  await fse.writeFile(filePath, JSON.stringify({ wallets }, null, 2));
}

export async function getPrivyWalletAddresses(chain: string): Promise<string[]> {
  const wallets = await getPrivyWallets(chain);
  return wallets.map((w) => w.address);
}

export async function isPrivyWallet(chain: string, address: string): Promise<boolean> {
  const wallets = await getPrivyWallets(chain);
  return wallets.some((w) => w.address.toLowerCase() === address.toLowerCase());
}

export async function getPrivyWalletByAddress(
  chain: string,
  address: string
): Promise<PrivyWalletData | null> {
  const wallets = await getPrivyWallets(chain);
  return wallets.find((w) => w.address.toLowerCase() === address.toLowerCase()) || null;
}
```

### 7. `src/chains/ethereum/ethereum.ts`

Add import at the top:
```typescript
import { isPrivyWallet as checkIsPrivyWallet, getPrivyWalletByAddress } from '../../wallet/utils';
import { PrivyEvmSigner } from '../../wallet/privy/privy-evm-signer';
```

Add these methods to the `Ethereum` class (after `isHardwareWallet` method):

```typescript
  /**
   * Check if an address is a Privy wallet
   */
  public async isPrivyWallet(address: string): Promise<boolean> {
    return await checkIsPrivyWallet('ethereum', address);
  }

  /**
   * Get a Privy signer for an address
   */
  public async getPrivySigner(address: string): Promise<PrivyEvmSigner> {
    const privyWallet = await getPrivyWalletByAddress('ethereum', address);
    if (!privyWallet) {
      throw new Error(`Privy wallet not found for address: ${address}`);
    }
    return new PrivyEvmSigner(
      privyWallet.privyWalletId,
      address,
      this.chainId,
      this.provider
    );
  }
```

### 8. `src/chains/solana/solana.ts`

Add import at the top:
```typescript
import { isPrivyWallet as checkIsPrivyWallet, getPrivyWalletByAddress } from '../../wallet/utils';
import { PrivySolanaSigner } from '../../wallet/privy/privy-solana-signer';
```

Add these methods to the `Solana` class (after `isHardwareWallet` method):

```typescript
  /**
   * Check if an address is a Privy wallet
   */
  public async isPrivyWallet(address: string): Promise<boolean> {
    return await checkIsPrivyWallet('solana', address);
  }

  /**
   * Get a Privy signer for an address
   */
  public async getPrivySigner(address: string): Promise<PrivySolanaSigner> {
    const privyWallet = await getPrivyWalletByAddress('solana', address);
    if (!privyWallet) {
      throw new Error(`Privy wallet not found for address: ${address}`);
    }
    return new PrivySolanaSigner(
      privyWallet.privyWalletId,
      address,
      this.network
    );
  }
```

### 9. `src/wallet/wallet.routes.ts`

Add imports at the top:
```typescript
import {
  getPrivyWallets,
  savePrivyWallets,
  getPrivyWalletAddresses,
  PrivyWalletData
} from './utils';
import { PrivyClient } from './privy/privy-client';
```

Add these route handlers:

```typescript
// Add Privy wallet
fastify.post(
  '/wallet/add-privy',
  {
    schema: {
      description: 'Register a Privy server wallet',
      tags: ['wallet'],
      body: Type.Object({
        chain: Type.String({ description: 'Chain name (ethereum or solana)' }),
        privyWalletId: Type.String({ description: 'Privy wallet ID' }),
      }),
      response: {
        200: Type.Object({
          address: Type.String(),
          chain: Type.String(),
          type: Type.Literal('privy'),
        }),
      },
    },
  },
  async (request) => {
    const { chain, privyWalletId } = request.body as { chain: string; privyWalletId: string };

    // Validate chain
    const supportedChains = ['ethereum', 'solana'];
    if (!supportedChains.includes(chain.toLowerCase())) {
      throw fastify.httpErrors.badRequest(`Unsupported chain: ${chain}. Supported: ${supportedChains.join(', ')}`);
    }

    // Get wallet info from Privy
    const privy = PrivyClient.getInstance();
    const privyWallet = await privy.getWallet(privyWalletId);

    // Validate chain type matches
    const expectedChainType = chain.toLowerCase() === 'ethereum' ? 'ethereum' : 'solana';
    if (privyWallet.chainType !== expectedChainType) {
      throw fastify.httpErrors.badRequest(
        `Wallet chain type mismatch: expected ${expectedChainType}, got ${privyWallet.chainType}`
      );
    }

    // Check if already registered
    const existingWallets = await getPrivyWallets(chain);
    if (existingWallets.some((w) => w.address.toLowerCase() === privyWallet.address.toLowerCase())) {
      throw fastify.httpErrors.badRequest(`Privy wallet already registered: ${privyWallet.address}`);
    }

    // Add wallet
    const newWallet: PrivyWalletData = {
      address: privyWallet.address,
      privyWalletId: privyWalletId,
      addedAt: new Date().toISOString(),
    };
    await savePrivyWallets(chain, [...existingWallets, newWallet]);

    return {
      address: privyWallet.address,
      chain: chain.toLowerCase(),
      type: 'privy' as const,
    };
  }
);

// Remove Privy wallet
fastify.delete(
  '/wallet/remove-privy',
  {
    schema: {
      description: 'Unregister a Privy server wallet',
      tags: ['wallet'],
      body: Type.Object({
        chain: Type.String({ description: 'Chain name (ethereum or solana)' }),
        address: Type.String({ description: 'Wallet address to remove' }),
      }),
      response: {
        200: Type.Object({
          removed: Type.Boolean(),
          address: Type.String(),
        }),
      },
    },
  },
  async (request) => {
    const { chain, address } = request.body as { chain: string; address: string };

    const existingWallets = await getPrivyWallets(chain);
    const filteredWallets = existingWallets.filter(
      (w) => w.address.toLowerCase() !== address.toLowerCase()
    );

    if (filteredWallets.length === existingWallets.length) {
      throw fastify.httpErrors.notFound(`Privy wallet not found: ${address}`);
    }

    await savePrivyWallets(chain, filteredWallets);

    return { removed: true, address };
  }
);
```

Update the existing `GET /wallet` handler to include Privy wallets in the response. Find where `hardwareWalletAddresses` is added to the response and add:
```typescript
const privyAddresses = await getPrivyWalletAddresses(chain);
// Add to response object:
privyWalletAddresses: privyAddresses.length > 0 ? privyAddresses : undefined,
```

---

## Connector Updates

### Jupiter (example for Solana connectors)

In `src/connectors/jupiter/router-routes/executeQuote.ts`, update the wallet handling:

**Find this pattern:**
```typescript
const isHardwareWallet = await solana.isHardwareWallet(walletAddress);
```

**Add Privy check after it:**
```typescript
const isHardwareWallet = await solana.isHardwareWallet(walletAddress);
const isPrivyWallet = await solana.isPrivyWallet(walletAddress);
```

**Update the branching logic:**
```typescript
if (isHardwareWallet) {
  // existing hardware wallet code...
} else if (isPrivyWallet) {
  // Privy wallet: build unsigned transaction, sign with Privy
  transaction = await jupiter.buildSwapTransactionForHardwareWallet(walletAddress, quote, maxLamports, priorityLevel);
  const privySigner = await solana.getPrivySigner(walletAddress);
  transaction = await privySigner.signTransaction(transaction);
} else {
  // existing local wallet code...
}
```

Apply the same pattern to: Raydium, Meteora connectors.

### EVM Connectors (Uniswap, 0x)

For EVM connectors, add similar branching. In `executeQuote.ts` or equivalent:

```typescript
const isHardwareWallet = await ethereum.isHardwareWallet(walletAddress);
const isPrivyWallet = await ethereum.isPrivyWallet(walletAddress);

let wallet: Wallet | PrivyEvmSigner;
if (isPrivyWallet) {
  wallet = await ethereum.getPrivySigner(walletAddress);
} else if (isHardwareWallet) {
  // existing hardware wallet handling...
} else {
  wallet = await ethereum.getWallet(walletAddress);
}
```

---

## Implementation Checklist

1. [ ] Add Privy credentials to `src/templates/apiKeys.yml`
2. [ ] Add Privy properties to `src/templates/namespace/apiKeys-schema.json`
3. [ ] Create `src/wallet/privy/` directory
4. [ ] Create `src/wallet/privy/privy-client.ts`
5. [ ] Create `src/wallet/privy/privy-evm-signer.ts`
6. [ ] Create `src/wallet/privy/privy-solana-signer.ts`
7. [ ] Add Privy wallet functions to `src/wallet/utils.ts`
8. [ ] Add `isPrivyWallet()` and `getPrivySigner()` to `src/chains/ethereum/ethereum.ts`
9. [ ] Add `isPrivyWallet()` and `getPrivySigner()` to `src/chains/solana/solana.ts`
10. [ ] Add `/wallet/add-privy` and `/wallet/remove-privy` routes to `src/wallet/wallet.routes.ts`
11. [ ] Update Jupiter connector with Privy support
12. [ ] Update Raydium connector with Privy support
13. [ ] Update Meteora connector with Privy support
14. [ ] Update Uniswap connector with Privy support (if needed)
15. [ ] Run `pnpm build` to verify no TypeScript errors
16. [ ] Run `pnpm test` to verify existing tests pass
17. [ ] Create unit tests for Privy client and signers

---

## Policy Configuration (Privy Dashboard)

Policies are managed entirely in Privy Dashboard, not in Gateway. Example workflow:

1. Go to Privy Dashboard → Policies
2. Create a policy with rules (allowed contracts, max amounts, etc.)
3. Create a server wallet and attach the policy
4. Copy the wallet ID
5. In Gateway: `POST /wallet/add-privy` with the wallet ID

Example Ethereum policy for DEX trading:
```json
{
  "version": "1.0",
  "name": "Hummingbot DEX Trading",
  "chain_type": "ethereum",
  "rules": [
    {
      "name": "Allow Uniswap V3 Router",
      "method": "eth_sendTransaction",
      "conditions": [
        { "field_source": "ethereum_transaction", "field": "to", "operator": "eq", "value": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" }
      ],
      "action": "ALLOW"
    },
    {
      "name": "Max 1 ETH per transaction",
      "method": "eth_sendTransaction",
      "conditions": [
        { "field_source": "ethereum_transaction", "field": "value", "operator": "lte", "value": "0xDE0B6B3A7640000" }
      ],
      "action": "ALLOW"
    },
    {
      "name": "Deny everything else",
      "method": "*",
      "conditions": [],
      "action": "DENY"
    }
  ]
}
```

Example Solana policy:
```json
{
  "version": "1.0",
  "name": "Hummingbot Solana Trading",
  "chain_type": "solana",
  "rules": [
    {
      "name": "Allow Jupiter",
      "method": "signAndSendTransaction",
      "conditions": [
        { "field_source": "solana_program_instruction", "field": "programId", "operator": "eq", "value": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" }
      ],
      "action": "ALLOW"
    },
    {
      "name": "Max 10 SOL per transaction",
      "method": "signAndSendTransaction",
      "conditions": [
        { "field_source": "solana_system_instruction", "field": "lamports", "operator": "lte", "value": "10000000000" }
      ],
      "action": "ALLOW"
    }
  ]
}
```
