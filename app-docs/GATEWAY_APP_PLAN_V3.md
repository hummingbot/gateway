# Gateway Desktop App - Ultra-Simplified KISS Plan

## Executive Summary

**Keep It Simple, Stupid!** This is a minimal Tauri desktop app that provides a clean UI for the Gateway server running on localhost:15888. No fancy state management, no complex caching - just React + fetch + Gateway schemas.

---

## What We Actually Need

```
Gateway Desktop App = Tauri + React + TailwindCSS + shadcn/ui
                     + Direct imports from Gateway schemas
                     + Simple fetch() calls
```

### Technology Stack (Minimal)

| Tech | Purpose | Why |
|------|---------|-----|
| **Tauri v2** | Desktop wrapper | Native app, small bundle |
| **React 18** | UI framework | Simple, familiar |
| **TypeScript** | Type safety | Import Gateway schemas |
| **Vite** | Build tool | Fast, simple config |
| **TailwindCSS** | Styling | Utility-first CSS |
| **shadcn/ui** | UI components | Copy-paste components |

### What We DON'T Need

- ❌ **Tanstack Query** - Just use React state + fetch
- ❌ **Zustand** - Just use React useState/useContext
- ❌ **Complex state management** - Keep state local to components
- ❌ **Background tasks** - Gateway server handles everything
- ❌ **Wallet security** - Gateway server handles wallet encryption
- ❌ **Caching** - Just refetch when needed
- ❌ **Query optimization** - YAGNI (You Aren't Gonna Need It)

---

## Simplified Architecture

```
┌─────────────────────────────────────┐
│      Gateway Desktop App            │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  React Components             │  │
│  │  - Portfolio View             │  │
│  │  - Swap View                  │  │
│  │  - Pools View                 │  │
│  │  - Liquidity View             │  │
│  └───────────────────────────────┘  │
│              │                      │
│              │ fetch()              │
│              ▼                      │
│    Import schemas from ../src      │
│                                     │
└─────────────────────────────────────┘
              │
              ▼ localhost:15888
    ┌──────────────────┐
    │  Gateway Server  │
    │  - Wallet storage│
    │  - Blockchain    │
    │  - DEX logic     │
    └──────────────────┘
```

---

## Ultra-Simple Project Structure

```
gateway-app/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components (copy-paste)
│   │   ├── PortfolioView.tsx
│   │   ├── SwapView.tsx
│   │   ├── PoolsView.tsx
│   │   └── LiquidityView.tsx
│   │
│   ├── lib/
│   │   ├── api.ts           # Simple fetch wrapper (~30 lines)
│   │   └── utils.ts         # Utility functions
│   │
│   ├── App.tsx              # Main app with routing
│   └── main.tsx             # Entry point
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Just window setup
│   │   └── lib.rs           # Empty (no commands needed!)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── components.json          # shadcn/ui config
├── tailwind.config.js
├── tsconfig.json            # Extends ../tsconfig.json
├── vite.config.ts
└── package.json
```

---

## Minimal API Client

```typescript
// src/lib/api.ts (THE ENTIRE API CLIENT!)
const BASE_URL = 'http://localhost:15888';

export async function api<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: any
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `${method} ${path} failed`);
  }

  return res.json();
}

// Helper functions
export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: any) => api<T>('POST', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);
```

That's it! **30 lines** instead of hundreds.

---

## Simple Component Pattern

### Example: Balance Display

```typescript
// src/components/BalanceDisplay.tsx
import { useState, useEffect } from 'react';
import { get } from '@/lib/api';
import type { BalanceResponse } from '@gateway/schemas/chain-schema';

export function BalanceDisplay({ chain, address }: { chain: string; address: string }) {
  const [balances, setBalances] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const data = await get<BalanceResponse>(
        `/chains/${chain}/balances?address=${address}`
      );
      setBalances(data);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [chain, address]);

  if (loading) return <div>Loading...</div>;
  if (!balances) return <div>No data</div>;

  return (
    <div>
      {Object.entries(balances.balances).map(([token, amount]) => (
        <div key={token}>
          {token}: {amount}
        </div>
      ))}
    </div>
  );
}
```

**Simple!** No hooks library, no caching, no complex state management.

---

## Simple State Management

### Global State (React Context)

```typescript
// src/lib/AppContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface AppState {
  selectedWallet: string | null;
  selectedNetwork: string;
  setSelectedWallet: (wallet: string | null) => void;
  setSelectedNetwork: (network: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState('mainnet');

  return (
    <AppContext.Provider
      value={{
        selectedWallet,
        selectedNetwork,
        setSelectedWallet,
        setSelectedNetwork,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
```

**That's it!** No Zustand, no Redux, just React Context.

---

## Views (One Component Per Tab)

### Portfolio View

```typescript
// src/components/PortfolioView.tsx
import { useState, useEffect } from 'react';
import { get, post } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function PortfolioView() {
  const { selectedWallet, setSelectedWallet } = useApp();
  const [wallets, setWallets] = useState([]);
  const [balances, setBalances] = useState({});

  // Fetch wallets
  useEffect(() => {
    get('/wallet').then(data => setWallets(data.wallets));
  }, []);

  // Fetch balances when wallet changes
  useEffect(() => {
    if (selectedWallet) {
      get(`/chains/ethereum/balances?address=${selectedWallet}`)
        .then(data => setBalances(data.balances));
    }
  }, [selectedWallet]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Portfolio</h1>

      {/* Wallet selector */}
      <select onChange={(e) => setSelectedWallet(e.target.value)}>
        <option>Select wallet...</option>
        {wallets.map((w: any) => (
          <option key={w.address} value={w.address}>{w.address}</option>
        ))}
      </select>

      {/* Balances */}
      {selectedWallet && (
        <div className="mt-4">
          <h2 className="text-xl mb-2">Balances</h2>
          {Object.entries(balances).map(([token, amount]) => (
            <div key={token} className="flex justify-between">
              <span>{token}</span>
              <span>{amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Swap View (Complete Example)

```typescript
// src/components/SwapView.tsx
import { useState } from 'react';
import { post } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuoteSwapResponse } from '@gateway/schemas/router-schema';

export function SwapView() {
  const { selectedWallet, selectedNetwork } = useApp();
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('USDC');
  const [amount, setAmount] = useState('1.0');
  const [quote, setQuote] = useState<QuoteSwapResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const getQuote = async () => {
    setLoading(true);
    try {
      const data = await post<QuoteSwapResponse>(
        '/connectors/uniswap/router/quote-swap',
        {
          network: selectedNetwork,
          baseToken: fromToken,
          quoteToken: toToken,
          amount: parseFloat(amount),
          side: 'SELL',
          slippagePct: 0.5,
        }
      );
      setQuote(data);
    } catch (err) {
      alert('Quote failed: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!quote || !selectedWallet) return;

    setLoading(true);
    try {
      await post('/connectors/uniswap/router/execute-swap', {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        baseToken: fromToken,
        quoteToken: toToken,
        amount: parseFloat(amount),
        side: 'SELL',
        slippagePct: 0.5,
      });
      alert('Swap submitted!');
    } catch (err) {
      alert('Swap failed: ' + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Swap</h1>

      <div className="space-y-4">
        <div>
          <label>From</label>
          <Input
            value={fromToken}
            onChange={(e) => setFromToken(e.target.value)}
            placeholder="ETH"
          />
        </div>

        <div>
          <label>Amount</label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label>To</label>
          <Input
            value={toToken}
            onChange={(e) => setToToken(e.target.value)}
            placeholder="USDC"
          />
        </div>

        <Button onClick={getQuote} disabled={loading} className="w-full">
          Get Quote
        </Button>

        {quote && (
          <div className="bg-gray-100 p-4 rounded">
            <p>Price: {quote.price}</p>
            <p>You'll receive: {quote.amountOut} {toToken}</p>
            <p>Price impact: {quote.priceImpactPct}%</p>

            <Button onClick={executeSwap} disabled={loading} className="w-full mt-2">
              Execute Swap
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**That's a complete working swap interface!** No complex hooks, no state management library.

---

## Main App with Routing

```typescript
// src/App.tsx
import { useState } from 'react';
import { AppProvider } from '@/lib/AppContext';
import { PortfolioView } from '@/components/PortfolioView';
import { PoolsView } from '@/components/PoolsView';
import { SwapView } from '@/components/SwapView';
import { LiquidityView } from '@/components/LiquidityView';

type View = 'portfolio' | 'pools' | 'swap' | 'liquidity';

function App() {
  const [currentView, setCurrentView] = useState<View>('portfolio');

  return (
    <AppProvider>
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-48 bg-gray-900 text-white p-4">
          <h1 className="text-xl font-bold mb-6">Gateway</h1>
          <nav className="space-y-2">
            <button
              onClick={() => setCurrentView('portfolio')}
              className={`w-full text-left px-3 py-2 rounded ${
                currentView === 'portfolio' ? 'bg-blue-600' : 'hover:bg-gray-800'
              }`}
            >
              Portfolio
            </button>
            <button
              onClick={() => setCurrentView('pools')}
              className={`w-full text-left px-3 py-2 rounded ${
                currentView === 'pools' ? 'bg-blue-600' : 'hover:bg-gray-800'
              }`}
            >
              Pools
            </button>
            <button
              onClick={() => setCurrentView('swap')}
              className={`w-full text-left px-3 py-2 rounded ${
                currentView === 'swap' ? 'bg-blue-600' : 'hover:bg-gray-800'
              }`}
            >
              Swap
            </button>
            <button
              onClick={() => setCurrentView('liquidity')}
              className={`w-full text-left px-3 py-2 rounded ${
                currentView === 'liquidity' ? 'bg-blue-600' : 'hover:bg-gray-800'
              }`}
            >
              Liquidity
            </button>
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {currentView === 'portfolio' && <PortfolioView />}
          {currentView === 'pools' && <PoolsView />}
          {currentView === 'swap' && <SwapView />}
          {currentView === 'liquidity' && <LiquidityView />}
        </div>
      </div>
    </AppProvider>
  );
}

export default App;
```

**No router library needed!** Just simple state.

---

## Minimal Tauri Backend

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```rust
// src-tauri/src/lib.rs
// Empty! We don't need any Tauri commands.
// All API calls go directly from frontend to Gateway server.
```

**That's it!** No commands, no IPC complexity.

---

## Minimal package.json

```json
{
  "name": "gateway-app",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@sinclair/typebox": "^0.32.0",
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "~5.6.2",
    "vite": "^6.0.3"
  }
}
```

**7 dependencies total!** No Tanstack Query, no Zustand, no extra libraries.

---

## shadcn/ui Setup (One-time)

```bash
cd gateway-app
npx shadcn-ui@latest init

# Install only the components you need:
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
npx shadcn-ui@latest add select
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add table
```

These are just **copy-pasted components** into your `src/components/ui/` folder. No library dependency!

---

## TypeScript Config (Simplified)

```json
// gateway-app/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@gateway/*": ["../src/*"]
    }
  },
  "include": ["src"]
}
```

---

## Development Workflow (Super Simple)

### Terminal 1: Start Gateway Server
```bash
cd /Users/feng/gateway
pnpm build
pnpm start --passphrase=a --dev
```

### Terminal 2: Start Desktop App
```bash
cd /Users/feng/gateway/gateway-app
pnpm tauri dev
```

**Done!** App opens, connects to localhost:15888, everything works.

---

## What About...?

### Q: What about caching API responses?
**A:** Just refetch. Network is fast enough for a desktop app.

### Q: What about optimistic updates?
**A:** YAGNI. Wait for the API response.

### Q: What about global loading states?
**A:** Each component manages its own loading state.

### Q: What about error boundaries?
**A:** Start simple. Add if needed later.

### Q: What about wallet security?
**A:** Gateway server handles it! We just pass wallet addresses.

### Q: What about form validation?
**A:** Basic HTML5 validation + TypeScript types from Gateway schemas.

---

## File Count Comparison

### V2 Plan (Over-engineered)
- ~50+ files
- Complex hooks library
- State management library
- Query caching system
- **Total LOC: ~3,000+**

### V3 Plan (KISS)
- ~15 files
- Simple fetch wrapper
- React Context for global state
- Direct component state
- **Total LOC: ~800**

---

## Summary

This ultra-simplified plan gives you:

✅ **Beautiful UI** - TailwindCSS + shadcn/ui
✅ **Type Safety** - Import schemas from Gateway
✅ **Simple Code** - Easy to understand and maintain
✅ **Fast Development** - No complex abstractions
✅ **Small Bundle** - Minimal dependencies
✅ **Easy Debugging** - No magic, just React + fetch

**The entire app is basically:**
1. 30-line API client
2. 4 view components (Portfolio, Swap, Pools, Liquidity)
3. Simple React Context for global state
4. shadcn/ui components for styling

**That's it!** No Tanstack Query, no Zustand, no complexity. Just a clean UI that calls the Gateway API.
