# Solana Cache Tests

Comprehensive tests for the cache-first implementation across all Solana CLMM connectors (PancakeSwap-Sol, Raydium, Meteora).

## Test Coverage

### Pool Cache Tests (`pool-cache.test.ts`)

Tests the cache-first logic for pool-info endpoints across all three connectors:

**PancakeSwap-Sol:**
- ✅ Cache HIT - Returns cached pool without RPC call
- ✅ Cache MISS - Fetches from RPC and populates cache
- ✅ Cache STALE - Returns stale data, triggers background refresh
- ✅ Cache key format - Uses only `poolAddress` (no connector prefix)

**Raydium:**
- ✅ Cache HIT - Returns cached pool without RPC call
- ✅ Cache MISS - Fetches from RPC and populates cache

**Meteora:**
- ✅ Cache HIT - Returns cached pool without RPC call
- ✅ Cache MISS - Fetches from RPC and populates cache

### Position Cache Tests (`position-cache.test.ts`)

Tests the cache-first logic for position-info and positions-owned endpoints:

**PancakeSwap-Sol:**
- ✅ position-info: Cache HIT - Returns cached position without RPC call
- ✅ position-info: Cache MISS - Fetches from RPC and populates cache
- ✅ position-info: Cache key format - Uses only `positionAddress` (no connector prefix)
- ✅ position-info: Cache STALE - Returns stale data, triggers background refresh
- ✅ positions-owned: Populates individual position caches by address

**Raydium:**
- ✅ Cache HIT - Returns cached position without RPC call
- ✅ Cache MISS - Fetches from RPC and populates cache

**Meteora:**
- ✅ Cache HIT - Returns cached position without RPC call
- ✅ Cache MISS - Fetches from RPC and populates cache

### Balance Cache Tests (`balance-cache.test.ts`)

Tests the balance cache with token filtering:

**Cache HIT Scenarios:**
- ✅ Returns all cached balances when no specific tokens requested
- ✅ Filters cached balances when specific tokens requested
- ✅ Fetches unknown tokens from RPC when not in cache
- ✅ Handles case-insensitive token symbol lookup

**Cache MISS Scenarios:**
- ✅ Fetches from RPC on cache miss and populates cache
- ✅ Fetches all tokens even when specific tokens requested

**Cache STALE Scenarios:**
- ✅ Returns stale data immediately and triggers background refresh

**Cache Disabled:**
- ✅ Falls back to RPC when cache is disabled

**Token Filtering Edge Cases:**
- ✅ Handles empty token list request
- ✅ Handles all tokens not found in cache
- ✅ Handles mix of cached and non-cached tokens

## Cache Key Strategy

All caches now use simplified keys:

- **Pool Cache**: `poolAddress` (not `connector:poolAddress`)
- **Position Cache**: `positionAddress` (not `connector:positionAddress` or wallet-based)
- **Balance Cache**: `walletAddress` with token filtering

## Cache-First Pattern

All endpoints follow the same pattern:

```
1. Check cache using simple key
2. If HIT:
   a. Return cached data immediately
   b. If STALE, trigger non-blocking background refresh
3. If MISS:
   a. Fetch from RPC
   b. Populate cache
   c. Return fresh data
```

## Running Tests

```bash
# Run all cache tests
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/solana/cache/

# Run specific test file
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/solana/cache/pool-cache.test.ts
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/solana/cache/position-cache.test.ts
GATEWAY_TEST_MODE=dev jest --runInBand test/chains/solana/cache/balance-cache.test.ts
```

## Test Results

```
Test Suites: 3 passed, 3 total
Tests:       28 passed, 28 total
```

All tests verify that:
1. Cache hits avoid unnecessary RPC calls
2. Cache misses properly fetch and populate
3. Stale cache triggers background refresh
4. Simplified cache keys work across all connectors
5. Token filtering works correctly for balance cache
