# Gateway Desktop App - Comprehensive Implementation Plan

## Executive Summary

This document outlines a comprehensive plan for building a **Gateway Desktop App** using Tauri v2, providing a user-friendly interface for interacting with the Gateway API server. The app will enable users to manage wallets, view portfolios, swap tokens, find and manage liquidity pools, and manage LP positions across multiple blockchains and DEXes.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Core Features & Implementation](#core-features--implementation)
5. [API Integration Strategy](#api-integration-strategy)
6. [State Management](#state-management)
7. [UI/UX Design System](#uiux-design-system)
8. [Development Phases](#development-phases)
9. [Testing Strategy](#testing-strategy)
10. [Build & Deployment](#build--deployment)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Gateway Desktop App                      │
│                        (Tauri v2)                            │
├──────────────────────┬──────────────────────────────────────┤
│   Frontend Layer     │         Backend Layer                │
│                      │                                      │
│  React 18 + TS       │    Rust + Tauri Framework           │
│  Vite Build Tool     │    - Native IPC                     │
│  TailwindCSS         │    - Wallet Security                │
│  shadcn/ui           │    - System Integration             │
│  Tanstack Query      │    - Background Tasks               │
│  Zustand             │                                     │
└──────────────────────┴──────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Gateway Server  │
                    │  (REST API)      │
                    │  Port: 15888     │
                    └──────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │                               │
        ┌─────▼─────┐                  ┌─────▼─────┐
        │ Ethereum  │                  │  Solana   │
        │   & EVM   │                  │           │
        │  Chains   │                  │  Chains   │
        └───────────┘                  └───────────┘
```

### Component Architecture

```
src/
├── App.tsx                    # Root component with routing
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx      # Main layout with navigation
│   │   ├── Header.tsx         # Top navigation bar
│   │   ├── Sidebar.tsx        # Left sidebar navigation
│   │   └── Footer.tsx         # Status bar footer
│   ├── common/
│   │   ├── Button.tsx         # shadcn/ui button variants
│   │   ├── Card.tsx           # Card containers
│   │   ├── Input.tsx          # Form inputs
│   │   ├── Select.tsx         # Dropdown selects
│   │   ├── Dialog.tsx         # Modal dialogs
│   │   ├── Table.tsx          # Data tables
│   │   ├── Tabs.tsx           # Tab navigation
│   │   ├── Toast.tsx          # Notifications
│   │   └── Spinner.tsx        # Loading indicators
│   ├── portfolio/
│   │   ├── WalletCard.tsx
│   │   ├── BalanceTable.tsx
│   │   ├── TokenList.tsx
│   │   ├── AddWalletDialog.tsx
│   │   └── NetworkSelector.tsx
│   ├── pools/
│   │   ├── PoolList.tsx
│   │   ├── PoolCard.tsx
│   │   ├── PoolSearch.tsx
│   │   ├── PositionCard.tsx
│   │   └── AddPoolDialog.tsx
│   ├── swap/
│   │   ├── SwapWidget.tsx
│   │   ├── TokenSelector.tsx
│   │   ├── SlippageSettings.tsx
│   │   ├── SwapPreview.tsx
│   │   └── SwapHistory.tsx
│   └── liquidity/
│       ├── LiquidityManager.tsx
│       ├── AddLiquidityForm.tsx
│       ├── RemoveLiquidityForm.tsx
│       ├── PositionDetails.tsx
│       ├── CLMMPositionForm.tsx
│       └── FeeCollector.tsx
├── views/
│   ├── PortfolioView.tsx      # Portfolio management view
│   ├── PoolsView.tsx          # Pool discovery & management
│   ├── SwapView.tsx           # Token swap interface
│   └── LiquidityView.tsx      # LP position management
├── services/
│   ├── api/
│   │   ├── gateway.ts         # Main Gateway API client
│   │   ├── chains.ts          # Chain-specific endpoints
│   │   ├── connectors.ts      # DEX connector endpoints
│   │   ├── wallets.ts         # Wallet management
│   │   ├── pools.ts           # Pool operations
│   │   └── config.ts          # Config endpoints
│   └── types/
│       ├── chains.ts          # Chain types
│       ├── connectors.ts      # Connector types
│       ├── pools.ts           # Pool types
│       └── wallet.ts          # Wallet types
├── hooks/
│   ├── useWallets.ts          # Wallet management hook
│   ├── useBalances.ts         # Balance fetching hook
│   ├── usePools.ts            # Pool data hook
│   ├── useSwap.ts             # Swap execution hook
│   ├── useLiquidity.ts        # Liquidity operations hook
│   └── useNetworks.ts         # Network configuration hook
├── store/
│   ├── walletStore.ts         # Wallet state
│   ├── networkStore.ts        # Selected network state
│   ├── poolStore.ts           # Pool cache
│   └── uiStore.ts             # UI preferences
├── lib/
│   ├── utils.ts               # Utility functions
│   ├── format.ts              # Number/token formatting
│   └── validation.ts          # Input validation
└── styles/
    └── globals.css            # Global styles + Tailwind
```

---

## Technology Stack

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.3+ | UI framework |
| **TypeScript** | 5.6+ | Type safety |
| **Vite** | 6.0+ | Build tool & dev server |
| **TailwindCSS** | 3.4+ | Utility-first CSS framework |
| **shadcn/ui** | Latest | Pre-built UI components |
| **Radix UI** | Latest | Accessible primitives (via shadcn) |
| **Tanstack Query** | 5.0+ | Server state management & caching |
| **Zustand** | 4.5+ | Client state management |
| **React Router** | 6.20+ | Client-side routing |
| **Recharts** | 2.10+ | Data visualization for portfolio |
| **date-fns** | 3.0+ | Date formatting |
| **class-variance-authority** | Latest | Component variants |
| **clsx** | Latest | Conditional classnames |
| **tailwind-merge** | Latest | Merge Tailwind classes |

### Backend Stack (Tauri)

| Technology | Version | Purpose |
|------------|---------|---------|
| **Rust** | 1.75+ | Native backend |
| **Tauri** | 2.0+ | Desktop framework |
| **serde** | 1.0+ | JSON serialization |
| **reqwest** | 0.11+ | HTTP client for Gateway API |
| **tokio** | 1.35+ | Async runtime |

### Development Tools

| Tool | Purpose |
|------|---------|
| **pnpm** | Package manager (reuse from Gateway repo) |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **TypeScript ESLint** | TypeScript linting |
| **Vitest** | Unit testing |
| **Playwright** | E2E testing |

---

## Project Structure

### Directory Layout

```
gateway-app/                    # New directory in gateway repo
├── src/                        # React frontend
│   ├── components/
│   ├── views/
│   ├── services/
│   ├── hooks/
│   ├── store/
│   ├── lib/
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── gateway_client.rs  # Gateway API client
│   │   └── commands.rs        # Tauri commands
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
├── public/
│   └── icons/                  # App icons
├── components.json             # shadcn/ui config
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
├── package.json
└── README.md
```

### Integration with Gateway Repo

The app will be located in a new `gateway-app/` directory within the existing Gateway repository:

```
/Users/feng/gateway/
├── src/                        # Existing Gateway server code
├── test/
├── conf/
├── gateway-app/                # NEW: Desktop app
│   ├── src/
│   ├── src-tauri/
│   └── package.json
├── package.json                # Root package.json (existing)
└── pnpm-workspace.yaml         # NEW: pnpm workspace config
```

**Benefits:**
- Share pnpm installation and lock file
- Easy cross-referencing of API types
- Unified development workflow
- Shared development dependencies where applicable

---

## Core Features & Implementation

### 1. Portfolio View

**Purpose:** Connect wallets, view balances, manage tokens across chains

#### Key Components

1. **WalletCard.tsx**
   - Display wallet address (truncated)
   - Show default wallet indicator
   - Network badge
   - Copy address button
   - Set as default action
   - Remove wallet action

2. **BalanceTable.tsx**
   - Columns: Token, Symbol, Balance, USD Value
   - Sortable by balance/value
   - Search/filter tokens
   - Refresh button with loading state

3. **TokenList.tsx**
   - Display available tokens for network
   - Add custom token dialog
   - Token metadata (symbol, name, decimals, address)

4. **AddWalletDialog.tsx**
   - Select chain/network
   - Input private key (encrypted storage via Tauri)
   - Generate new wallet option
   - Import from seed phrase
   - Hardware wallet support (future)

5. **NetworkSelector.tsx**
   - Dropdown with all supported networks
   - Ethereum (mainnet, testnet)
   - Solana (mainnet-beta, devnet)
   - Other EVM chains (BSC, Polygon, Arbitrum, etc.)

#### API Integration

```typescript
// Get all wallets
GET /wallet
Response: {
  wallets: [{
    chain: "ethereum",
    network: "mainnet",
    address: "0x...",
    isDefault: true
  }]
}

// Add wallet
POST /wallet/add
Body: {
  chain: "ethereum",
  network: "mainnet",
  privateKey: "0x..."
}

// Get balances
GET /chains/{chain}/balances?network=mainnet&address=0x...&tokens=ETH,USDC
Response: {
  balances: {
    "ETH": 1.5,
    "USDC": 1000.0
  }
}

// Get token list
GET /chains/{chain}/tokens?network=mainnet
Response: {
  tokens: [{
    symbol: "ETH",
    name: "Ethereum",
    address: "0x...",
    decimals: 18
  }]
}
```

#### State Management

```typescript
// store/walletStore.ts
interface WalletStore {
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  selectedNetwork: string;
  addWallet: (wallet: Wallet) => void;
  removeWallet: (address: string) => void;
  setDefaultWallet: (address: string, chain: string) => void;
  setSelectedNetwork: (network: string) => void;
}

// hooks/useBalances.ts
const useBalances = (chain: string, network: string, address: string) => {
  return useQuery({
    queryKey: ['balances', chain, network, address],
    queryFn: () => fetchBalances(chain, network, address),
    refetchInterval: 30000, // Refresh every 30s
  });
};
```

---

### 2. Pools View

**Purpose:** Discover pools, view pool information, see user positions

#### Key Components

1. **PoolSearch.tsx**
   - Network selector
   - Connector filter (Uniswap, Raydium, Meteora, etc.)
   - Token pair input (tokenA/tokenB)
   - Search button

2. **PoolList.tsx**
   - Grid/List view toggle
   - Pool cards with:
     - Pool address
     - Token pair (symbols + logos)
     - TVL (if available)
     - Fee tier
     - APR (if available)
   - Pagination
   - "View Details" button

3. **PoolCard.tsx**
   - Token pair display with logos
   - Pool address (truncated with copy)
   - Current price
   - Fee percentage
   - Liquidity amounts
   - "Add to My Pools" button
   - "Open Position" button (navigate to LP view)

4. **PositionCard.tsx**
   - Show user's LP positions
   - Token amounts in position
   - Current value
   - Uncollected fees (CLMM)
   - Price range (CLMM)
   - "Manage Position" button

5. **AddPoolDialog.tsx**
   - Select connector
   - Select network
   - Input pool address
   - Fetch pool info from API
   - Save to user's pool list

#### API Integration

```typescript
// Find pools by token pair
GET /pools/find?network=mainnet-beta&connector=raydium&tokenA=SOL&tokenB=USDC
Response: {
  pools: [{
    connector: "raydium",
    type: "clmm",
    network: "mainnet-beta",
    address: "...",
    baseSymbol: "SOL",
    quoteSymbol: "USDC",
    baseTokenAddress: "...",
    quoteTokenAddress: "...",
    feePct: 0.25
  }]
}

// Get pool info
GET /connectors/{connector}/{type}/pool-info?network=mainnet-beta&poolAddress=...
Response: {
  address: "...",
  baseTokenAddress: "...",
  quoteTokenAddress: "...",
  feePct: 0.25,
  price: 150.5,
  baseTokenAmount: 1000,
  quoteTokenAmount: 150000
}

// Get user positions (CLMM)
GET /connectors/{connector}/clmm/positions-owned?network=mainnet-beta&walletAddress=...
Response: {
  positions: [{
    address: "...",
    poolAddress: "...",
    baseTokenAmount: 10,
    quoteTokenAmount: 1500,
    baseFeeAmount: 0.1,
    quoteFeeAmount: 15
  }]
}

// List saved pools
GET /pools/list?network=mainnet-beta&connector=raydium
Response: {
  pools: [...]
}

// Add pool to saved list
POST /pools
Body: {
  connector: "raydium",
  type: "clmm",
  network: "mainnet-beta",
  address: "..."
}
```

#### State Management

```typescript
// store/poolStore.ts
interface PoolStore {
  savedPools: Pool[];
  searchResults: Pool[];
  selectedPool: Pool | null;
  addPool: (pool: Pool) => void;
  removePool: (address: string) => void;
  setSelectedPool: (pool: Pool) => void;
}

// hooks/usePools.ts
const usePoolSearch = (connector: string, network: string, tokenA: string, tokenB: string) => {
  return useQuery({
    queryKey: ['pools', 'search', connector, network, tokenA, tokenB],
    queryFn: () => findPools(connector, network, tokenA, tokenB),
    enabled: !!tokenA && !!tokenB,
  });
};

const usePositions = (connector: string, network: string, walletAddress: string) => {
  return useQuery({
    queryKey: ['positions', connector, network, walletAddress],
    queryFn: () => fetchPositions(connector, network, walletAddress),
    refetchInterval: 60000,
  });
};
```

---

### 3. Swap View

**Purpose:** Execute token swaps across DEX aggregators and connectors

#### Key Components

1. **SwapWidget.tsx**
   - Network selector
   - Connector selector (Jupiter, 0x, Uniswap Router, etc.)
   - Token input (From)
   - Token input (To)
   - Swap direction toggle
   - Amount input
   - Balance display
   - "Max" button
   - Slippage settings
   - "Get Quote" button
   - Quote display
   - "Execute Swap" button
   - Transaction status

2. **TokenSelector.tsx**
   - Modal with token list
   - Search functionality
   - Token logo + symbol + name
   - Balance display
   - Common tokens section
   - Recent tokens

3. **SlippageSettings.tsx**
   - Preset buttons (0.1%, 0.5%, 1%, 3%)
   - Custom input
   - Warning for high slippage

4. **SwapPreview.tsx**
   - Quote details:
     - Exchange rate
     - Minimum received
     - Price impact
     - Fee estimate
   - Route visualization (if available)
   - Confirm button

5. **SwapHistory.tsx**
   - List of recent swaps
   - Transaction hash
   - Status (pending/confirmed/failed)
   - Amounts in/out
   - Timestamp
   - "View on Explorer" link

#### API Integration

```typescript
// Quote swap (Router-based)
POST /connectors/{connector}/router/quote-swap
Body: {
  network: "mainnet",
  baseToken: "ETH",
  quoteToken: "USDC",
  amount: 1.0,
  side: "SELL",
  slippagePct: 0.5
}
Response: {
  quoteId: "...",
  tokenIn: "0x...",
  tokenOut: "0x...",
  amountIn: 1.0,
  amountOut: 3000.0,
  price: 3000.0,
  priceImpactPct: 0.1,
  minAmountOut: 2985.0,
  maxAmountIn: 1.005
}

// Execute swap
POST /connectors/{connector}/router/execute-swap
Body: {
  network: "mainnet",
  walletAddress: "0x...",
  baseToken: "ETH",
  quoteToken: "USDC",
  amount: 1.0,
  side: "SELL",
  slippagePct: 0.5
}
Response: {
  signature: "0x...",
  status: 0 (PENDING),
  data: {
    tokenIn: "0x...",
    tokenOut: "0x...",
    amountIn: 1.0,
    amountOut: 2998.5,
    fee: 0.001
  }
}

// Poll transaction
GET /chains/{chain}/poll?network=mainnet&signature=0x...
Response: {
  status: 1 (CONFIRMED),
  blockNumber: 12345678
}
```

#### User Flow

1. User selects network and connector
2. User selects tokens (from/to)
3. User enters amount
4. User clicks "Get Quote"
5. App displays quote with price impact, min received, etc.
6. User adjusts slippage if needed
7. User clicks "Execute Swap"
8. App shows transaction pending
9. App polls for confirmation
10. App shows success/failure notification

#### State Management

```typescript
// hooks/useSwap.ts
const useSwap = () => {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);

  const getQuote = useMutation({
    mutationFn: (params: QuoteParams) => fetchQuote(params),
    onSuccess: (data) => setQuote(data),
  });

  const executeSwap = useMutation({
    mutationFn: (params: SwapParams) => executeSwapTx(params),
    onSuccess: (data) => {
      // Poll for transaction confirmation
      pollTransaction(data.signature);
    },
  });

  return { quote, getQuote, executeSwap, isQuoting, isSwapping };
};
```

---

### 4. Liquidity (LP) View

**Purpose:** Manage liquidity positions in AMM and CLMM pools

#### Key Components

1. **LiquidityManager.tsx**
   - Pool selector (from saved pools)
   - Position overview
   - Add/Remove liquidity tabs
   - Collect fees button (CLMM)
   - Position history

2. **AddLiquidityForm.tsx (AMM)**
   - Pool info display
   - Base token amount input
   - Quote token amount input
   - Balance displays
   - Auto-calculate ratio
   - Slippage tolerance
   - "Add Liquidity" button

3. **CLMMPositionForm.tsx (CLMM)**
   - Pool info display
   - Price range selector (min/max)
   - Current price indicator
   - Liquidity amount input
   - Token ratio visualization
   - "Open Position" button

4. **RemoveLiquidityForm.tsx**
   - Position selector
   - Percentage slider (0-100%)
   - Estimated token amounts
   - "Remove Liquidity" button

5. **PositionDetails.tsx (CLMM)**
   - Position NFT address
   - Token amounts
   - Price range (min/max)
   - Current price
   - In-range indicator
   - Uncollected fees
   - Earned rewards (if applicable)
   - "Add Liquidity" button
   - "Remove Liquidity" button
   - "Collect Fees" button
   - "Close Position" button

6. **FeeCollector.tsx (CLMM)**
   - List of positions with uncollected fees
   - Fee amounts per position
   - "Collect All" button
   - Individual collect buttons

#### API Integration

##### AMM Operations

```typescript
// Get pool info (AMM)
GET /connectors/{connector}/amm/pool-info?network=mainnet-beta&poolAddress=...
Response: {
  address: "...",
  baseTokenAddress: "...",
  quoteTokenAddress: "...",
  feePct: 0.3,
  price: 150.0,
  baseTokenAmount: 1000,
  quoteTokenAmount: 150000
}

// Quote add liquidity (AMM)
POST /connectors/{connector}/amm/quote-liquidity
Body: {
  network: "mainnet-beta",
  poolAddress: "...",
  baseTokenAmount: 10,
  quoteTokenAmount: 1500,
  slippagePct: 1.0
}
Response: {
  baseLimited: true,
  baseTokenAmount: 10,
  quoteTokenAmount: 1500,
  baseTokenAmountMax: 10.1,
  quoteTokenAmountMax: 1515
}

// Add liquidity (AMM)
POST /connectors/{connector}/amm/add-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  poolAddress: "...",
  baseTokenAmount: 10,
  quoteTokenAmount: 1500,
  slippagePct: 1.0
}
Response: {
  signature: "...",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountAdded: 10,
    quoteTokenAmountAdded: 1500
  }
}

// Remove liquidity (AMM)
POST /connectors/{connector}/amm/remove-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  poolAddress: "...",
  percentageToRemove: 50
}
Response: {
  signature: "...",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountRemoved: 5,
    quoteTokenAmountRemoved: 750
  }
}
```

##### CLMM Operations

```typescript
// Get pool info (CLMM)
GET /connectors/{connector}/clmm/pool-info?network=mainnet-beta&poolAddress=...
Response: {
  address: "...",
  baseTokenAddress: "...",
  quoteTokenAddress: "...",
  feePct: 0.25,
  price: 150.0,
  baseTokenAmount: 1000,
  quoteTokenAmount: 150000,
  activeBinId: 50
}

// Get positions owned (CLMM)
GET /connectors/{connector}/clmm/positions-owned?network=mainnet-beta&walletAddress=...
Response: {
  positions: [{
    address: "...",
    poolAddress: "...",
    baseTokenAddress: "...",
    quoteTokenAddress: "...",
    baseTokenAmount: 10,
    quoteTokenAmount: 1500,
    baseFeeAmount: 0.1,
    quoteFeeAmount: 15,
    lowerBinId: 45,
    upperBinId: 55,
    lowerPrice: 140,
    upperPrice: 160,
    price: 150
  }]
}

// Open position (CLMM)
POST /connectors/{connector}/clmm/open-position
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  poolAddress: "...",
  lowerPrice: 140,
  upperPrice: 160,
  baseTokenAmount: 10,
  quoteTokenAmount: 1500,
  slippagePct: 1.0
}
Response: {
  signature: "...",
  status: 0,
  data: {
    positionAddress: "...",
    fee: 0.001,
    baseTokenAmountAdded: 10,
    quoteTokenAmountAdded: 1500
  }
}

// Add liquidity to position (CLMM)
POST /connectors/{connector}/clmm/add-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  positionAddress: "...",
  baseTokenAmount: 5,
  quoteTokenAmount: 750,
  slippagePct: 1.0
}
Response: {
  signature: "...",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountAdded: 5,
    quoteTokenAmountAdded: 750
  }
}

// Remove liquidity from position (CLMM)
POST /connectors/{connector}/clmm/remove-liquidity
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  positionAddress: "...",
  percentageToRemove: 50
}
Response: {
  signature: "...",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountRemoved: 5,
    quoteTokenAmountRemoved: 750
  }
}

// Collect fees (CLMM)
POST /connectors/{connector}/clmm/collect-fees
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  positionAddress: "..."
}
Response: {
  signature: "...",
  status: 0,
  data: {
    fee: 0.001,
    baseFeeAmount: 0.1,
    quoteFeeAmount: 15
  }
}

// Close position (CLMM)
POST /connectors/{connector}/clmm/close-position
Body: {
  network: "mainnet-beta",
  walletAddress: "...",
  positionAddress: "..."
}
Response: {
  signature: "...",
  status: 0,
  data: {
    fee: 0.001,
    baseTokenAmountRemoved: 10,
    quoteTokenAmountRemoved: 1500,
    baseFeeAmount: 0.1,
    quoteFeeAmount: 15
  }
}
```

#### State Management

```typescript
// hooks/useLiquidity.ts
const useLiquidity = (connector: string, type: 'amm' | 'clmm') => {
  const addLiquidity = useMutation({
    mutationFn: (params: AddLiquidityParams) =>
      type === 'amm' ? addAMMLiquidity(params) : openCLMMPosition(params),
  });

  const removeLiquidity = useMutation({
    mutationFn: (params: RemoveLiquidityParams) =>
      type === 'amm' ? removeAMMLiquidity(params) : removeCLMMLiquidity(params),
  });

  const collectFees = useMutation({
    mutationFn: (params: CollectFeesParams) => collectCLMMFees(params),
    enabled: type === 'clmm',
  });

  return { addLiquidity, removeLiquidity, collectFees };
};
```

---

## API Integration Strategy

### Base API Client

```typescript
// services/api/gateway.ts
import axios, { AxiosInstance } from 'axios';

class GatewayClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string = 'http://localhost:15888') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[API Error]', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}

export const gatewayClient = new GatewayClient();
```

### Service Modules

```typescript
// services/api/chains.ts
export const chainService = {
  async getBalances(chain: string, network: string, address: string, tokens?: string[]) {
    return gatewayClient.get(`/chains/${chain}/balances`, {
      network,
      address,
      tokens: tokens?.join(','),
    });
  },

  async getTokens(chain: string, network: string, symbols?: string[]) {
    return gatewayClient.get(`/chains/${chain}/tokens`, {
      network,
      tokenSymbols: symbols?.join(','),
    });
  },

  async pollTransaction(chain: string, network: string, signature: string) {
    return gatewayClient.get(`/chains/${chain}/poll`, {
      network,
      signature,
    });
  },

  async estimateGas(chain: string, network: string) {
    return gatewayClient.get(`/chains/${chain}/estimate-gas`, { network });
  },
};

// services/api/wallets.ts
export const walletService = {
  async getWallets() {
    return gatewayClient.get('/wallet');
  },

  async addWallet(chain: string, network: string, privateKey: string) {
    return gatewayClient.post('/wallet/add', {
      chain,
      network,
      privateKey,
    });
  },

  async removeWallet(address: string, chain: string) {
    return gatewayClient.delete(`/wallet?address=${address}&chain=${chain}`);
  },

  async setDefault(address: string, chain: string, network: string) {
    return gatewayClient.post('/wallet/setDefault', {
      address,
      chain,
      network,
    });
  },
};

// services/api/pools.ts
export const poolService = {
  async findPools(network: string, connector: string, tokenA?: string, tokenB?: string) {
    return gatewayClient.get('/pools/find', {
      network,
      connector,
      tokenA,
      tokenB,
    });
  },

  async listPools(network: string, connector?: string) {
    return gatewayClient.get('/pools/list', { network, connector });
  },

  async getPool(network: string, connector: string, address: string) {
    return gatewayClient.get('/pools/get', { network, connector, address });
  },

  async addPool(connector: string, type: string, network: string, address: string) {
    return gatewayClient.post('/pools', {
      connector,
      type,
      network,
      address,
    });
  },

  async removePool(network: string, connector: string, address: string) {
    return gatewayClient.delete(`/pools?network=${network}&connector=${connector}&address=${address}`);
  },
};

// services/api/connectors.ts
export const connectorService = {
  // Router operations
  async quoteSwap(connector: string, params: QuoteSwapParams) {
    return gatewayClient.post(`/connectors/${connector}/router/quote-swap`, params);
  },

  async executeSwap(connector: string, params: ExecuteSwapParams) {
    return gatewayClient.post(`/connectors/${connector}/router/execute-swap`, params);
  },

  // AMM operations
  async getAMMPoolInfo(connector: string, network: string, poolAddress: string) {
    return gatewayClient.get(`/connectors/${connector}/amm/pool-info`, {
      network,
      poolAddress,
    });
  },

  async quoteLiquidity(connector: string, params: QuoteLiquidityParams) {
    return gatewayClient.post(`/connectors/${connector}/amm/quote-liquidity`, params);
  },

  async addLiquidity(connector: string, params: AddLiquidityParams) {
    return gatewayClient.post(`/connectors/${connector}/amm/add-liquidity`, params);
  },

  async removeLiquidity(connector: string, params: RemoveLiquidityParams) {
    return gatewayClient.post(`/connectors/${connector}/amm/remove-liquidity`, params);
  },

  // CLMM operations
  async getCLMMPoolInfo(connector: string, network: string, poolAddress: string) {
    return gatewayClient.get(`/connectors/${connector}/clmm/pool-info`, {
      network,
      poolAddress,
    });
  },

  async getPositionsOwned(connector: string, network: string, walletAddress: string) {
    return gatewayClient.get(`/connectors/${connector}/clmm/positions-owned`, {
      network,
      walletAddress,
    });
  },

  async openPosition(connector: string, params: OpenPositionParams) {
    return gatewayClient.post(`/connectors/${connector}/clmm/open-position`, params);
  },

  async addCLMMLiquidity(connector: string, params: AddCLMMLiquidityParams) {
    return gatewayClient.post(`/connectors/${connector}/clmm/add-liquidity`, params);
  },

  async removeCLMMLiquidity(connector: string, params: RemoveCLMMLiquidityParams) {
    return gatewayClient.post(`/connectors/${connector}/clmm/remove-liquidity`, params);
  },

  async collectFees(connector: string, params: CollectFeesParams) {
    return gatewayClient.post(`/connectors/${connector}/clmm/collect-fees`, params);
  },

  async closePosition(connector: string, params: ClosePositionParams) {
    return gatewayClient.post(`/connectors/${connector}/clmm/close-position`, params);
  },
};
```

### React Query Integration

```typescript
// hooks/useWallets.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { walletService } from '@/services/api/wallets';

export const useWallets = () => {
  const queryClient = useQueryClient();

  const { data: wallets, isLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: walletService.getWallets,
  });

  const addWallet = useMutation({
    mutationFn: (params: AddWalletParams) => walletService.addWallet(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });

  const removeWallet = useMutation({
    mutationFn: (params: { address: string; chain: string }) =>
      walletService.removeWallet(params.address, params.chain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });

  return { wallets, isLoading, addWallet, removeWallet };
};
```

---

## State Management

### Zustand Stores

#### 1. Wallet Store

```typescript
// store/walletStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WalletState {
  selectedWallet: string | null;
  selectedNetwork: string;
  setSelectedWallet: (address: string) => void;
  setSelectedNetwork: (network: string) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      selectedWallet: null,
      selectedNetwork: 'mainnet',
      setSelectedWallet: (address) => set({ selectedWallet: address }),
      setSelectedNetwork: (network) => set({ selectedNetwork: network }),
    }),
    {
      name: 'wallet-storage',
    }
  )
);
```

#### 2. Pool Store

```typescript
// store/poolStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PoolState {
  savedPools: Pool[];
  selectedPool: Pool | null;
  addPool: (pool: Pool) => void;
  removePool: (address: string) => void;
  setSelectedPool: (pool: Pool | null) => void;
}

export const usePoolStore = create<PoolState>()(
  persist(
    (set) => ({
      savedPools: [],
      selectedPool: null,
      addPool: (pool) =>
        set((state) => ({ savedPools: [...state.savedPools, pool] })),
      removePool: (address) =>
        set((state) => ({
          savedPools: state.savedPools.filter((p) => p.address !== address),
        })),
      setSelectedPool: (pool) => set({ selectedPool: pool }),
    }),
    {
      name: 'pool-storage',
    }
  )
);
```

#### 3. UI Store

```typescript
// store/uiStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  theme: 'light' | 'dark';
  slippageTolerance: number;
  toggleTheme: () => void;
  setSlippageTolerance: (value: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      slippageTolerance: 0.5,
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setSlippageTolerance: (value) => set({ slippageTolerance: value }),
    }),
    {
      name: 'ui-storage',
    }
  )
);
```

---

## UI/UX Design System

### shadcn/ui Component Library

We'll use shadcn/ui for accessible, customizable components:

#### Installation

```bash
npx shadcn-ui@latest init
```

#### Components to Install

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add select
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add table
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add slider
npx shadcn-ui@latest add switch
npx shadcn-ui@latest add skeleton
```

### Color Palette (Dark Theme)

```css
/* styles/globals.css */
@layer base {
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
    --success: 142.1 76.2% 36.3%;
    --warning: 38 92% 50%;
  }
}
```

### Typography

```typescript
// tailwind.config.js
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

### Layout

```
┌────────────────────────────────────────────────────────┐
│  Header (Network | Wallet Selector | Settings)         │
├───────────┬────────────────────────────────────────────┤
│           │                                            │
│  Sidebar  │             Main Content Area              │
│           │                                            │
│ Portfolio │   ┌──────────────────────────────────┐    │
│ Pools     │   │                                  │    │
│ Swap      │   │        View-specific content     │    │
│ Liquidity │   │                                  │    │
│           │   └──────────────────────────────────┘    │
│           │                                            │
└───────────┴────────────────────────────────────────────┘
```

---

## Development Phases

### Phase 1: Foundation (Week 1-2)

**Goals:**
- Set up project structure
- Configure build tools
- Implement base architecture

**Tasks:**
1. Create `gateway-app/` directory in Gateway repo
2. Initialize Tauri project
3. Set up Vite + React + TypeScript
4. Configure TailwindCSS
5. Install shadcn/ui
6. Set up pnpm workspace
7. Create base layout components (Header, Sidebar, Footer)
8. Implement routing with React Router
9. Create API client foundation
10. Set up Zustand stores
11. Configure Tanstack Query

**Deliverables:**
- Working app skeleton with navigation
- API client ready for integration
- State management configured

---

### Phase 2: Portfolio View (Week 3)

**Goals:**
- Implement wallet management
- Display balances
- Token management

**Tasks:**
1. Create WalletCard component
2. Implement AddWalletDialog
3. Integrate wallet API endpoints
4. Create BalanceTable component
5. Implement balance fetching with auto-refresh
6. Create TokenList component
7. Add token search/filter
8. Implement network selector
9. Create wallet removal functionality
10. Implement set default wallet

**Deliverables:**
- Fully functional Portfolio view
- Wallet management working
- Balance display with auto-refresh

---

### Phase 3: Pools View (Week 4)

**Goals:**
- Pool discovery
- View pool information
- Save pools
- Display user positions

**Tasks:**
1. Create PoolSearch component
2. Implement pool search by token pair
3. Create PoolList component with grid/list views
4. Implement PoolCard component
5. Create AddPoolDialog
6. Integrate pool API endpoints
7. Create PositionCard component
8. Implement positions-owned fetching
9. Add pool filtering by connector/network
10. Implement pool detail view

**Deliverables:**
- Pool search and discovery working
- Saved pools management
- Position viewing

---

### Phase 4: Swap View (Week 5)

**Goals:**
- Token swap interface
- Quote fetching
- Swap execution
- Transaction monitoring

**Tasks:**
1. Create SwapWidget component
2. Implement TokenSelector
3. Create amount input with validation
4. Implement quote fetching
5. Create SwapPreview component
6. Add SlippageSettings
7. Implement swap execution
8. Create transaction polling
9. Add SwapHistory component
10. Implement transaction notifications

**Deliverables:**
- Fully functional swap interface
- Quote and execution working
- Transaction monitoring

---

### Phase 5: Liquidity View (Week 6-7)

**Goals:**
- AMM liquidity management
- CLMM position management
- Fee collection

**Tasks:**
1. Create LiquidityManager component
2. Implement AddLiquidityForm (AMM)
3. Create RemoveLiquidityForm (AMM)
4. Implement liquidity ratio calculation
5. Create CLMMPositionForm
6. Implement price range selector
7. Create PositionDetails component
8. Implement add/remove CLMM liquidity
9. Create FeeCollector component
10. Implement collect fees functionality
11. Add close position functionality

**Deliverables:**
- AMM liquidity management complete
- CLMM position management complete
- Fee collection working

---

### Phase 6: Polish & Testing (Week 8)

**Goals:**
- UI/UX refinements
- Testing
- Bug fixes
- Documentation

**Tasks:**
1. Comprehensive testing of all features
2. Fix identified bugs
3. UI/UX improvements based on testing
4. Add loading states
5. Improve error handling
6. Add user guidance/tooltips
7. Create user documentation
8. Performance optimization
9. Accessibility improvements
10. Final polish

**Deliverables:**
- Production-ready app
- Comprehensive test coverage
- User documentation

---

## Testing Strategy

### Unit Testing

**Framework:** Vitest

```typescript
// __tests__/components/SwapWidget.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SwapWidget } from '@/components/swap/SwapWidget';

describe('SwapWidget', () => {
  it('should render token inputs', () => {
    render(<SwapWidget />);
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('should validate amount input', () => {
    render(<SwapWidget />);
    const input = screen.getByPlaceholderText('0.0');
    fireEvent.change(input, { target: { value: 'invalid' } });
    expect(screen.getByText('Invalid amount')).toBeInTheDocument();
  });
});
```

### Integration Testing

**Framework:** Vitest + MSW (Mock Service Worker)

```typescript
// __tests__/integration/swap.test.tsx
import { setupServer } from 'msw/node';
import { rest } from 'msw';

const server = setupServer(
  rest.post('/connectors/jupiter/router/quote-swap', (req, res, ctx) => {
    return res(ctx.json({
      quoteId: 'test-quote-id',
      amountOut: 1000,
      // ...
    }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Swap Integration', () => {
  it('should fetch quote and display results', async () => {
    // Test implementation
  });
});
```

### E2E Testing

**Framework:** Playwright

```typescript
// e2e/swap.spec.ts
import { test, expect } from '@playwright/test';

test('complete swap flow', async ({ page }) => {
  await page.goto('http://localhost:1420');

  // Navigate to Swap view
  await page.click('text=Swap');

  // Select tokens
  await page.click('[data-testid="from-token-selector"]');
  await page.click('text=ETH');
  await page.click('[data-testid="to-token-selector"]');
  await page.click('text=USDC');

  // Enter amount
  await page.fill('[data-testid="amount-input"]', '1.0');

  // Get quote
  await page.click('text=Get Quote');

  // Wait for quote to load
  await expect(page.locator('[data-testid="quote-display"]')).toBeVisible();

  // Execute swap
  await page.click('text=Execute Swap');

  // Verify transaction initiated
  await expect(page.locator('text=Transaction Pending')).toBeVisible();
});
```

---

## Build & Deployment

### Development

```bash
# Install dependencies
pnpm install

# Start Gateway server (in separate terminal)
cd /Users/feng/gateway
pnpm build
pnpm start --passphrase=<PASSPHRASE> --dev

# Start Gateway App
cd /Users/feng/gateway/gateway-app
pnpm tauri dev
```

### Production Build

```bash
# Build for production
cd /Users/feng/gateway/gateway-app
pnpm tauri build

# Output:
# macOS: src-tauri/target/release/bundle/macos/Gateway.app
# Windows: src-tauri/target/release/bundle/msi/Gateway.msi
# Linux: src-tauri/target/release/bundle/appimage/gateway.AppImage
```

### Configuration

```json
// src-tauri/tauri.conf.json
{
  "productName": "Gateway",
  "version": "1.0.0",
  "identifier": "com.gateway.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Gateway",
        "width": 1400,
        "height": 900,
        "minWidth": 1200,
        "minHeight": 700,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://localhost:15888"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

---

## Security Considerations

### Wallet Security

1. **Private Key Storage:**
   - Private keys encrypted using Tauri's secure storage
   - Never store unencrypted keys
   - Use system keychain when available

2. **API Communication:**
   - Only allow connections to localhost Gateway server
   - Validate all API responses
   - Implement request signing for sensitive operations

3. **Transaction Signing:**
   - Always show transaction preview before signing
   - Display all transaction details (amount, recipient, fees)
   - Implement transaction limits with user confirmation

### Rust Backend Security

```rust
// src-tauri/src/lib.rs
use tauri::Manager;

#[tauri::command]
async fn get_private_key(app: tauri::AppHandle, address: String) -> Result<String, String> {
    // Retrieve from secure storage
    app.state::<SecureStorage>()
        .get_private_key(&address)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn store_private_key(
    app: tauri::AppHandle,
    address: String,
    private_key: String,
) -> Result<(), String> {
    // Encrypt and store
    app.state::<SecureStorage>()
        .store_private_key(&address, &private_key)
        .map_err(|e| e.to_string())
}
```

---

## Performance Optimization

### 1. Code Splitting

```typescript
// App.tsx
import { lazy, Suspense } from 'react';

const PortfolioView = lazy(() => import('./views/PortfolioView'));
const PoolsView = lazy(() => import('./views/PoolsView'));
const SwapView = lazy(() => import('./views/SwapView'));
const LiquidityView = lazy(() => import('./views/LiquidityView'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/portfolio" element={<PortfolioView />} />
        <Route path="/pools" element={<PoolsView />} />
        <Route path="/swap" element={<SwapView />} />
        <Route path="/liquidity" element={<LiquidityView />} />
      </Routes>
    </Suspense>
  );
}
```

### 2. Query Caching

```typescript
// Configure React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      cacheTime: 300000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

### 3. Virtual Scrolling

For large lists (tokens, pools), use virtual scrolling:

```bash
pnpm add @tanstack/react-virtual
```

```typescript
// components/pools/PoolList.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function PoolList({ pools }: { pools: Pool[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: pools.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => (
          <PoolCard key={item.key} pool={pools[item.index]} />
        ))}
      </div>
    </div>
  );
}
```

---

## Additional Features (Future)

### 1. Transaction History

- Store transaction history locally
- Filter by type (swap, liquidity, etc.)
- Export to CSV
- View on block explorer

### 2. Price Charts

- Integrate price chart for tokens
- Show historical data
- Multiple timeframes (1H, 1D, 1W, 1M)

### 3. Portfolio Analytics

- Total portfolio value chart
- Asset allocation pie chart
- P&L tracking
- Historical performance

### 4. Notifications

- Transaction confirmations
- Price alerts
- Position status changes
- System notifications via Tauri

### 5. Settings

- Theme customization
- Default slippage
- Gateway server URL configuration
- Language support
- Export/import configuration

### 6. Multi-Wallet Support

- Manage multiple wallets per chain
- Aggregate view across all wallets
- Switch between wallets easily

---

## Summary

This comprehensive plan outlines a robust Gateway Desktop App that provides:

✅ **Portfolio Management** - Connect wallets, view balances, manage tokens
✅ **Pool Discovery** - Find and save pools across multiple DEXes
✅ **Token Swaps** - Execute swaps via aggregators and direct connectors
✅ **Liquidity Management** - Manage AMM and CLMM positions, collect fees

**Tech Stack:**
- Tauri v2 for native desktop capabilities
- React 18 + TypeScript for robust UI development
- TailwindCSS + shadcn/ui for beautiful, accessible components
- Tanstack Query for efficient data fetching
- Zustand for lightweight state management

**Timeline:** 8 weeks for MVP with all core features

The app will integrate seamlessly with the existing Gateway server, providing a user-friendly interface while maintaining the flexibility and power of the underlying API.
