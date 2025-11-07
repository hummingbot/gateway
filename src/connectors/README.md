# Connector Registry System

## Overview

The connector registry (`connector-registry.ts`) is the **single source of truth** for all DEX connectors in Gateway. This system eliminates the need to update multiple files when adding new connectors.

## Architecture

### Central Registry File

**Location**: `src/connectors/connector-registry.ts`

This file contains:
- `SOLANA_CONNECTORS` - Registry of all Solana-based DEX connectors
- `ETHEREUM_CONNECTORS` - Registry of all Ethereum-based DEX connectors
- Helper functions to fetch pool info from any connector

### Files That Use the Registry

1. **`src/pools/pool-info-helpers.ts`** - Uses registry to fetch pool info for the `/pools/find-save` endpoint
2. **`src/chains/solana/solana.ts`** - Uses registry in `trackPools()` for pool cache initialization

## Adding a New Connector

### Step 1: Create Your Connector

Follow the existing connector structure:
- Create directory: `src/connectors/your-connector/`
- Implement class with `getInstance(network)` method
- Implement pool info methods: `getPoolInfo()`, `getClmmPoolInfo()`, or `getAmmPoolInfo()`

### Step 2: Register in connectorsConfig

Edit `src/config/routes/getConnectors.ts`:

```typescript
{
  name: 'your-connector',
  trading_types: ['clmm'], // or ['amm'] or both
  chain: 'solana', // or 'ethereum'
  networks: ['mainnet-beta'], // supported networks
}
```

### Step 3: Add to Connector Registry

Edit `src/connectors/connector-registry.ts`:

```typescript
// 1. Import your connector
import { YourConnector } from './your-connector/your-connector';

// 2. Add to the appropriate registry
export const SOLANA_CONNECTORS = {
  meteora: Meteora,
  raydium: Raydium,
  'pancakeswap-sol': PancakeswapSol,
  'your-connector': YourConnector, // <-- Add here
} as const;
```

**That's it!** All pool fetching code will automatically work with your new connector.

## No Need to Update

You do NOT need to update:
- ❌ `src/pools/pool-info-helpers.ts`
- ❌ `src/chains/solana/solana.ts` (trackPools method)
- ❌ `src/chains/ethereum/ethereum.ts` (if we add pool tracking)
- ❌ Any route files

## Method Name Conventions

The registry automatically handles different method naming patterns:

### Solana Connectors
- **CLMM pools**: Tries `getClmmPoolInfo()` first, falls back to `getPoolInfo()`
- **AMM pools**: Calls `getAmmPoolInfo()`

### Ethereum Connectors
- Uses the `${connector}.utils` module pattern
- **CLMM pools**: Calls `getV3PoolInfo()`
- **AMM pools**: Calls `getV2PoolInfo()`

## Example: Adding a New Solana Connector

```typescript
// Step 1: Already created src/connectors/orca/orca.ts with:
export class Orca {
  public static async getInstance(network: string): Promise<Orca> { ... }
  public async getClmmPoolInfo(poolAddress: string): Promise<PoolInfo> { ... }
}

// Step 2: Add to connectorsConfig
{
  name: 'orca',
  trading_types: ['clmm'],
  chain: 'solana',
  networks: ['mainnet-beta'],
}

// Step 3: Add to connector-registry.ts
import { Orca } from './orca/orca';

export const SOLANA_CONNECTORS = {
  meteora: Meteora,
  raydium: Raydium,
  'pancakeswap-sol': PancakeswapSol,
  orca: Orca, // <-- Done!
} as const;
```

Now `/pools/find-save?connector=orca` will automatically work!

## Benefits

✅ **Single place to add connectors** - Only edit `connector-registry.ts`

✅ **Type-safe** - Uses actual class imports, not dynamic requires

✅ **No hardcoded if/else chains** - Registry handles all connectors uniformly

✅ **Consistent behavior** - All connectors follow the same code path

✅ **Easy to maintain** - Clear registry shows all available connectors

## Testing

After adding a connector:

```bash
# Test pool fetching
curl 'http://localhost:15888/pools/find-save?chainNetwork=solana-mainnet-beta&connector=your-connector&type=clmm&page=1&saveLimit=1'
```

The endpoint should automatically work without any additional code changes.
