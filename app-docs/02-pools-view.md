# Pools View - Mockup & Specification

## ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Gateway                                             [Solana ▾] [0x7a3F...b2E4 ▾] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Wallet      Swap      ┌─ Pools ──┐   Liquidity     Configs                   │
│                                                                                │
│  ┌─ Find Pools ─────────────────────────────────────────────────────────────┐ │
│  │  Connector: [Raydium ▾]   Token A: [SOL     ]   Token B: [USDC    ]      │ │
│  │  Type: [● CLMM  ○ AMM]                              [Search Pools]        │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│  Search Results (12)                                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │  ≋ SOL / USDC                                     0.25% fee   [+Add]   │   │
│  │  🔷 Raydium CLMM                                                        │   │
│  │  Price: $158.33  •  TVL: $2.4M  •  24h Vol: $890K                      │   │
│  │  58oQCh...YQo2                                          [View Details] │   │
│  ├────────────────────────────────────────────────────────────────────────┤   │
│  │  ≋ SOL / USDC                                     0.05% fee   [+Add]   │   │
│  │  🔷 Raydium CLMM                                                        │   │
│  │  Price: $158.33  •  TVL: $5.1M  •  24h Vol: $1.2M                      │   │
│  │  AVs9TA...fG2RA                                         [View Details] │   │
│  ├────────────────────────────────────────────────────────────────────────┤   │
│  │  ≋ SOL / USDC                                     1.00% fee   [+Add]   │   │
│  │  🔷 Raydium CLMM                                                        │   │
│  │  Price: $158.33  •  TVL: $450K  •  24h Vol: $120K                      │   │
│  │  2AXXcN...t8rvY                                         [View Details] │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
│  My Saved Pools (4)                                                [+ Add Pool] │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │  ⓞⓈ ORE / wSOL                                    0.25% fee    [★]     │   │
│  │  🥞 PancakeSwap CLMM                                                   │   │
│  │  Price: 0.00145  •  My Position: $331.81                              │   │
│  │  CbvdQY...fa2vEV                                   [Manage Position]   │   │
│  ├────────────────────────────────────────────────────────────────────────┤   │
│  │  ≋ SOL / USDC                                     0.05% fee    [★]     │   │
│  │  🔷 Raydium CLMM                                                       │   │
│  │  Price: $158.33  •  My Position: $0 (No position)                     │   │
│  │  AVs9TA...fG2RA                                    [Open Position]     │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Layout Structure

### Search Panel
```
┌─ Find Pools ─────────────────────────────────────────────────────────┐
│  Connector: [Raydium ▾]   Token A: [SOL     ]   Token B: [USDC    ]  │
│  Type: [● CLMM  ○ AMM]                              [Search Pools]    │
└──────────────────────────────────────────────────────────────────────┘
```

**Fields:**
- **Connector**: Dropdown with all connectors (Raydium, Meteora, PancakeSwap, Uniswap, etc.)
- **Token A**: Text input with autocomplete
- **Token B**: Text input with autocomplete
- **Type**: Radio buttons (CLMM / AMM)
- **Search Button**: Triggers pool search

**Connector Options:**
```
┌─ Select Connector ───┐
│ Solana               │
│ ● Raydium            │
│   Meteora            │
│   PancakeSwap-Sol    │
│   Jupiter (Router)   │
│                      │
│ Ethereum/EVM         │
│   Uniswap V3         │
│   Uniswap V2         │
│   PancakeSwap V3     │
│   PancakeSwap V2     │
│   0x (Router)        │
└──────────────────────┘
```

### Search Results Section
```
Search Results (12)
┌────────────────────────────────────────────────────────────────┐
│  ≋ SOL / USDC                                0.25% fee  [+Add] │
│  🔷 Raydium CLMM                                               │
│  Price: $158.33  •  TVL: $2.4M  •  24h Vol: $890K             │
│  58oQCh...YQo2                                 [View Details]  │
└────────────────────────────────────────────────────────────────┘
```

**Pool Card Shows:**
- **Token pair**: Icons + symbols (SOL / USDC)
- **Fee tier**: 0.05%, 0.25%, 1.00%, etc.
- **Add button**: Save pool to "My Pools"
- **Protocol badge**: Raydium CLMM / Meteora DLMM / etc.
- **Pool stats**: Current price, TVL, 24h volume (if available)
- **Pool address**: Truncated with copy button
- **Action button**: "View Details" → Opens pool detail modal

**Empty State:**
```
┌───────────────────────────────────────────┐
│                                           │
│         🔍 No pools found                 │
│                                           │
│  Try different tokens or connector        │
│                                           │
└───────────────────────────────────────────┘
```

### My Saved Pools Section
```
My Saved Pools (4)                                     [+ Add Pool]
┌────────────────────────────────────────────────────────────────┐
│  ⓞⓈ ORE / wSOL                           0.25% fee     [★]    │
│  🥞 PancakeSwap CLMM                                          │
│  Price: 0.00145  •  My Position: $331.81                      │
│  CbvdQY...fa2vEV                          [Manage Position]   │
└────────────────────────────────────────────────────────────────┘
```

**Saved Pool Card Shows:**
- **Star icon**: Indicates saved pool
- **Token pair + fee tier**
- **Protocol badge**
- **Current price**
- **User's position value** (if they have a position)
- **Action buttons**:
  - If position exists: "Manage Position" → Opens Liquidity View
  - If no position: "Open Position" → Opens Liquidity View with add liquidity form
- **Right-click menu**: Remove from saved pools

**Add Pool Button:**
```
Click [+ Add Pool]
  ↓
┌─ Add Pool Manually ──────────┐
│ Connector: [Raydium     ▾]   │
│ Type:      [CLMM        ▾]   │
│ Network:   [mainnet-beta ▾]  │
│ Address:   [_____________]   │
│                              │
│        [Cancel]  [Add Pool]  │
└──────────────────────────────┘
```

## API Calls

### Search Pools

```typescript
// Find pools by token pair
GET /pools/find?network={network}&connector={connector}&tokenA={tokenA}&tokenB={tokenB}

Response:
{
  pools: [
    {
      connector: "raydium",
      type: "clmm",
      network: "mainnet-beta",
      address: "58oQCh...",
      baseSymbol: "SOL",
      quoteSymbol: "USDC",
      baseTokenAddress: "So11...",
      quoteTokenAddress: "EPjF...",
      feePct: 0.25
    },
    // ... more pools
  ]
}
```

### Get Pool Details

```typescript
// Get detailed pool info
GET /connectors/{connector}/clmm/pool-info?network={network}&poolAddress={address}

Response (CLMM):
{
  address: "58oQCh...",
  baseTokenAddress: "So11...",
  quoteTokenAddress: "EPjF...",
  feePct: 0.25,
  price: 158.33,
  baseTokenAmount: 15000,
  quoteTokenAmount: 2375000,
  activeBinId: 50,
  // Meteora-specific
  dynamicFeePct?: 0.3,
  minBinId?: 20,
  maxBinId?: 80
}

Response (AMM):
{
  address: "58oQCh...",
  baseTokenAddress: "So11...",
  quoteTokenAddress: "EPjF...",
  feePct: 0.3,
  price: 158.33,
  baseTokenAmount: 15000,
  quoteTokenAmount: 2375000
}
```

### Save Pool

```typescript
// Add pool to saved list
POST /pools
Body: {
  connector: "raydium",
  type: "clmm",
  network: "mainnet-beta",
  address: "58oQCh..."
}

Response: { success: true }
```

### List Saved Pools

```typescript
// Get user's saved pools
GET /pools/list?network={network}

Response:
{
  pools: [
    {
      connector: "raydium",
      type: "clmm",
      network: "mainnet-beta",
      address: "58oQCh...",
      baseSymbol: "SOL",
      quoteSymbol: "USDC",
      baseTokenAddress: "So11...",
      quoteTokenAddress: "EPjF...",
      feePct: 0.25
    },
    // ... more saved pools
  ]
}
```

### Check User Positions

```typescript
// For each saved pool, check if user has a position
GET /connectors/{connector}/clmm/positions-owned?network={network}&walletAddress={wallet}

Response:
{
  positions: [
    {
      address: "position-nft-address",
      poolAddress: "58oQCh...",
      baseTokenAmount: 10.5,
      quoteTokenAmount: 1658.5,
      baseFeeAmount: 0.12,
      quoteFeeAmount: 18.96,
      // ... more position data
    }
  ]
}
```

## Component Breakdown

### PoolsView.tsx
```typescript
- State:
  - searchParams (connector, tokenA, tokenB, type)
  - searchResults: Pool[]
  - savedPools: Pool[]
  - userPositions: PositionInfo[]
  - loading: boolean

- Functions:
  - searchPools()
  - loadSavedPools()
  - checkUserPositions()
  - addPool(pool)
  - removePool(poolAddress)
```

### PoolSearchPanel.tsx
```typescript
- Props: onSearch(params)
- Form with connector/token inputs
- Validation: Both tokens required
- Submit → Call onSearch
```

### PoolCard.tsx
```typescript
- Props: pool, userPosition?, onAdd, onManage
- Display pool info
- Conditional buttons based on position existence
- Star icon if saved
```

### PoolDetailModal.tsx
```typescript
- Props: pool, isOpen, onClose
- Shows full pool details:
  - Token pair
  - Current price
  - Liquidity distribution (CLMM bins)
  - Fee tier
  - Pool stats
- Actions:
  - Add to saved pools
  - Open position (→ Liquidity View)
```

### AddPoolDialog.tsx
```typescript
- Props: isOpen, onClose, onAdd
- Manual pool entry:
  - Connector dropdown
  - Type dropdown (AMM/CLMM)
  - Network dropdown
  - Address input
- Validate pool exists via API
- Add to saved pools
```

## User Flows

### Search for Pools
```
1. User selects connector (Raydium)
2. User enters Token A (SOL)
3. User enters Token B (USDC)
4. User selects type (CLMM)
5. User clicks "Search Pools"
   ↓
6. App calls GET /pools/find
   ↓
7. Display search results
8. User clicks "+Add" on a pool
   ↓
9. App calls POST /pools
   ↓
10. Pool added to "My Saved Pools"
```

### View Pool Details
```
1. User clicks "View Details" on a pool card
   ↓
2. Modal opens
3. App fetches pool-info from connector API
   ↓
4. Display detailed pool information
5. User can add to saved pools or open position
```

### Manage Existing Position
```
1. User sees saved pool with position value
2. User clicks "Manage Position"
   ↓
3. Navigate to Liquidity View
4. Pre-load that pool and position
5. User can add/remove liquidity or collect fees
```

### Add Pool Manually
```
1. User clicks "+ Add Pool" button
   ↓
2. Dialog opens
3. User fills in: connector, type, network, address
4. User clicks "Add Pool"
   ↓
5. App validates pool exists (GET pool-info)
6. If valid, POST /pools
   ↓
7. Pool added to saved list
```

## State Management

```typescript
// Local component state in PoolsView
interface PoolsState {
  searchParams: {
    connector: string;
    tokenA: string;
    tokenB: string;
    type: 'clmm' | 'amm';
  };
  searchResults: Pool[];
  savedPools: Pool[];
  userPositions: Map<string, PositionInfo>; // poolAddress -> position
  loading: boolean;
  searchLoading: boolean;
}
```

## Styling Notes

- **Search panel**: Sticky at top, light background
- **Pool cards**: Hover effect, clickable
- **Add button**: Green accent color
- **Star icon**: Yellow/gold when saved
- **Protocol badges**: Color-coded (Raydium blue, Meteora purple, etc.)
- **Empty states**: Centered with icon
- **Loading states**: Skeleton cards

## Edge Cases

- **No pools found**: Show empty state with suggestion
- **Invalid token pair**: Show error message
- **Pool already saved**: Disable "+Add" button
- **Network mismatch**: Filter pools by selected network
- **Position not found**: Show $0 position value

## Future Enhancements (V2)

- [ ] Filter by fee tier
- [ ] Sort by TVL, volume, APR
- [ ] Pool comparison (side-by-side)
- [ ] Favorites/bookmark system
- [ ] Historical pool stats
- [ ] Liquidity distribution charts (CLMM)
- [ ] Impermanent loss calculator
- [ ] Notifications for pool events
