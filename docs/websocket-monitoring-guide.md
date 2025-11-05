# WebSocket Monitoring Guide

This guide explains how to use Gateway's real-time WebSocket monitoring features for Solana wallets and Meteora pools.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Phase 2: Wallet Balance Monitoring](#phase-2-wallet-balance-monitoring)
- [Phase 3: Pool State Monitoring](#phase-3-pool-state-monitoring)
- [Testing](#testing)
- [Architecture Overview](#architecture-overview)

---

## Prerequisites

### 1. Enable Helius WebSocket

Edit `conf/rpc/helius.yml`:
```yaml
apiKey: 'YOUR_HELIUS_API_KEY'
useWebSocketRPC: true  # Enable WebSocket features
```

### 2. Configure Solana to Use Helius Provider

Edit `conf/chains/solana/solana.yml`:
```yaml
rpcProvider: helius  # Use Helius instead of standard RPC
```

### 3. Add Solana Wallets (Optional)

Add wallets to `conf/wallets/solana` using the wallet API:
```bash
curl -X POST http://localhost:15888/wallet/add \
  -H "Content-Type: application/json" \
  -d '{"chain":"solana","privateKey":"YOUR_PRIVATE_KEY"}'
```

Or manually place encrypted wallet files in `conf/wallets/solana/`.

### 4. Restart Gateway
```bash
pnpm build
GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true pnpm start
```

**Gateway will automatically:**
- Detect all wallets in `conf/wallets/solana`
- Fetch initial balances
- Subscribe to real-time updates via WebSocket

---

## Phase 2: Wallet Balance Monitoring

Monitor SOL and SPL token balances in real-time via WebSocket subscriptions.

### Auto-Subscription on Startup ⭐ NEW

**All Solana wallets in `conf/wallets/solana` are automatically monitored when Gateway starts!**

When Gateway initializes with Helius WebSocket enabled, it will:
1. Scan `conf/wallets/solana` for wallet files
2. Fetch initial balance for each wallet (SOL + tokens)
3. Subscribe to real-time balance updates via WebSocket
4. Log balance changes as they occur

**Startup Logs:**
```
[INFO] Auto-subscribing to 2 Solana wallet(s)...
[INFO] [82SggYRE...] Initial balance: 1.2345 SOL, 3 token(s)
[INFO] Subscribed to wallet balance updates for 82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5...
[INFO] ✅ Auto-subscribed to 2/2 Solana wallet(s)
```

**Real-time Updates:**
```
[INFO] [82SggYRE...] Balance update at slot 123456789:
[INFO]   SOL: 1.2400, Tokens: 3
[INFO]     - USDC: 100.5000
[INFO]     - SOL: 1.2400
[INFO]     - BONK: 1000000.0000
```

**No manual subscription needed!** Just add wallets to `conf/wallets/solana` and restart Gateway.

### How It Works

**Architecture:**
```
Client → Gateway API → Solana Class → HeliusService → Helius WebSocket RPC
                ↓
        Callback receives updates
                ↓
        Parse balances (SOL + tokens)
                ↓
        Deliver to client
```

**Subscription Flow:**
1. Client calls `POST /chains/solana/subscribe-balances`
2. Gateway subscribes to wallet account via Helius WebSocket
3. When wallet account changes (transaction received/sent):
   - HeliusService receives `accountNotification`
   - Solana class parses SOL balance from account lamports
   - Fetches all SPL token accounts for wallet
   - Matches token addresses to symbols from token list
   - Invokes callback with parsed balance data
4. Updates logged in real-time (or sent to client via SSE/WebSocket)

### API Endpoints

#### Subscribe to Wallet Balance Updates

```bash
curl -X POST http://localhost:15888/chains/solana/subscribe-balances \
  -H "Content-Type: application/json" \
  -d '{
    "network": "mainnet-beta",
    "address": "YOUR_WALLET_ADDRESS"
  }'
```

**Response:**
```json
{
  "subscriptionId": 1,
  "message": "Subscribed to wallet balance updates. Balance changes will be logged.",
  "initialBalances": {
    "sol": 1.234,
    "tokens": [
      {
        "symbol": "USDC",
        "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "balance": 100.50,
        "decimals": 6
      }
    ]
  }
}
```

**Real-time Updates:**
Balance changes are logged to the Gateway console:
```
[INFO] Wallet <address> balance updated at slot 123456789:
  sol: 1.245
  tokenCount: 3
```

#### Unsubscribe from Wallet Balance Updates

```bash
curl -X DELETE http://localhost:15888/chains/solana/unsubscribe-balances \
  -H "Content-Type: application/json" \
  -d '{
    "network": "mainnet-beta",
    "subscriptionId": 1
  }'
```

### Code Example

**TypeScript:**
```typescript
import { Solana } from './chains/solana/solana';

const solana = await Solana.getInstance('mainnet-beta');

// Subscribe to wallet balance updates
const subscriptionId = await solana.subscribeToWalletBalance(
  'YOUR_WALLET_ADDRESS',
  (balances) => {
    console.log(`SOL: ${balances.sol}`);
    console.log(`Tokens: ${balances.tokens.length}`);
    balances.tokens.forEach(token => {
      console.log(`  ${token.symbol}: ${token.balance}`);
    });
  }
);

// Later: unsubscribe
const heliusService = solana.getHeliusService();
await heliusService?.unsubscribeFromAccount(subscriptionId);
```

### Implementation Details

**File: `src/chains/solana/solana.ts`**

```typescript
public async subscribeToWalletBalance(
  walletAddress: string,
  callback: (balances: {
    sol: number;
    tokens: Array<{
      symbol: string;
      address: string;
      balance: number;
      decimals: number;
    }>;
    slot: number;
  }) => void,
): Promise<number>
```

**What triggers updates:**
- Incoming transaction (SOL or token transfer received)
- Outgoing transaction (SOL or token transfer sent)
- Token account created/closed
- Staking rewards deposited

**Latency:**
- ~2-3 seconds with `confirmed` commitment level
- ~400ms with `processed` commitment level (higher risk of reordering)

---

## Phase 3: Pool State Monitoring

Monitor Meteora DLMM pool state changes in real-time via WebSocket subscriptions.

### How It Works

**Architecture:**
```
Client → Gateway API → Meteora Connector → HeliusService → Helius WebSocket RPC
                ↓
        Callback receives pool account update
                ↓
        Refetch pool state from SDK
                ↓
        Parse pool info (activeBinId, reserves, fees, price)
                ↓
        Deliver to client via SSE
```

**Subscription Flow:**
1. Client connects to `GET /connectors/meteora/clmm/pool-info-stream`
2. Gateway subscribes to pool account via Helius WebSocket
3. When pool account changes (swap, liquidity add/remove):
   - HeliusService receives `accountNotification`
   - Meteora connector refetches pool state from Meteora SDK
   - Parses active bin, reserves, fees, and price
   - Sends update to client as SSE event
4. Client receives real-time pool updates via Server-Sent Events

### API Endpoints

#### Stream Pool Info Updates (SSE)

```bash
curl -N "http://localhost:15888/connectors/meteora/clmm/pool-info-stream?network=mainnet-beta&poolAddress=POOL_ADDRESS"
```

**Response (Server-Sent Events):**
```
data: {"subscriptionId":1,"message":"Subscribed to pool updates for <address>"}

data: {"address":"5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH","activeBinId":12345,"binStep":10,"baseTokenAmount":1234.56,"quoteTokenAmount":67890.12,"feePct":0.25,"price":98.45,"slot":123456789}

data: {"address":"5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH","activeBinId":12346,"binStep":10,"baseTokenAmount":1235.00,"quoteTokenAmount":67888.00,"feePct":0.25,"price":98.50,"slot":123456790}

: keepalive
```

**Fields:**
- `address`: Pool address
- `activeBinId`: Current active bin ID (determines current price)
- `binStep`: Bin step for the pool
- `baseTokenAmount`: Total base token reserves
- `quoteTokenAmount`: Total quote token reserves
- `feePct`: Fee percentage (e.g., 0.25 for 0.25%)
- `price`: Current price (adjusted for decimal differences)
- `slot`: Solana slot number when update occurred

**Stream automatically closes when:**
- Client disconnects
- WebSocket connection lost (will auto-reconnect and restore subscription)
- Gateway server stops

### Code Example

**TypeScript:**
```typescript
import { Meteora } from './connectors/meteora/meteora';

const meteora = await Meteora.getInstance('mainnet-beta');

// Subscribe to pool updates
const subscriptionId = await meteora.subscribeToPoolUpdates(
  'POOL_ADDRESS',
  (poolInfo) => {
    console.log(`Active Bin: ${poolInfo.activeBinId}`);
    console.log(`Price: ${poolInfo.price}`);
    console.log(`Base Reserve: ${poolInfo.baseTokenAmount}`);
    console.log(`Quote Reserve: ${poolInfo.quoteTokenAmount}`);
  }
);

// Later: unsubscribe
await meteora.unsubscribeFromPool(subscriptionId);
```

**JavaScript (Browser - EventSource):**
```javascript
const poolAddress = '5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH';
const url = `http://localhost:15888/connectors/meteora/clmm/pool-info-stream?network=mainnet-beta&poolAddress=${poolAddress}`;

const eventSource = new EventSource(url);

eventSource.onmessage = (event) => {
  const poolInfo = JSON.parse(event.data);
  console.log('Pool Update:', poolInfo);
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
};

// Later: close connection
eventSource.close();
```

### Implementation Details

**File: `src/connectors/meteora/meteora.ts`**

```typescript
public async subscribeToPoolUpdates(
  poolAddress: string,
  callback: (poolInfo: {
    address: string;
    activeBinId: number;
    binStep: number;
    baseTokenAmount: number;
    quoteTokenAmount: number;
    feePct: number;
    price: number;
    slot: number;
  }) => void,
): Promise<number>
```

**What triggers updates:**
- Swap executed in pool
- Liquidity added to pool
- Liquidity removed from pool
- Bin activation changes (price movement)
- Fee parameter updates

**Latency:**
- ~2-3 seconds with `confirmed` commitment level
- Pool state is refetched from SDK on each notification for accuracy

---

## Testing

### Quick Test with Shell Script

```bash
# Test pool monitoring via SSE
./scripts/test-sse-stream.sh
```

This will:
1. Check if Gateway is running
2. Connect to Meteora SOL-USDC pool stream
3. Display real-time pool updates as they occur

### Test with TypeScript

```bash
# Build the test script
pnpm build

# Test wallet monitoring
GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true node dist/scripts/test-websocket-monitoring.js wallet

# Test pool monitoring
GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true node dist/scripts/test-websocket-monitoring.js pool

# Test both
GATEWAY_PASSPHRASE=a START_SERVER=true DEV=true node dist/scripts/test-websocket-monitoring.js all
```

### Manual Testing

**Test wallet balance subscription:**
```bash
# Subscribe
curl -X POST http://localhost:15888/chains/solana/subscribe-balances \
  -H "Content-Type: application/json" \
  -d '{"network":"mainnet-beta","address":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}'

# Watch Gateway logs for balance updates
# Send a transaction to the wallet to trigger an update

# Unsubscribe (use subscriptionId from subscribe response)
curl -X DELETE http://localhost:15888/chains/solana/unsubscribe-balances \
  -H "Content-Type: application/json" \
  -d '{"network":"mainnet-beta","subscriptionId":1}'
```

**Test pool monitoring stream:**
```bash
# Connect to stream (will continuously output updates)
curl -N "http://localhost:15888/connectors/meteora/clmm/pool-info-stream?network=mainnet-beta&poolAddress=5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH"

# Execute a swap or liquidity operation on the pool to trigger an update
```

---

## Architecture Overview

### WebSocket Infrastructure

**HeliusService (Low-level):**
- Manages single persistent WebSocket connection to Helius RPC
- Handles `accountSubscribe`, `accountNotification` messages
- Automatic reconnection with exponential backoff
- Subscription restoration after reconnection
- Tracks subscription metadata

**Solana Class (Mid-level):**
- Provides `subscribeToWalletBalance()` for wallet monitoring
- Parses account info to extract SOL + token balances
- Matches token addresses to symbols from token list
- Exposes HeliusService via `getHeliusService()` getter

**Meteora Connector (High-level):**
- Provides `subscribeToPoolUpdates()` for pool monitoring
- Refetches pool state from Meteora SDK on updates
- Parses pool info: activeBinId, reserves, fees, price
- Adjusts prices for decimal differences

**API Routes (User-facing):**
- `/chains/solana/subscribe-balances` - Subscribe to wallet updates
- `/chains/solana/unsubscribe-balances` - Unsubscribe from wallet updates
- `/connectors/meteora/clmm/pool-info-stream` - Stream pool updates via SSE

### Subscription Lifecycle

```
1. Client Request
   ↓
2. Gateway creates subscription via HeliusService
   ↓
3. HeliusService sends accountSubscribe to Helius WebSocket
   ↓
4. Helius confirms subscription (returns subscription ID)
   ↓
5. Gateway stores subscription metadata
   ↓
6. On account change:
   - Helius sends accountNotification
   - HeliusService invokes registered callback
   - Callback parses data and delivers to client
   ↓
7. Client disconnects or unsubscribes
   ↓
8. Gateway sends accountUnsubscribe to Helius WebSocket
   ↓
9. Subscription cleaned up
```

### Reconnection Handling

If WebSocket disconnects:
1. HeliusService detects disconnection
2. Rejects all pending subscriptions with error
3. Attempts reconnection with exponential backoff
4. On successful reconnection:
   - Restores all active subscriptions
   - Resubscribes to all accounts
   - Updates subscription IDs
5. If reconnection fails after max attempts:
   - Falls back to polling (if applicable)
   - Logs error and notifies clients

---

## Performance Characteristics

### Resource Usage

**Per Subscription:**
- Memory: ~1-2KB metadata per subscription
- Bandwidth: Minimal (events only sent on state changes)
- CPU: Negligible (event-driven callbacks)

**WebSocket Connection:**
- Single persistent connection per Gateway instance
- Shared across all subscriptions (100+ subscriptions supported)
- Heartbeat every 30 seconds to maintain connection

**Bandwidth Comparison:**
```
Polling (every 5 seconds):
  - 720 requests/hour
  - ~50KB/hour per wallet/pool

WebSocket:
  - 1 persistent connection
  - ~2KB/hour (only on state changes)

Savings: ~96% bandwidth reduction
```

### Latency

| Commitment Level | Latency | Finality Risk |
|------------------|---------|---------------|
| `processed`      | ~400ms  | Medium (may reorder) |
| `confirmed`      | 2-3s    | Low (unlikely to reorder) |
| `finalized`      | 15-30s  | None (fully final) |

**Recommended:** Use `confirmed` for most use cases (good balance of latency and reliability)

---

## Troubleshooting

### WebSocket Not Available

**Error:** `WebSocket not available. Enable useHeliusWebSocketRPC...`

**Solution:**
1. Check `conf/rpc/helius.yml` has `useWebSocketRPC: true`
2. Verify Helius API key is configured
3. Ensure `conf/chains/solana/solana.yml` has `rpcProvider: helius`
4. Restart Gateway server

### No Updates Received

**Possible Causes:**
1. **No activity on wallet/pool** - Updates only sent when state changes
2. **Wrong commitment level** - Try lowering to `processed` for faster updates
3. **WebSocket disconnected** - Check Gateway logs for reconnection messages
4. **Subscription expired** - Resubscribe if no updates for >5 minutes

**Debug Steps:**
```bash
# Check WebSocket connection status in logs
grep "WebSocket" logs/*.log

# Verify subscription created
grep "Subscribed to" logs/*.log

# Test with known-active wallet/pool
# SOL-USDC pool has frequent swaps: 5E4sYT75xoHs41wWv7cUKzbe8kUE6wZVB3QjhKBp3jAH
```

### Subscription Limit Reached

**Error:** `Maximum subscription limit (100) reached`

**Solution:**
1. Unsubscribe from unused subscriptions
2. Increase limit in `conf/rpc/helius.yml`:
   ```yaml
   websocket:
     maxSubscriptions: 200
   ```
3. Use program-level subscriptions (Phase 5) for monitoring multiple accounts

---

## Next Steps

**Phase 4: Real-time Position Monitoring** (Coming Soon)
- Subscribe to individual CLMM position updates
- Monitor fees earned, liquidity changes, range status
- Alert when position goes out of range

**Phase 5: Program-Level Monitoring** (Future)
- Monitor all positions owned by a wallet
- Track all pools in a DEX protocol
- Bulk subscription management

---

## References

- [Helius WebSocket Implementation Plan](./helius-websocket-implementation-plan.md)
- [Helius WebSocket Documentation](https://docs.helius.dev/solana-rpc-nodes/websocket-subscriptions)
- [Solana WebSocket Methods](https://solana.com/docs/rpc/websocket)
- [Server-Sent Events (SSE) Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
