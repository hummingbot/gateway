# Wallet View - Mockup & Specification

## ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Gateway                                             [Solana ▾] [0x7a3F...b2E4 ▾] │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌─ Wallet ──┐  Swap      Pools     Liquidity                                 │
│                                                                                │
│  Holdings                                                              $543.31 │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │  👤 Holdings              $7.89  ▲                                        │ │
│  │  🥞 PancakeSwap          $543.31  ▲                                        │ │
│  │  🪐 Jupiter DAO            $8.44  ▲                                        │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│  ┌─ Tokens ─────────────────────────┐  ┌─ LP Positions ───────────────────┐  │
│  │                                  │  │                                  │  │
│  │  👤 Holdings              $7.89  │  │  🥞 PancakeSwap       $543.31   │  │
│  │  ┌────────────────────────────┐  │  │  ┌────────────────────────────┐  │  │
│  │  │ Wallet                     │  │  │  │ 💧 LiquidityPool  $333.52  │  │  │
│  │  │                            │  │  │  │                            │  │  │
│  │  │ Asset        Balance Value │  │  │  │ Asset       Balance  Value │  │  │
│  │  │ ─────────────────────────  │  │  │  │ ────────────────────────── │  │  │
│  │  │ ≋ SOL        0.04982 $7.89 │  │  │  │ ⓞⓈ ORE-wSOL           $332 │  │  │
│  │  │   Solana                   │  │  │  │   0.4246 ORE              │  │  │
│  │  │              $158.33       │  │  │  │   0.7786 wSOL             │  │  │
│  │  │              -1.92%        │  │  │  └────────────────────────────┘  │  │
│  │  └────────────────────────────┘  │  └──────────────────────────────────┘  │
│  └──────────────────────────────────┘                                         │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Layout Structure

### Header Bar
```
┌────────────────────────────────────────────────────────────────┐
│  Gateway                         [Network ▾] [Wallet Address ▾] │
└────────────────────────────────────────────────────────────────┘
```

**Components:**
- App logo/title (left)
- Network selector (upper right) - Dropdown with all networks (Solana, Ethereum, BSC, etc.)
- Wallet selector (upper right) - Dropdown with connected wallet addresses

**Network Selector Options:**
```
┌─ Select Network ────┐
│ ● Solana Mainnet    │
│   Solana Devnet     │
│ ● Ethereum Mainnet  │
│   Ethereum Sepolia  │
│   BSC               │
│   Polygon           │
│   Arbitrum          │
│   Base              │
│   Optimism          │
│   Avalanche         │
└─────────────────────┘
```

**Wallet Selector:**
```
┌─ Select Wallet ─────────────┐
│ ● 0x7a3F...b2E4 (Default)   │
│   So1ana...xYz2             │
│   0xABCD...1234             │
│ ─────────────────────────── │
│ + Add Wallet                │
└─────────────────────────────┘
```

### Navigation Tabs
```
┌─ Wallet ──┐  Swap     Pools     Liquidity     Configs
```

**Active tab** has dark background, others are clickable.

### Holdings Summary
```
Holdings                                                    $543.31
┌──────────────────────────────────────────────────────────────┐
│  👤 Holdings              $7.89  ▲                            │
│  🥞 PancakeSwap          $543.31  ▲                            │
│  🪐 Jupiter DAO            $8.44  ▲                            │
└──────────────────────────────────────────────────────────────┘
```

**Shows:**
- Total portfolio value (right aligned)
- Expandable cards for each category:
  - **Holdings** = Direct wallet holdings
  - **Protocol names** = LP positions grouped by DEX/protocol
- Each card shows total value and collapse/expand indicator (▲/▼)

### Two-Column Layout

#### Left Column: Token Holdings
```
┌─ Tokens ─────────────────────────┐
│                                  │
│  👤 Holdings              $7.89  │
│  ┌────────────────────────────┐  │
│  │ Asset        Balance Value │  │
│  │ ─────────────────────────  │  │
│  │ ≋ SOL        0.04982 $7.89 │  │
│  │   Solana                   │  │
│  │              $158.33       │  │
│  │              -1.92%        │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**Table Columns:**
- **Asset**: Token symbol + logo, chain name below
- **Balance**: Token amount
- **Price/24hΔ**: Current price + 24h change %
- **Value**: USD value

**Features:**
- Click row to see token details
- Sortable by any column
- Refresh button (refetch balances)

#### Right Column: LP Positions
```
┌─ LP Positions ───────────────────┐
│                                  │
│  🥞 PancakeSwap       $543.31    │
│  ┌────────────────────────────┐  │
│  │ 💧 LiquidityPool  $333.52  │  │
│  │                            │  │
│  │ Asset       Balance  Value │  │
│  │ ────────────────────────── │  │
│  │ ⓞⓈ ORE-wSOL           $332 │  │
│  │   0.4246 ORE              │  │
│  │   0.7786 wSOL             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

**Shows:**
- Grouped by protocol (PancakeSwap, Jupiter DAO, etc.)
- Each position card shows:
  - Pool pair name
  - Token amounts
  - Total value
- Expandable to show more details:
  - Uncollected fees (CLMM)
  - Price range (CLMM)
  - Pool share %

**Click actions:**
- Click position → Opens Liquidity View with that position loaded
- Hover → Shows "Manage Position" button

## API Calls

### On Load / Wallet Change

```typescript
// 1. Fetch wallets
GET /wallet
→ { wallets: [{ chain, network, address, isDefault }] }

// 2. Fetch token balances
GET /chains/{chain}/balances?network={network}&address={address}
→ { balances: { "SOL": 0.04982, "USDC": 100.5 } }

// 3. Fetch token prices (from external API or config)
// For now, could hardcode or fetch from CoinGecko

// 4. Fetch LP positions for each connector
GET /connectors/pancakeswap-sol/clmm/positions-owned?network={network}&walletAddress={address}
→ { positions: [{ address, poolAddress, baseTokenAmount, quoteTokenAmount, ... }] }

GET /connectors/raydium/clmm/positions-owned?network={network}&walletAddress={address}
→ { positions: [...] }

// Repeat for each connector
```

### Aggregation Logic

```typescript
// Group positions by connector
const positionsByConnector = {
  'pancakeswap-sol': [...positions],
  'raydium': [...positions],
  'meteora': [...positions],
};

// Calculate total values
const walletValue = calculateWalletValue(balances, prices);
const lpValue = calculateLPValue(allPositions, prices);
const totalValue = walletValue + lpValue;
```

## Component Breakdown

### PortfolioView.tsx (Wallet View)
```typescript
- useState: selectedWallet, selectedNetwork, balances, positions, loading
- useEffect: Fetch data when wallet/network changes
- Render: Header + Tabs (Tokens/LP Positions) + HoldingsSummary + TwoColumnLayout
```

### WalletSelector.tsx
```typescript
- Props: wallets[], selectedWallet, onSelect
- Dropdown with wallet addresses
- "Add Wallet" button → Opens AddWalletDialog
```

### NetworkSelector.tsx
```typescript
- Props: networks[], selectedNetwork, onSelect
- Dropdown with all supported networks
- Icons for each chain type (Ethereum logo, Solana logo, etc.)
```

### HoldingsSummary.tsx
```typescript
- Props: totalValue, categories[]
- Displays total value + expandable category cards
- Categories: [{ name, icon, value, expanded }]
```

### WalletHoldingsTable.tsx
```typescript
- Props: balances, prices, chain
- Table with Asset, Balance, Price/24hΔ, Value
- Sortable columns
- Refresh button
```

### LPPositionsList.tsx
```typescript
- Props: positions[], groupBy: 'connector'
- Groups positions by connector
- Each group shows protocol logo + total value
- Expandable cards for each position
```

### PositionCard.tsx
```typescript
- Props: position (PositionInfo from schema)
- Shows pool pair, token amounts, value
- "Manage" button → Navigate to Liquidity View
```

## State Management

```typescript
// AppContext.tsx
interface AppState {
  selectedWallet: string | null;
  selectedNetwork: string;
  wallets: Wallet[];
  setSelectedWallet: (address: string) => void;
  setSelectedNetwork: (network: string) => void;
}

// PortfolioView maintains local state for:
- balances: Record<string, number>
- positions: PositionInfo[]
- prices: Record<string, number>
- loading: boolean
```

## Interactions

### Add Wallet Flow
```
Click "Add Wallet" in dropdown
  ↓
Opens AddWalletDialog
  ↓
User selects chain/network
  ↓
User inputs private key OR imports seed phrase
  ↓
POST /wallet/add { chain, network, privateKey }
  ↓
Wallet added → Dropdown refreshes → Auto-select new wallet
```

### Refresh Balances
```
Click refresh icon
  ↓
Re-fetch all API calls
  ↓
Update state
  ↓
Show "Updated" toast notification
```

### View Position Details
```
Click position card
  ↓
Navigate to Liquidity View
  ↓
Pre-load that position's data
```

## Styling Notes

- **Dark theme**: Dark background (#0f1419), light text
- **Cards**: Slightly lighter bg (#1a1f2e), rounded corners
- **Hover effects**: Subtle highlight on cards
- **Icons**: Use emoji or SVG icons for tokens/protocols
- **Collapsible sections**: Smooth expand/collapse animations
- **Loading states**: Skeleton loaders for tables
- **Empty states**: "No holdings" / "No LP positions" with "Add wallet" CTA

## Future Enhancements (V2)

- [ ] Token logos from API
- [ ] Real-time price updates (WebSocket)
- [ ] Portfolio value chart (historical)
- [ ] P&L tracking
- [ ] Export to CSV
- [ ] Multi-wallet aggregated view
- [ ] Search/filter tokens
- [ ] Hide small balances option
