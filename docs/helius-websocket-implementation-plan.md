# Helius WebSocket Implementation Plan

## Executive Summary

This document outlines a phased approach to implement comprehensive WebSocket support for the Helius RPC provider in Gateway. While basic transaction confirmation via `signatureSubscribe` is already implemented, this plan extends WebSocket functionality to support real-time monitoring of wallet balances, CLMM/AMM pools, and CLMM positions.

## Current Implementation Status

### What We Have ✅

**File**: `src/chains/solana/helius-service.ts`

The `HeliusService` class currently implements:

1. **Transaction Monitoring** (lines 225-263)
   - Method: `signatureSubscribe`
   - Use case: Real-time transaction confirmation after `sendAndConfirmTransaction`
   - Status: ✅ **Fully Implemented**
   - Triggered by: `useHeliusWebSocketRPC: true` in `conf/rpc/helius.yml`

2. **Connection Management** (lines 128-182)
   - WebSocket connection/reconnection with exponential backoff
   - Automatic cleanup on disconnection
   - Subscription lifecycle management

3. **Integration Points**
   - `src/chains/solana/solana.ts:1029-1038` - `confirmTransaction()` method
   - `src/chains/solana/solana.ts:1540-1549` - Used in transaction sending

### What We Need 🎯

Real-time monitoring for:
1. **Wallet balances** - Track token account changes
2. **AMM/CLMM pools** - Monitor liquidity, price, and fee changes
3. **CLMM positions** - Track position value, fees earned, and range status

## Architecture Design

### 1. Enhanced HeliusService Structure

```typescript
// src/chains/solana/helius-service.ts

interface AccountSubscriptionCallback {
  (accountInfo: any): void | Promise<void>;
}

interface LogsSubscriptionCallback {
  (logs: any): void | Promise<void>;
}

interface ProgramSubscriptionCallback {
  (accountInfo: any): void | Promise<void>;
}

export class HeliusService {
  // Existing
  private subscriptions: Map<number, WebSocketSubscription>;

  // New subscription maps
  private accountSubscriptions: Map<number, {
    address: string;
    callback: AccountSubscriptionCallback;
    encoding?: string;
    commitment?: string;
  }>;

  private logsSubscriptions: Map<number, {
    filter: 'all' | 'allWithVotes' | { mentions: string[] };
    callback: LogsSubscriptionCallback;
    commitment?: string;
  }>;

  private programSubscriptions: Map<number, {
    programId: string;
    callback: ProgramSubscriptionCallback;
    encoding?: string;
    commitment?: string;
    filters?: any[];
  }>;
}
```

### 2. Subscription Methods

#### 2.1 Account Subscription (Wallets & Token Accounts)

```typescript
/**
 * Subscribe to account changes (wallet balances, token accounts, etc.)
 * @param address Account public key to monitor
 * @param callback Function called when account changes
 * @param options Encoding and commitment options
 * @returns Subscription ID for unsubscribing
 */
public async subscribeToAccount(
  address: string,
  callback: AccountSubscriptionCallback,
  options?: {
    encoding?: 'base58' | 'base64' | 'jsonParsed';
    commitment?: 'processed' | 'confirmed' | 'finalized';
  }
): Promise<number>
```

**Use Case**: Monitor wallet SOL balance and SPL token account balances in real-time.

**Example Notification**:
```json
{
  "jsonrpc": "2.0",
  "method": "accountNotification",
  "params": {
    "result": {
      "context": { "slot": 123456789 },
      "value": {
        "lamports": 1000000000,
        "owner": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "data": ["...", "base64"],
        "executable": false,
        "rentEpoch": 361
      }
    },
    "subscription": 123
  }
}
```

#### 2.2 Program Subscription (Pool Monitoring)

```typescript
/**
 * Subscribe to all accounts owned by a program (e.g., all Meteora pools)
 * @param programId Program public key to monitor
 * @param callback Function called when any program-owned account changes
 * @param options Encoding, commitment, and filter options
 * @returns Subscription ID for unsubscribing
 */
public async subscribeToProgram(
  programId: string,
  callback: ProgramSubscriptionCallback,
  options?: {
    encoding?: 'base58' | 'base64' | 'jsonParsed';
    commitment?: 'processed' | 'confirmed' | 'finalized';
    filters?: Array<{
      memcmp?: { offset: number; bytes: string };
      dataSize?: number;
    }>;
  }
): Promise<number>
```

**Use Case**: Monitor all Meteora DLMM pools or specific pools using memcmp filters.

#### 2.3 Logs Subscription (Transaction Tracking)

```typescript
/**
 * Subscribe to transaction logs mentioning specific accounts/programs
 * @param filter Filter for logs ('all', 'allWithVotes', or specific addresses)
 * @param callback Function called when matching logs are emitted
 * @param options Commitment level
 * @returns Subscription ID for unsubscribing
 */
public async subscribeToLogs(
  filter: 'all' | 'allWithVotes' | { mentions: string[] },
  callback: LogsSubscriptionCallback,
  options?: {
    commitment?: 'processed' | 'confirmed' | 'finalized';
  }
): Promise<number>
```

**Use Case**: Track all transactions involving a specific pool or position address.

### 3. Message Handling Enhancement

Update `handleWebSocketMessage()` to route different notification types:

```typescript
private handleWebSocketMessage(message: WebSocketMessage): void {
  // Existing: signatureNotification
  if (message.method === 'signatureNotification') {
    // ... existing code
  }

  // New: accountNotification
  else if (message.method === 'accountNotification') {
    this.handleAccountNotification(message.params);
  }

  // New: programNotification
  else if (message.method === 'programNotification') {
    this.handleProgramNotification(message.params);
  }

  // New: logsNotification
  else if (message.method === 'logsNotification') {
    this.handleLogsNotification(message.params);
  }

  // ... rest of existing code
}
```

## Implementation Phases

### Phase 1: Transaction Confirmation (✅ Completed)

**Status**: Already implemented and working

**Features**:
- `signatureSubscribe` for transaction monitoring
- Used automatically when `useHeliusWebSocketRPC: true`
- Fallback to polling when WebSocket unavailable

**Files Modified**: None (already complete)

---

### Phase 2: Real-time Wallet Balance Monitoring 🎯 **Recommended Next**

**Goal**: Enable real-time tracking of wallet SOL and SPL token balances

**Implementation Tasks**:

1. **Add Account Subscription Methods** (`helius-service.ts`)
   ```typescript
   // Lines ~470+ (after existing methods)

   public async subscribeToAccount(
     address: string,
     callback: AccountSubscriptionCallback,
     options?: { encoding?: string; commitment?: string }
   ): Promise<number>

   public async unsubscribeFromAccount(subscriptionId: number): Promise<void>

   private handleAccountNotification(params: any): void
   ```

2. **Expose to Solana Class** (`solana.ts`)
   ```typescript
   // Lines ~2100+ (new public methods)

   /**
    * Subscribe to wallet balance changes
    * @param walletAddress Wallet public key
    * @param callback Function called when balance changes
    * @returns Subscription ID
    */
   public async subscribeToWalletBalance(
     walletAddress: string,
     callback: (balances: { sol: number; tokens: TokenBalance[] }) => void
   ): Promise<number> {
     if (!this.heliusService.isWebSocketConnected()) {
       throw new Error('WebSocket not connected');
     }

     return await this.heliusService.subscribeToAccount(
       walletAddress,
       async (accountInfo) => {
         // Parse account info and extract balances
         const balances = await this.parseWalletBalances(accountInfo, walletAddress);
         callback(balances);
       },
       { encoding: 'jsonParsed', commitment: 'confirmed' }
     );
   }
   ```

3. **Add Balances Route** (`src/chains/solana/routes/balances.ts`)
   ```typescript
   // Add WebSocket subscription endpoint

   fastify.post('/subscribe-balances', {
     schema: {
       description: 'Subscribe to real-time wallet balance updates via WebSocket',
       tags: ['/chains/solana'],
       // ... schema
     }
   }, async (request, reply) => {
     // Return subscription ID
     // Client would need separate WebSocket connection to receive updates
     // OR implement server-sent events (SSE) endpoint
   });
   ```

**Use Cases**:
- Monitor trading wallet balances during strategy execution
- Alert when wallet balance drops below threshold
- Real-time P&L tracking

**Estimated Effort**: 2-3 days

---

### Phase 3: Real-time Pool Monitoring 🎯

**Goal**: Track AMM/CLMM pool state changes in real-time

**Implementation Tasks**:

1. **Add Pool Subscription Methods** (`helius-service.ts`)
   ```typescript
   // Use accountSubscribe for specific pool addresses
   public async subscribeToPool(
     poolAddress: string,
     callback: (poolData: any) => void,
     options?: { commitment?: string }
   ): Promise<number>
   ```

2. **Connector-Specific Integration**

   **Meteora** (`src/connectors/meteora/meteora.ts`):
   ```typescript
   // Lines ~400+ (new methods)

   /**
    * Subscribe to DLMM pool updates
    * @param poolAddress Pool public key
    * @param callback Function called when pool state changes
    * @returns Subscription ID
    */
   public async subscribeToPoolUpdates(
     poolAddress: string,
     callback: (poolInfo: {
       activeId: number;
       binStep: number;
       reserveX: number;
       reserveY: number;
       feeBps: number;
       protocolFeeBps: number;
     }) => void
   ): Promise<number> {
     const solana = await Solana.getInstance(this.network);

     return await solana.subscribeToAccount(
       poolAddress,
       async (accountInfo) => {
         // Parse DLMM pool account data
         const poolInfo = await this.parseDlmmPoolAccount(accountInfo);
         callback(poolInfo);
       }
     );
   }
   ```

   **Raydium** (`src/connectors/raydium/raydium.ts`):
   ```typescript
   // Similar implementation for CLMM and AMM pools

   public async subscribeToClmmPoolUpdates(poolAddress: string, callback): Promise<number>
   public async subscribeToAmmPoolUpdates(poolAddress: string, callback): Promise<number>
   ```

   **Uniswap** (N/A - Ethereum doesn't use WebSocket subscriptions the same way)

3. **Add Pool Info Route with Streaming** (`src/connectors/meteora/clmm-routes/poolInfo.ts`)
   ```typescript
   // Add streaming endpoint

   fastify.get('/pool-info-stream/:poolAddress', {
     schema: {
       description: 'Stream real-time pool info updates',
       // ... schema
     }
   }, async (request, reply) => {
     // Use Server-Sent Events (SSE) to stream updates
     reply.raw.setHeader('Content-Type', 'text/event-stream');
     reply.raw.setHeader('Cache-Control', 'no-cache');
     reply.raw.setHeader('Connection', 'keep-alive');

     const subscriptionId = await meteora.subscribeToPoolUpdates(
       poolAddress,
       (poolInfo) => {
         reply.raw.write(`data: ${JSON.stringify(poolInfo)}\n\n`);
       }
     );

     // Cleanup on disconnect
     request.raw.on('close', () => {
       meteora.unsubscribeFromPool(subscriptionId);
     });
   });
   ```

**Use Cases**:
- Monitor pool liquidity changes
- Track active bin/price changes in DLMM pools
- Alert on large liquidity additions/removals
- Auto-rebalancing strategies based on pool state

**Estimated Effort**: 3-4 days (per connector)

---

### Phase 4: Real-time Position Monitoring 🎯

**Goal**: Track CLMM position state changes in real-time

**Implementation Tasks**:

1. **Add Position Subscription Methods** (`helius-service.ts`)
   ```typescript
   // Use accountSubscribe for specific position addresses
   public async subscribeToPosition(
     positionAddress: string,
     callback: (positionData: any) => void,
     options?: { commitment?: string }
   ): Promise<number>
   ```

2. **Connector Integration**

   **Meteora** (`src/connectors/meteora/meteora.ts`):
   ```typescript
   /**
    * Subscribe to DLMM position updates
    * @param positionAddress Position public key
    * @param callback Function called when position changes
    * @returns Subscription ID
    */
   public async subscribeToPositionUpdates(
     positionAddress: string,
     callback: (positionInfo: {
       liquidity: number;
       feesEarnedX: number;
       feesEarnedY: number;
       lowerBinId: number;
       upperBinId: number;
       inRange: boolean;
     }) => void
   ): Promise<number> {
     const solana = await Solana.getInstance(this.network);

     return await solana.subscribeToAccount(
       positionAddress,
       async (accountInfo) => {
         // Parse DLMM position account data
         const positionInfo = await this.parseDlmmPositionAccount(accountInfo);
         callback(positionInfo);
       }
     );
   }
   ```

   **Raydium** (`src/connectors/raydium/raydium.ts`):
   ```typescript
   public async subscribeToClmmPositionUpdates(positionAddress: string, callback): Promise<number>
   ```

3. **Add Position Info Streaming Route** (`src/connectors/meteora/clmm-routes/positionInfo.ts`)
   ```typescript
   // Add streaming endpoint

   fastify.get('/position-info-stream/:positionAddress', {
     schema: {
       description: 'Stream real-time position info updates',
       // ... schema
     }
   }, async (request, reply) => {
     // Use Server-Sent Events (SSE)
     reply.raw.setHeader('Content-Type', 'text/event-stream');

     const subscriptionId = await meteora.subscribeToPositionUpdates(
       positionAddress,
       (positionInfo) => {
         reply.raw.write(`data: ${JSON.stringify(positionInfo)}\n\n`);
       }
     );

     // Cleanup on disconnect
     request.raw.on('close', () => {
       meteora.unsubscribeFromPosition(subscriptionId);
     });
   });
   ```

**Use Cases**:
- Monitor position fees earned in real-time
- Alert when position goes out of range
- Track liquidity changes after add/remove operations
- Auto-close positions when profit threshold reached

**Estimated Effort**: 2-3 days (per connector)

---

### Phase 5: Program-Level Monitoring (Advanced) 🔮

**Goal**: Monitor all positions owned by a wallet or all pools in a program

**Implementation Tasks**:

1. **Add Program Subscription Methods** (`helius-service.ts`)
   ```typescript
   public async subscribeToProgram(
     programId: string,
     callback: ProgramSubscriptionCallback,
     options?: {
       encoding?: string;
       commitment?: string;
       filters?: Array<{
         memcmp?: { offset: number; bytes: string };
         dataSize?: number;
       }>;
     }
   ): Promise<number>
   ```

2. **Wallet Positions Monitoring** (`src/connectors/meteora/meteora.ts`)
   ```typescript
   /**
    * Subscribe to all positions owned by a wallet
    * @param walletAddress Wallet public key
    * @param callback Function called when any position changes
    * @returns Subscription ID
    */
   public async subscribeToWalletPositions(
     walletAddress: string,
     callback: (positions: PositionInfo[]) => void
   ): Promise<number> {
     const solana = await Solana.getInstance(this.network);

     // Filter for positions owned by this wallet
     return await solana.subscribeToProgram(
       METEORA_DLMM_PROGRAM_ID,
       async (accountInfo) => {
         // Check if position owner matches wallet
         if (this.isPositionOwnedByWallet(accountInfo, walletAddress)) {
           const positions = await this.getAllWalletPositions(walletAddress);
           callback(positions);
         }
       },
       {
         filters: [
           {
             memcmp: {
               offset: 40, // Owner offset in position account
               bytes: walletAddress,
             },
           },
         ],
       }
     );
   }
   ```

**Use Cases**:
- Monitor all positions in a portfolio
- Track all pools in a DEX protocol
- Alert on any position state changes

**Estimated Effort**: 3-4 days

---

## Configuration Changes

### 1. Update Helius Config Template

**File**: `src/templates/rpc/helius.yml`

```yaml
# Helius RPC Provider Configuration

# Required: Your Helius API key
apiKey: 'YOUR_HELIUS_API_KEY_HERE'

# Use Helius WebSocket for real-time monitoring
# Phase 1: Transaction confirmation ✅
# Phase 2+: Wallet, pool, and position monitoring 🎯
useWebSocketRPC: false

# Use Helius Sender endpoint for ultra-fast transaction delivery
useSender: false

# Regional endpoint for Helius Sender
regionCode: 'slc'

# Jito tip amount in SOL for bundle inclusion
jitoTipSOL: 0.001

# WebSocket subscription options (Phase 2+)
websocket:
  # Commitment level for subscriptions
  # Options: processed (~400ms), confirmed (2-3s), finalized (15-30s)
  defaultCommitment: 'confirmed'

  # Encoding for account data
  # Options: base58, base64, jsonParsed (recommended for ease of parsing)
  defaultEncoding: 'jsonParsed'

  # Maximum number of concurrent subscriptions
  # Too many subscriptions can cause instability
  maxSubscriptions: 100

  # Heartbeat interval (seconds) for connection health check
  heartbeatInterval: 20
```

### 2. Update Solana Network Config

**File**: `src/chains/solana/solana.config.ts`

```typescript
export interface SolanaNetworkConfig {
  // ... existing fields

  // Helius WebSocket options
  useHeliusWebSocketRPC?: boolean;
  heliusWebSocketOptions?: {
    defaultCommitment?: 'processed' | 'confirmed' | 'finalized';
    defaultEncoding?: 'base58' | 'base64' | 'jsonParsed';
    maxSubscriptions?: number;
    heartbeatInterval?: number;
  };
}
```

## Technical Considerations

### 1. Subscription Lifecycle Management

**Challenge**: Long-lived subscriptions need careful management to avoid memory leaks and stale connections.

**Solution**:
```typescript
export class HeliusService {
  // Track subscription metadata
  private accountSubscriptions: Map<number, {
    address: string;
    callback: AccountSubscriptionCallback;
    createdAt: number;
    lastNotification?: number;
  }>;

  /**
   * Cleanup stale subscriptions (no notifications for 5+ minutes)
   */
  private startSubscriptionCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, sub] of this.accountSubscriptions) {
        const lastActivity = sub.lastNotification || sub.createdAt;
        if (now - lastActivity > 300000) { // 5 minutes
          logger.warn(`Cleaning up stale subscription ${id} for ${sub.address}`);
          this.unsubscribeFromAccount(id);
        }
      }
    }, 60000); // Check every minute
  }
}
```

### 2. Rate Limiting & Subscription Limits

**Challenge**: Helius may have limits on concurrent subscriptions per connection.

**Solution**:
```typescript
export class HeliusService {
  private readonly MAX_SUBSCRIPTIONS = 100;

  private getTotalSubscriptions(): number {
    return (
      this.subscriptions.size +
      this.accountSubscriptions.size +
      this.logsSubscriptions.size +
      this.programSubscriptions.size
    );
  }

  public async subscribeToAccount(...): Promise<number> {
    if (this.getTotalSubscriptions() >= this.MAX_SUBSCRIPTIONS) {
      throw new Error(`Maximum subscription limit (${this.MAX_SUBSCRIPTIONS}) reached`);
    }
    // ... rest of implementation
  }
}
```

### 3. Reconnection & Subscription Restoration

**Challenge**: When WebSocket reconnects, all subscriptions are lost and must be re-established.

**Solution**:
```typescript
export class HeliusService {
  private handleWebSocketDisconnection(): void {
    // ... existing rejection logic

    // Store subscription details for restoration
    const subsToRestore = {
      accounts: Array.from(this.accountSubscriptions.values()),
      programs: Array.from(this.programSubscriptions.values()),
      logs: Array.from(this.logsSubscriptions.values()),
    };

    // Attempt reconnection
    if (this.shouldUseWebSocket() && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

      this.reconnectTimeout = setTimeout(async () => {
        try {
          await this.connectWebSocket();
          // Restore subscriptions after successful reconnection
          await this.restoreSubscriptions(subsToRestore);
        } catch (error) {
          logger.error(`WebSocket reconnection failed: ${error.message}`);
        }
      }, backoffMs);
    }
  }

  private async restoreSubscriptions(subs: any): Promise<void> {
    logger.info('Restoring subscriptions after reconnection...');

    for (const sub of subs.accounts) {
      try {
        await this.subscribeToAccount(sub.address, sub.callback, sub.options);
      } catch (error) {
        logger.error(`Failed to restore account subscription: ${error.message}`);
      }
    }

    // ... similar for programs and logs
  }
}
```

### 4. Heartbeat Monitoring

**Challenge**: WebSocket connection may appear open but be unresponsive.

**Solution**:
```typescript
export class HeliusService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPongReceived: number = Date.now();

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      // Check if last pong was received within acceptable timeframe
      const timeSinceLastPong = Date.now() - this.lastPongReceived;
      if (timeSinceLastPong > 60000) { // 1 minute
        logger.warn('WebSocket heartbeat timeout, reconnecting...');
        this.ws.close();
        return;
      }

      // Send ping
      this.ws.ping();
    }, 20000); // Every 20 seconds
  }

  private async connectWebSocket(): Promise<void> {
    // ... existing connection logic

    this.ws.on('pong', () => {
      this.lastPongReceived = Date.now();
    });

    this.ws.on('open', () => {
      // ... existing logic
      this.startHeartbeat();
    });
  }
}
```

### 5. Error Handling & Fallback

**Challenge**: WebSocket failures should not break API functionality.

**Solution**:
- Always provide polling-based fallback methods
- Gracefully degrade when WebSocket unavailable
- Clear error messages indicating WebSocket status

```typescript
// Example in Solana class
public async getBalances(address: string): Promise<Balances> {
  // Standard polling method - always available
  return await this.fetchBalancesViaRPC(address);
}

public async subscribeToBalances(
  address: string,
  callback: (balances: Balances) => void
): Promise<number> {
  if (!this.heliusService.isWebSocketConnected()) {
    throw new Error(
      'WebSocket monitoring not available. Ensure useHeliusWebSocketRPC is enabled in conf/rpc/helius.yml'
    );
  }

  return await this.heliusService.subscribeToAccount(address, callback);
}
```

## Testing Strategy

### 1. Unit Tests

**File**: `test/chains/solana/helius-service.test.ts`

```typescript
describe('HeliusService WebSocket Subscriptions', () => {
  describe('accountSubscribe', () => {
    it('should subscribe to account changes', async () => {
      // Mock WebSocket connection
      // Test subscription creation
      // Verify callback is called on notification
    });

    it('should handle subscription errors', async () => {
      // Test error handling
    });

    it('should restore subscriptions after reconnection', async () => {
      // Simulate disconnection
      // Verify subscriptions are restored
    });
  });

  describe('programSubscribe', () => {
    it('should subscribe to program account changes with filters', async () => {
      // Test memcmp filters
    });
  });

  describe('subscription limits', () => {
    it('should enforce maximum subscription limit', async () => {
      // Create MAX_SUBSCRIPTIONS subscriptions
      // Verify next subscription throws error
    });
  });
});
```

### 2. Integration Tests

**File**: `test/chains/solana/helius-websocket-integration.test.ts`

```typescript
describe('Helius WebSocket Integration', () => {
  it('should monitor wallet balance changes in real-time', async () => {
    // Subscribe to wallet
    // Send transaction
    // Verify callback receives balance update
  });

  it('should monitor pool state changes', async () => {
    // Subscribe to Meteora pool
    // Execute swap
    // Verify callback receives pool update
  });

  it('should monitor position changes', async () => {
    // Subscribe to position
    // Add liquidity
    // Verify callback receives position update
  });
});
```

### 3. Manual Testing Script

**File**: `scripts/test-helius-websocket-live.ts`

```typescript
/**
 * Live WebSocket subscription testing script
 * Tests real-time monitoring of wallet, pool, and position updates
 */
import { Solana } from '../src/chains/solana/solana';

async function main() {
  const solana = await Solana.getInstance('mainnet-beta');

  // Test 1: Monitor wallet balance
  console.log('Test 1: Monitoring wallet balance...');
  const walletSub = await solana.subscribeToWalletBalance(
    'YOUR_WALLET_ADDRESS',
    (balances) => {
      console.log('Balance update:', balances);
    }
  );

  // Test 2: Monitor Meteora pool
  console.log('Test 2: Monitoring Meteora pool...');
  const poolSub = await solana.subscribeToAccount(
    'POOL_ADDRESS',
    (poolInfo) => {
      console.log('Pool update:', poolInfo);
    }
  );

  // Test 3: Monitor CLMM position
  console.log('Test 3: Monitoring CLMM position...');
  const positionSub = await solana.subscribeToAccount(
    'POSITION_ADDRESS',
    (positionInfo) => {
      console.log('Position update:', positionInfo);
    }
  );

  // Keep running for 5 minutes
  await new Promise((resolve) => setTimeout(resolve, 300000));

  // Cleanup
  await solana.unsubscribeFromAccount(walletSub);
  await solana.unsubscribeFromAccount(poolSub);
  await solana.unsubscribeFromAccount(positionSub);
}

main().catch(console.error);
```

## Performance & Best Practices

### 1. Commitment Level Selection

| Use Case | Recommended Commitment | Latency | Risk |
|----------|----------------------|---------|------|
| Transaction confirmation | `confirmed` | 2-3s | Low - balanced |
| Trading signals | `processed` | ~400ms | Medium - may reorder |
| Financial operations | `finalized` | 15-30s | Very low - final |
| UI updates | `confirmed` | 2-3s | Low - balanced |

### 2. Encoding Selection

| Encoding | Use Case | Pros | Cons |
|----------|----------|------|------|
| `jsonParsed` | Token accounts, standard accounts | Easy to parse, human-readable | Larger payload |
| `base64` | Program-specific accounts | Compact, efficient | Requires manual parsing |
| `base58` | Legacy compatibility | Compatible with older code | Less efficient |

**Recommendation**: Use `jsonParsed` for Phase 2 (wallets), use `base64` with custom parsers for Phases 3-5 (pools, positions).

### 3. Subscription Patterns

**Good Pattern** ✅:
```typescript
// Subscribe once, long-lived subscription
const subId = await solana.subscribeToWalletBalance(address, callback);

// ... use for extended period

// Cleanup when done
await solana.unsubscribeFromAccount(subId);
```

**Bad Pattern** ❌:
```typescript
// DON'T: Subscribe and immediately unsubscribe
const subId = await solana.subscribeToWalletBalance(address, callback);
await solana.unsubscribeFromAccount(subId);

// DON'T: Create subscription per request
app.get('/balance', async (req, res) => {
  const subId = await solana.subscribeToWalletBalance(address, callback);
  // This creates a new subscription for EVERY request!
});
```

### 4. Subscription Lifecycle

```typescript
// Strategy pattern: Manage subscriptions at strategy level
export class LiquidityStrategy {
  private subscriptions: number[] = [];

  async start() {
    // Subscribe to relevant accounts
    const walletSub = await this.solana.subscribeToWalletBalance(...);
    const poolSub = await this.meteora.subscribeToPoolUpdates(...);

    this.subscriptions.push(walletSub, poolSub);
  }

  async stop() {
    // Cleanup all subscriptions
    for (const subId of this.subscriptions) {
      await this.solana.unsubscribeFromAccount(subId);
    }
    this.subscriptions = [];
  }
}
```

## Migration Path

### For Users

**Step 1**: Update `conf/rpc/helius.yml`
```yaml
# Enable WebSocket features
useWebSocketRPC: true

# Configure WebSocket options
websocket:
  defaultCommitment: 'confirmed'
  defaultEncoding: 'jsonParsed'
  maxSubscriptions: 100
```

**Step 2**: Restart Gateway
```bash
pnpm build
pnpm start --passphrase=<PASSPHRASE> --dev
```

**Step 3**: Verify WebSocket Connection
```bash
# Check logs for:
# "✅ Helius WebSocket monitor successfully initialized"
```

**Step 4**: Use New Subscription Endpoints (Phase 2+)
```bash
# Example: Subscribe to wallet balance updates
curl -X POST http://localhost:15888/chains/solana/subscribe-balances \
  -H "Content-Type: application/json" \
  -d '{"address": "YOUR_WALLET_ADDRESS"}'
```

### For Developers

**Backward Compatibility**: All existing endpoints remain unchanged. WebSocket features are additive.

**Opt-in**: WebSocket subscriptions require explicit API calls to subscribe. Existing polling methods continue to work.

**Graceful Degradation**: If WebSocket unavailable, subscription endpoints return clear error messages directing users to enable WebSocket in config.

## Documentation Updates

### 1. Update Main README

**File**: `README.md`

Add section:
```markdown
### Real-time Monitoring with WebSocket

Gateway supports real-time monitoring of wallet balances, DEX pools, and CLMM positions via Helius WebSocket RPC.

**Enable WebSocket**:
1. Set your Helius API key in `conf/rpc/helius.yml`
2. Set `useWebSocketRPC: true`
3. Restart Gateway

**Features**:
- ✅ Real-time transaction confirmation (automatic)
- 🎯 Real-time wallet balance updates
- 🎯 Real-time pool state monitoring
- 🎯 Real-time position tracking

See [Helius WebSocket Implementation Plan](docs/helius-websocket-implementation-plan.md) for details.
```

### 2. Create User Guide

**File**: `docs/helius-websocket-user-guide.md`

Detailed guide covering:
- Setup instructions
- Subscription endpoint documentation
- Example use cases
- Troubleshooting

### 3. Update API Documentation

**File**: `src/chains/solana/routes/balances.ts`, etc.

Add Swagger documentation for new subscription endpoints.

## Cost Considerations

### Helius Pricing Implications

**Free Tier**:
- Transaction confirmation: No additional cost
- Account subscriptions: Check Helius limits

**Paid Tiers**:
- Higher subscription limits
- Better performance

**Recommendation**: Test with free tier first, upgrade if subscription limits are hit.

### Resource Usage

**WebSocket Connection**:
- Single persistent connection per Gateway instance
- Minimal bandwidth for infrequent updates
- Significant bandwidth reduction vs. polling (1 persistent connection vs. hundreds of HTTP requests)

**Memory Usage**:
- Each subscription: ~1-2KB metadata
- 100 subscriptions: ~100-200KB additional memory
- Negligible impact on Gateway performance

## Success Metrics

### Phase 1 (Completed) ✅
- [x] Transaction confirmation via WebSocket
- [x] Automatic fallback to polling
- [x] < 3s transaction confirmation time

### Phase 2 Targets 🎯
- [ ] Wallet balance updates within 2-3s of transaction confirmation
- [ ] Support 10+ concurrent wallet subscriptions
- [ ] < 5% error rate on subscription restoration after reconnection

### Phase 3 Targets 🎯
- [ ] Pool state updates within 2-3s of on-chain changes
- [ ] Support 20+ concurrent pool subscriptions
- [ ] Accurate parsing of all pool types (AMM, CLMM)

### Phase 4 Targets 🎯
- [ ] Position updates within 2-3s of state changes
- [ ] Support 50+ concurrent position subscriptions
- [ ] Accurate fee tracking in real-time

## Timeline Estimates

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| **Phase 1** | Transaction confirmation | ✅ Complete | None |
| **Phase 2** | Wallet balance monitoring | 2-3 days | Phase 1 |
| **Phase 3a** | Meteora pool monitoring | 3-4 days | Phase 2 |
| **Phase 3b** | Raydium pool monitoring | 3-4 days | Phase 3a |
| **Phase 4a** | Meteora position monitoring | 2-3 days | Phase 3a |
| **Phase 4b** | Raydium position monitoring | 2-3 days | Phase 3b |
| **Phase 5** | Program-level monitoring | 3-4 days | Phase 4 |

**Total Estimated Effort**: 15-22 days (3-4 weeks) for full implementation

## Conclusion

This implementation plan provides a comprehensive roadmap for extending Helius WebSocket support in Gateway. The phased approach allows for incremental development and testing, with each phase building on the previous one.

**Key Benefits**:
- ✅ **Reduced Latency**: Real-time updates (2-3s) vs. polling (5-10s+)
- ✅ **Lower Costs**: Single WebSocket connection vs. hundreds of HTTP requests
- ✅ **Better UX**: Immediate feedback for users
- ✅ **Scalability**: Support for monitoring multiple accounts simultaneously

**Next Steps**:
1. Review and approve this plan
2. Begin Phase 2 implementation (wallet balance monitoring)
3. Create integration tests for each phase
4. Update documentation as features are released

---

**Document Version**: 1.0
**Last Updated**: 2025-01-30
**Author**: Claude Code
**Status**: Ready for Review
