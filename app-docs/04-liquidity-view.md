# Liquidity View - Mockup & Specification

## ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Gateway                                             [Solana ▾] [0x7a3F...b2E4 ▾] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Wallet       Swap      Pools    ┌─ Liquidity ──┐    Configs                  │
│                                                                                │
│  Pool: ⓞⓈ ORE / wSOL (0.25%)  •  🥞 PancakeSwap CLMM        [Change Pool]     │
│  CbvdQY...fa2vEV  •  Price: 0.00145                                           │
│                                                                                │
│  ┌─ My Positions ───────────────────────────────────────────────────────────┐ │
│  │                                                                           │ │
│  │  Position #1                                       Active  •  In Range   │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  Liquidity: $331.81                                                 │ │ │
│  │  │                                                                     │ │ │
│  │  │  Tokens:                           Uncollected Fees:                │ │ │
│  │  │    0.4246 ORE  ($61.57)              0.0042 ORE  ($0.61)           │ │ │
│  │  │    0.7786 wSOL ($270.24)             0.0078 wSOL ($2.71)           │ │ │
│  │  │                                                                     │ │ │
│  │  │  Price Range:                                                       │ │ │
│  │  │  Min: 0.00120  ◄──────●──────►  Max: 0.00170                      │ │ │
│  │  │                   Current: 0.00145                                 │ │ │
│  │  │                                                                     │ │ │
│  │  │  [Add Liquidity]  [Remove Liquidity]  [Collect Fees]  [Close]     │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                           │ │
│  │  + Open New Position                                                      │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│  ┌─ Add Liquidity ──────────────────────┐  ┌─ Remove Liquidity ─────────────┐ │
│  │                                      │  │                                │ │
│  │  Price Range:                        │  │  Position: [Position #1    ▾] │ │
│  │  Min Price: [0.00120]                │  │                                │ │
│  │  Max Price: [0.00170]                │  │  Amount to Remove:             │ │
│  │                                      │  │  [────────●────────] 50%       │ │
│  │  Deposit Amount:                     │  │                                │ │
│  │  ORE:  [0.5_____]     Balance: 2.5  │  │  You'll Receive:               │ │
│  │  wSOL: [0.8_____]     Balance: 5.0  │  │    0.2123 ORE                  │ │
│  │                                      │  │    0.3893 wSOL                 │ │
│  │  Current Price: 0.00145              │  │                                │ │
│  │  ● In Range                          │  │  Uncollected Fees:             │ │
│  │                                      │  │    0.0042 ORE                  │ │
│  │  [Preview]  [Add Liquidity]          │  │    0.0078 wSOL                 │ │
│  │                                      │  │                                │ │
│  └──────────────────────────────────────┘  │  [Preview]  [Remove Liquidity] │ │
│                                            └────────────────────────────────┘ │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Layout Structure

### Pool Header
```
Pool: ⓞⓈ ORE / wSOL (0.25%)  •  🥞 PancakeSwap CLMM        [Change Pool]
CbvdQY...fa2vEV  •  Price: 0.00145
```

**Shows:**
- Token pair with icons
- Fee tier
- Protocol name + type (CLMM/AMM)
- Pool address (truncated, clickable to copy)
- Current pool price
- "Change Pool" button → Opens pool selector

### My Positions Section (CLMM)
```
┌─ My Positions ──────────────────────────────────────────────────┐
│                                                                 │
│  Position #1                              Active  •  In Range   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Liquidity: $331.81                                       │  │
│  │                                                           │  │
│  │  Tokens:                    Uncollected Fees:            │  │
│  │    0.4246 ORE  ($61.57)       0.0042 ORE  ($0.61)       │  │
│  │    0.7786 wSOL ($270.24)      0.0078 wSOL ($2.71)       │  │
│  │                                                           │  │
│  │  Price Range:                                            │  │
│  │  Min: 0.00120  ◄──────●──────►  Max: 0.00170           │  │
│  │                  Current: 0.00145                        │  │
│  │                                                           │  │
│  │  [Add]  [Remove]  [Collect Fees]  [Close]               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  + Open New Position                                            │
└─────────────────────────────────────────────────────────────────┘
```

**Position Card Shows:**
- Status badge (Active/Closed, In Range/Out of Range)
- Total liquidity value
- Token amounts + USD values
- Uncollected fees for each token
- Price range visualization
  - Min price on left
  - Max price on right
  - Current price indicator
  - Visual bar showing position relative to current price
- Action buttons:
  - **Add Liquidity**: Add more to this position
  - **Remove Liquidity**: Remove partial or full liquidity
  - **Collect Fees**: Claim accumulated fees
  - **Close**: Remove all liquidity + collect fees

**Empty State:**
```
┌─ My Positions ──────────────────────────────────────┐
│                                                     │
│           No positions in this pool                 │
│                                                     │
│         + Open New Position                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### My Position Section (AMM)
```
┌─ My Position ────────────────────────────────────────┐
│                                                      │
│  Liquidity: $1,250.00                                │
│                                                      │
│  Pool Tokens:                                        │
│    100.5 SOL  ($15,900)                              │
│    15,900 USDC ($15,900)                             │
│                                                      │
│  Your LP Tokens: 125.5                               │
│  Pool Share: 0.5%                                    │
│                                                      │
│  [Add Liquidity]  [Remove Liquidity]                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**AMM is simpler - no price ranges, just pool share.**

### Two-Column Action Panels

#### Left: Add Liquidity (CLMM)
```
┌─ Add Liquidity ──────────────────────┐
│                                      │
│  Price Range:                        │
│  Min Price: [0.00120]                │
│  Max Price: [0.00170]                │
│                                      │
│  Deposit Amount:                     │
│  ORE:  [0.5_____]     Balance: 2.5  │
│  wSOL: [0.8_____]     Balance: 5.0  │
│                                      │
│  Current Price: 0.00145              │
│  ● In Range                          │
│                                      │
│  [Preview]  [Add Liquidity]          │
│                                      │
└──────────────────────────────────────┘
```

**For new position:**
- User sets price range (min/max)
- User enters deposit amounts
- Shows if position will be in range
- Preview shows expected LP tokens / position value

**For adding to existing position:**
- Price range is read-only (from existing position)
- Just enter amounts to add

#### Left: Add Liquidity (AMM)
```
┌─ Add Liquidity ──────────────────────┐
│                                      │
│  Deposit Amount:                     │
│  SOL:  [1.0_____]     Balance: 5.0  │
│  USDC: [158.33__]     Balance: 500  │
│                                      │
│  Current Pool Ratio:                 │
│  1 SOL = 158.33 USDC                │
│                                      │
│  You'll Receive:                     │
│    ~1.25 LP Tokens                   │
│                                      │
│  [Preview]  [Add Liquidity]          │
│                                      │
└──────────────────────────────────────┘
```

**Simpler for AMM:**
- Just token amounts (auto-balanced to pool ratio)
- Shows LP tokens you'll receive

#### Right: Remove Liquidity (CLMM)
```
┌─ Remove Liquidity ─────────────────┐
│                                    │
│  Position: [Position #1        ▾]  │
│                                    │
│  Amount to Remove:                 │
│  [────────●────────] 50%           │
│                                    │
│  You'll Receive:                   │
│    0.2123 ORE                      │
│    0.3893 wSOL                     │
│                                    │
│  Uncollected Fees:                 │
│    0.0042 ORE                      │
│    0.0078 wSOL                     │
│                                    │
│  [Preview]  [Remove Liquidity]     │
│                                    │
└────────────────────────────────────┘
```

**Features:**
- Slider to select % to remove (0-100%)
- Shows tokens you'll receive
- Option to include uncollected fees
- Can remove partial or full position

#### Right: Remove Liquidity (AMM)
```
┌─ Remove Liquidity ─────────────────┐
│                                    │
│  Amount to Remove:                 │
│  [────────●────────] 50%           │
│                                    │
│  You'll Burn:                      │
│    62.75 LP Tokens                 │
│                                    │
│  You'll Receive:                   │
│    50.25 SOL                       │
│    7,950 USDC                      │
│                                    │
│  [Preview]  [Remove Liquidity]     │
│                                    │
└────────────────────────────────────┘
```

## API Calls

### Get Pool Info

```typescript
// CLMM
GET /connectors/{connector}/clmm/pool-info?network={network}&poolAddress={poolAddress}

Response:
{
  address: "CbvdQY...",
  baseTokenAddress: "oreV2...",
  quoteTokenAddress: "So1111...",
  feePct: 0.25,
  price: 0.00145,
  baseTokenAmount: 1000000,
  quoteTokenAmount: 1450,
  activeBinId: 50
}

// AMM
GET /connectors/{connector}/amm/pool-info?network={network}&poolAddress={poolAddress}

Response:
{
  address: "58oQCh...",
  baseTokenAddress: "So1111...",
  quoteTokenAddress: "EPjFWd...",
  feePct: 0.3,
  price: 158.33,
  baseTokenAmount: 15000,
  quoteTokenAmount: 2375000
}
```

### Get User Positions (CLMM)

```typescript
GET /connectors/{connector}/clmm/positions-owned?network={network}&walletAddress={wallet}

Response:
{
  positions: [
    {
      address: "position-nft-address",
      poolAddress: "CbvdQY...",
      baseTokenAddress: "oreV2...",
      quoteTokenAddress: "So1111...",
      baseTokenAmount: 0.4246,
      quoteTokenAmount: 0.7786,
      baseFeeAmount: 0.0042,
      quoteFeeAmount: 0.0078,
      lowerBinId: 45,
      upperBinId: 55,
      lowerPrice: 0.00120,
      upperPrice: 0.00170,
      price: 0.00145,
      rewardTokenAddress?: "...",
      rewardAmount?: 10.5
    }
  ]
}
```

### Open New Position (CLMM)

```typescript
POST /connectors/{connector}/clmm/open-position
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  poolAddress: "CbvdQY...",
  lowerPrice: 0.00120,
  upperPrice: 0.00170,
  baseTokenAmount: 0.5,
  quoteTokenAmount: 0.8,
  slippagePct: 1.0
}

Response:
{
  signature: "tx-sig",
  status: 0,  // PENDING
  data: {
    positionAddress: "new-position-nft",
    fee: 0.001,
    baseTokenAmountAdded: 0.5,
    quoteTokenAmountAdded: 0.8
  }
}
```

### Add Liquidity to Position (CLMM)

```typescript
POST /connectors/{connector}/clmm/add-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  positionAddress: "position-nft",
  baseTokenAmount: 0.5,
  quoteTokenAmount: 0.8,
  slippagePct: 1.0
}

Response:
{
  signature: "tx-sig",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountAdded: 0.5,
    quoteTokenAmountAdded: 0.8
  }
}
```

### Remove Liquidity (CLMM)

```typescript
POST /connectors/{connector}/clmm/remove-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  positionAddress: "position-nft",
  percentageToRemove: 50
}

Response:
{
  signature: "tx-sig",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountRemoved: 0.2123,
    quoteTokenAmountRemoved: 0.3893
  }
}
```

### Collect Fees (CLMM)

```typescript
POST /connectors/{connector}/clmm/collect-fees
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  positionAddress: "position-nft"
}

Response:
{
  signature: "tx-sig",
  status: 0,
  data: {
    fee: 0.001,
    baseFeeAmount: 0.0042,
    quoteFeeAmount: 0.0078
  }
}
```

### Close Position (CLMM)

```typescript
POST /connectors/{connector}/clmm/close-position
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  positionAddress: "position-nft"
}

Response:
{
  signature: "tx-sig",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountRemoved: 0.4246,
    quoteTokenAmountRemoved: 0.7786,
    baseFeeAmount: 0.0042,
    quoteFeeAmount: 0.0078
  }
}
```

### AMM Operations

```typescript
// Add Liquidity (AMM)
POST /connectors/{connector}/amm/add-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  poolAddress: "58oQCh...",
  baseTokenAmount: 1.0,
  quoteTokenAmount: 158.33,
  slippagePct: 1.0
}

Response:
{
  signature: "tx-sig",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountAdded: 1.0,
    quoteTokenAmountAdded: 158.33
  }
}

// Remove Liquidity (AMM)
POST /connectors/{connector}/amm/remove-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "user-wallet",
  poolAddress: "58oQCh...",
  percentageToRemove: 50
}

Response:
{
  signature: "tx-sig",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountRemoved: 50.25,
    quoteTokenAmountRemoved: 7950
  }
}
```

## Component Breakdown

### LiquidityView.tsx
```typescript
- State:
  - selectedPool: Pool | null
  - positions: PositionInfo[]
  - poolInfo: PoolInfo | null
  - selectedPosition: PositionInfo | null
  - activePanel: 'add' | 'remove' | 'collect' | 'close'
  - loading: boolean

- Functions:
  - loadPoolInfo()
  - loadPositions()
  - openPosition()
  - addLiquidity()
  - removeLiquidity()
  - collectFees()
  - closePosition()
```

### PoolSelector.tsx
```typescript
- Props: selectedPool, onSelect
- Modal with saved pools list
- Search functionality
```

### PositionCard.tsx (CLMM)
```typescript
- Props: position, poolInfo, onAction
- Displays position details
- Price range visualization
- Action buttons
```

### PositionCard.tsx (AMM)
```typescript
- Props: position, poolInfo, onAction
- Simpler display (no price range)
- Shows pool share %
```

### AddLiquidityForm.tsx (CLMM)
```typescript
- Props: pool, position (optional), onSubmit
- Price range inputs (if new position)
- Token amount inputs
- Balance validation
- Preview button
```

### AddLiquidityForm.tsx (AMM)
```typescript
- Props: pool, onSubmit
- Token amount inputs (auto-balanced)
- Shows LP tokens to receive
```

### RemoveLiquidityForm.tsx (CLMM)
```typescript
- Props: positions[], onSubmit
- Position selector
- Percentage slider
- Shows tokens to receive
```

### RemoveLiquidityForm.tsx (AMM)
```typescript
- Props: pool, lpBalance, onSubmit
- Percentage slider
- Shows tokens to receive
```

### PriceRangeVisualization.tsx
```typescript
- Props: minPrice, maxPrice, currentPrice
- Visual bar with markers
- Shows if in/out of range
```

## User Flows

### Open New CLMM Position
```
1. User selects pool (or arrives from Pools view)
2. User clicks "+ Open New Position"
3. Form appears with price range inputs
4. User sets min/max prices
5. User enters token amounts
6. App shows if position is in range
7. User clicks "Preview"
   ↓
8. Modal shows position details
9. User clicks "Confirm"
   ↓
10. App calls POST /connectors/{connector}/clmm/open-position
11. Poll for confirmation
12. Position appears in list
```

### Add Liquidity to Existing Position
```
1. User clicks "Add" on position card
2. Form appears with price range (read-only)
3. User enters amounts to add
4. User clicks "Preview" → "Confirm"
   ↓
5. App calls POST /connectors/{connector}/clmm/add-liquidity
6. Poll for confirmation
7. Position card updates with new amounts
```

### Remove Liquidity
```
1. User clicks "Remove" on position card
2. Remove form appears
3. User adjusts slider to select percentage
4. App shows tokens they'll receive
5. User clicks "Preview" → "Confirm"
   ↓
6. App calls POST /connectors/{connector}/clmm/remove-liquidity
7. Poll for confirmation
8. Position card updates (or removed if 100%)
```

### Collect Fees
```
1. User clicks "Collect Fees" on position card
2. Confirmation modal shows fee amounts
3. User clicks "Confirm"
   ↓
4. App calls POST /connectors/{connector}/clmm/collect-fees
5. Poll for confirmation
6. Position card shows 0 uncollected fees
```

### Close Position
```
1. User clicks "Close" on position card
2. Confirmation modal shows:
   - Tokens to receive
   - Fees to collect
   - Warning this will burn the position NFT
3. User clicks "Confirm"
   ↓
4. App calls POST /connectors/{connector}/clmm/close-position
5. Poll for confirmation
6. Position removed from list
```

## State Management

```typescript
// Local component state
interface LiquidityState {
  selectedPool: Pool | null;
  positions: PositionInfo[];
  poolInfo: PoolInfo | null;
  selectedPosition: PositionInfo | null;
  activeForm: 'add-new' | 'add-existing' | 'remove' | null;
  loading: boolean;
}
```

## Styling Notes

- **Position cards**: Green border if in range, gray if out of range
- **Price range bar**: Visual indicator with current price dot
- **Uncollected fees**: Highlighted if > $5
- **Action buttons**: Color-coded (green for add, red for remove, blue for collect)
- **Forms**: Side-by-side panels for desktop, stacked for mobile
- **Preview modal**: Shows all transaction details before confirmation

## Validation

- **Price range**: Min < Max
- **In range check**: Warn if opening out-of-range position
- **Amount > 0**: Cannot be zero
- **Amount <= Balance**: Cannot exceed wallet balance
- **Percentage**: 0-100% for removal
- **Slippage**: Reasonable (0.1% - 5%)

## Edge Cases

- **No positions**: Show empty state with "Open Position" button
- **Out of range**: Show warning, explain no fees earned
- **Insufficient balance**: Disable add liquidity button
- **Pool not found**: Show error, offer to select different pool
- **Position closed**: Refresh list, remove from display

## Future Enhancements (V2)

- [ ] Position analytics (APR, IL, ROI)
- [ ] Historical fee earnings chart
- [ ] Liquidity distribution visualization (bins)
- [ ] Auto-compound fees
- [ ] Price range suggestions (based on volatility)
- [ ] Multiple position management (batch operations)
- [ ] Position alerts (out of range, high fees)
- [ ] Impermanent loss calculator
- [ ] Limit orders (increase position at target price)
