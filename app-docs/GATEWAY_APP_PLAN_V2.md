# Gateway Desktop App - Simplified Monorepo Plan

## Executive Summary

This plan leverages the **monorepo structure** to build a Gateway Desktop App that **directly reuses Gateway server code**, eliminating duplication and ensuring type safety. The app imports TypeBox schemas, types, and API route structures directly from `/src`.

## Key Architectural Simplifications

### ✅ What We Can Reuse from Gateway

1. **TypeBox Schemas** - Import directly from `/src/schemas`
2. **Type Definitions** - All request/response types via TypeBox Static<>
3. **API Route Structure** - Mirror the route organization from `/src/app.ts`
4. **Constants & Enums** - Share TransactionStatus, network configs, etc.
5. **Utilities** - Format functions, validators, etc.

### ❌ What We Don't Need to Duplicate

- ~~Custom API client types~~ → Use TypeBox schemas
- ~~Separate type definitions~~ → Import from `/src/schemas`
- ~~API documentation~~ → Use existing Swagger/OpenAPI
- ~~Validation logic~~ → TypeBox handles it

---

## Simplified Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Gateway Desktop App                      │
│                        (Tauri v2)                            │
├──────────────────────┬──────────────────────────────────────┤
│   Frontend Layer     │         Backend Layer                │
│                      │                                      │
│  React 18 + TS       │    Rust + Tauri Framework           │
│  Vite Build Tool     │    - HTTP Client (reqwest)          │
│  TailwindCSS         │    - Wallet Encryption              │
│  shadcn/ui           │    - System Integration             │
│  Tanstack Query      │                                     │
│                      │                                      │
│  ┌────────────────┐  │                                     │
│  │ Import Schemas │  │                                     │
│  │ from ../src    │  │                                     │
│  └────────────────┘  │                                     │
└──────────────────────┴──────────────────────────────────────┘
                              │
                              ▼ localhost:15888
                    ┌──────────────────┐
                    │  Gateway Server  │
                    │  (Same Process   │
                    │   or Separate)   │
                    └──────────────────┘
```

---

## Project Structure (Simplified)

```
/Users/feng/gateway/
├── src/                           # Existing Gateway server
│   ├── schemas/                   # ← REUSE THESE
│   │   ├── chain-schema.ts
│   │   ├── router-schema.ts
│   │   ├── amm-schema.ts
│   │   └── clmm-schema.ts
│   ├── chains/
│   ├── connectors/
│   └── app.ts                     # ← REFERENCE FOR ROUTES
│
├── gateway-app/                   # NEW: Desktop app
│   ├── src/                       # React frontend
│   │   ├── components/
│   │   ├── views/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── lib/
│   │   │   ├── api-client.ts     # Thin HTTP wrapper
│   │   │   └── utils.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   ├── src-tauri/                 # Rust backend
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   ├── lib.rs
│   │   │   └── commands.rs
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json
│   │
│   ├── tsconfig.json              # Extends ../tsconfig.json
│   ├── vite.config.ts
│   └── package.json
│
├── package.json                   # Root package.json
├── pnpm-workspace.yaml            # Workspace config
└── tsconfig.json                  # Base TypeScript config
```

---

## Type Sharing Strategy

### 1. Extend Gateway's TypeScript Config

```json
// gateway-app/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@gateway/*": ["../src/*"]  // Import from Gateway src
    }
  },
  "include": ["src"]
}
```

### 2. Direct Schema Imports

```typescript
// gateway-app/src/lib/types.ts
import { Static } from '@sinclair/typebox';
import {
  BalanceRequestSchema,
  BalanceResponseSchema,
  TokensRequestSchema,
  TokensResponseSchema,
} from '@gateway/schemas/chain-schema';

import {
  QuoteSwapRequest,
  QuoteSwapResponse,
  ExecuteSwapRequest,
  ExecuteSwapResponse,
} from '@gateway/schemas/router-schema';

import {
  PoolInfo,
  AddLiquidityRequestType,
  RemoveLiquidityRequestType,
} from '@gateway/schemas/amm-schema';

import {
  PositionInfo,
  OpenPositionRequestType,
  GetPositionsOwnedRequestType,
} from '@gateway/schemas/clmm-schema';

// Export types directly
export type BalanceRequest = Static<typeof BalanceRequestSchema>;
export type BalanceResponse = Static<typeof BalanceResponseSchema>;
export type TokensRequest = Static<typeof TokensRequestSchema>;
export type TokensResponse = Static<typeof TokensResponseSchema>;

export type {
  QuoteSwapRequest,
  QuoteSwapResponse,
  ExecuteSwapRequest,
  ExecuteSwapResponse,
  PoolInfo,
  AddLiquidityRequestType,
  RemoveLiquidityRequestType,
  PositionInfo,
  OpenPositionRequestType,
  GetPositionsOwnedRequestType,
};
```

### 3. Simplified API Client

```typescript
// gateway-app/src/lib/api-client.ts
const BASE_URL = 'http://localhost:15888';

class GatewayClient {
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    data?: any
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    };

    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, data?: any): Promise<T> {
    return this.request<T>('POST', path, data);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

export const api = new GatewayClient();
```

### 4. Type-Safe API Services

```typescript
// gateway-app/src/lib/api/chains.ts
import { api } from '../api-client';
import type {
  BalanceRequest,
  BalanceResponse,
  TokensRequest,
  TokensResponse
} from '../types';

export const chainService = {
  async getBalances(chain: string, params: BalanceRequest): Promise<BalanceResponse> {
    const query = new URLSearchParams({
      ...(params.network && { network: params.network }),
      ...(params.address && { address: params.address }),
      ...(params.tokens && { tokens: params.tokens.join(',') }),
    });
    return api.get(`/chains/${chain}/balances?${query}`);
  },

  async getTokens(chain: string, params: TokensRequest): Promise<TokensResponse> {
    const query = new URLSearchParams({
      ...(params.network && { network: params.network }),
      ...(params.tokenSymbols && {
        tokenSymbols: Array.isArray(params.tokenSymbols)
          ? params.tokenSymbols.join(',')
          : params.tokenSymbols
      }),
    });
    return api.get(`/chains/${chain}/tokens?${query}`);
  },
};

// gateway-app/src/lib/api/router.ts
import { api } from '../api-client';
import type { QuoteSwapRequest, QuoteSwapResponse, ExecuteSwapRequest, ExecuteSwapResponse } from '../types';

export const routerService = {
  async quoteSwap(connector: string, params: QuoteSwapRequest): Promise<QuoteSwapResponse> {
    return api.post(`/connectors/${connector}/router/quote-swap`, params);
  },

  async executeSwap(connector: string, params: ExecuteSwapRequest): Promise<ExecuteSwapResponse> {
    return api.post(`/connectors/${connector}/router/execute-swap`, params);
  },
};

// gateway-app/src/lib/api/amm.ts
import { api } from '../api-client';
import type { PoolInfo, AddLiquidityRequestType, AddLiquidityResponseType } from '../types';

export const ammService = {
  async getPoolInfo(connector: string, network: string, poolAddress: string): Promise<PoolInfo> {
    const query = new URLSearchParams({ network, poolAddress });
    return api.get(`/connectors/${connector}/amm/pool-info?${query}`);
  },

  async addLiquidity(
    connector: string,
    params: AddLiquidityRequestType
  ): Promise<AddLiquidityResponseType> {
    return api.post(`/connectors/${connector}/amm/add-liquidity`, params);
  },
};

// gateway-app/src/lib/api/clmm.ts
import { api } from '../api-client';
import type {
  PositionInfo,
  GetPositionsOwnedRequestType,
  OpenPositionRequestType,
  OpenPositionResponseType
} from '../types';

export const clmmService = {
  async getPositionsOwned(
    connector: string,
    params: GetPositionsOwnedRequestType
  ): Promise<{ positions: PositionInfo[] }> {
    const query = new URLSearchParams({
      network: params.network || '',
      walletAddress: params.walletAddress,
    });
    return api.get(`/connectors/${connector}/clmm/positions-owned?${query}`);
  },

  async openPosition(
    connector: string,
    params: OpenPositionRequestType
  ): Promise<OpenPositionResponseType> {
    return api.post(`/connectors/${connector}/clmm/open-position`, params);
  },
};
```

---

## API Route Organization (Mirrors Gateway)

### From `/src/app.ts` Routes:

```typescript
// SYSTEM ROUTES
/config/*                      → Config service
/wallet/*                      → Wallet service
/tokens/*                      → Token service
/pools/*                       → Pool service

// CHAIN ROUTES
/chains/solana/*               → Solana chain service
/chains/ethereum/*             → Ethereum chain service

// CONNECTOR ROUTES - Router
/connectors/jupiter/router/*   → Jupiter service
/connectors/0x/router/*        → 0x service
/connectors/uniswap/router/*   → Uniswap SOR service
/connectors/pancakeswap/router/* → PancakeSwap router service

// CONNECTOR ROUTES - AMM
/connectors/raydium/amm/*      → Raydium AMM service
/connectors/uniswap/amm/*      → Uniswap V2 service
/connectors/pancakeswap/amm/*  → PancakeSwap V2 service

// CONNECTOR ROUTES - CLMM
/connectors/raydium/clmm/*     → Raydium CLMM service
/connectors/meteora/clmm/*     → Meteora DLMM service
/connectors/uniswap/clmm/*     → Uniswap V3 service
/connectors/pancakeswap/clmm/* → PancakeSwap V3 service
/connectors/pancakeswap-sol/*  → PancakeSwap Solana service

// UNIFIED TRADING ROUTES
/trading/swap/*                → Cross-chain unified swap
/trading/clmm/*                → Cross-chain unified CLMM
```

### Frontend Service Structure (Mirrors Backend)

```typescript
// gateway-app/src/lib/api/index.ts
export { chainService } from './chains';
export { walletService } from './wallets';
export { tokenService } from './tokens';
export { poolService } from './pools';
export { routerService } from './router';
export { ammService } from './amm';
export { clmmService } from './clmm';
export { tradingService } from './trading';
```

---

## Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  - 'gateway-app'
```

### Root package.json (Updated)

```json
{
  "name": "gateway-monorepo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "pnpm build --filter gateway-app",
    "dev:server": "pnpm start --dev",
    "dev:app": "pnpm --filter gateway-app tauri dev",
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:app\"",
    "test": "jest",
    "test:app": "pnpm --filter gateway-app test"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### gateway-app/package.json

```json
{
  "name": "gateway-app",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",
    "test": "vitest"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.5.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@sinclair/typebox": "^0.32.0",  // Same version as Gateway
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "~5.6.2",
    "vite": "^6.0.3",
    "vitest": "^1.0.0"
  }
}
```

---

## React Hooks with Type Safety

```typescript
// gateway-app/src/hooks/useBalances.ts
import { useQuery } from '@tanstack/react-query';
import { chainService } from '@/lib/api';
import type { BalanceRequest, BalanceResponse } from '@/lib/types';

export const useBalances = (
  chain: string,
  params: BalanceRequest
) => {
  return useQuery<BalanceResponse>({
    queryKey: ['balances', chain, params],
    queryFn: () => chainService.getBalances(chain, params),
    enabled: !!params.address,
    refetchInterval: 30000, // 30s
  });
};

// gateway-app/src/hooks/useSwap.ts
import { useMutation } from '@tanstack/react-query';
import { routerService } from '@/lib/api';
import type { QuoteSwapRequest, ExecuteSwapRequest } from '@/lib/types';

export const useSwap = (connector: string) => {
  const quoteSwap = useMutation({
    mutationFn: (params: QuoteSwapRequest) =>
      routerService.quoteSwap(connector, params),
  });

  const executeSwap = useMutation({
    mutationFn: (params: ExecuteSwapRequest) =>
      routerService.executeSwap(connector, params),
  });

  return { quoteSwap, executeSwap };
};

// gateway-app/src/hooks/usePositions.ts
import { useQuery } from '@tanstack/react-query';
import { clmmService } from '@/lib/api';
import type { GetPositionsOwnedRequestType } from '@/lib/types';

export const usePositions = (
  connector: string,
  params: GetPositionsOwnedRequestType
) => {
  return useQuery({
    queryKey: ['positions', connector, params],
    queryFn: () => clmmService.getPositionsOwned(connector, params),
    enabled: !!params.walletAddress,
    refetchInterval: 60000, // 1 min
  });
};
```

---

## Component Examples with Shared Types

```typescript
// gateway-app/src/components/swap/SwapWidget.tsx
import { useState } from 'react';
import { useSwap } from '@/hooks/useSwap';
import type { QuoteSwapRequest } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SwapWidget() {
  const [params, setParams] = useState<QuoteSwapRequest>({
    network: 'mainnet-beta',
    baseToken: 'SOL',
    quoteToken: 'USDC',
    amount: 1.0,
    side: 'SELL',
    slippagePct: 0.5,
  });

  const { quoteSwap, executeSwap } = useSwap('jupiter');

  const handleGetQuote = () => {
    quoteSwap.mutate(params);
  };

  return (
    <div className="space-y-4">
      <Input
        type="number"
        value={params.amount}
        onChange={(e) => setParams({ ...params, amount: parseFloat(e.target.value) })}
      />
      <Button onClick={handleGetQuote}>Get Quote</Button>

      {quoteSwap.data && (
        <div>
          <p>Price: {quoteSwap.data.price}</p>
          <p>Amount Out: {quoteSwap.data.amountOut}</p>
          <Button onClick={() => executeSwap.mutate({
            network: params.network,
            walletAddress: 'user-wallet-address',
            quoteId: quoteSwap.data.quoteId,
          })}>
            Execute Swap
          </Button>
        </div>
      )}
    </div>
  );
}

// gateway-app/src/components/pools/PoolCard.tsx
import type { PoolInfo } from '@/lib/types';
import { Card } from '@/components/ui/card';

interface PoolCardProps {
  pool: PoolInfo;
}

export function PoolCard({ pool }: PoolCardProps) {
  return (
    <Card>
      <div className="p-4">
        <h3 className="font-semibold">
          {pool.baseTokenAddress} / {pool.quoteTokenAddress}
        </h3>
        <p>Price: {pool.price}</p>
        <p>Fee: {pool.feePct}%</p>
        <p className="text-sm text-muted-foreground">
          {pool.address.slice(0, 8)}...{pool.address.slice(-8)}
        </p>
      </div>
    </Card>
  );
}
```

---

## Benefits of This Approach

### 1. **Single Source of Truth**
- Types defined once in `/src/schemas`
- No duplication or drift between frontend and backend

### 2. **Automatic Type Updates**
- When Gateway schemas change, frontend automatically gets updates
- TypeScript compiler catches breaking changes

### 3. **Reduced Bundle Size**
- No duplicate type definitions
- Shared utilities and constants

### 4. **Consistent Validation**
- Same TypeBox schemas validate on both sides
- Could even share validation utilities

### 5. **Easier Maintenance**
- Single codebase to update
- Changes propagate automatically

### 6. **Developer Experience**
- IntelliSense works perfectly
- Jump to definition goes to actual schema
- Refactoring works across the entire monorepo

---

## Vite Configuration

```typescript
// gateway-app/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@gateway': path.resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
  },
});
```

---

## Development Workflow

### 1. Start Gateway Server (Terminal 1)

```bash
cd /Users/feng/gateway
pnpm build
pnpm start --passphrase=a --dev
```

### 2. Start Desktop App (Terminal 2)

```bash
cd /Users/feng/gateway/gateway-app
pnpm tauri dev
```

### 3. Alternative: Start Both Together

```bash
cd /Users/feng/gateway
pnpm dev  # Uses concurrently to start both
```

---

## Testing Strategy (Simplified)

### Unit Tests Can Import Real Schemas

```typescript
// gateway-app/src/components/swap/__tests__/SwapWidget.test.tsx
import { render, screen } from '@testing-library/react';
import { SwapWidget } from '../SwapWidget';
import { QuoteSwapRequestSchema } from '@gateway/schemas/router-schema';
import { Type, Static } from '@sinclair/typebox';

describe('SwapWidget', () => {
  it('should match QuoteSwapRequest schema', () => {
    const validRequest: Static<typeof QuoteSwapRequestSchema> = {
      network: 'mainnet-beta',
      baseToken: 'SOL',
      quoteToken: 'USDC',
      amount: 1.0,
      side: 'SELL',
    };

    // TypeScript ensures this matches the schema
    expect(validRequest).toBeDefined();
  });
});
```

---

## Migration Path from Old Plan

### What Changes:

1. **Delete**: `gateway-app/src/services/types/*` ❌
2. **Delete**: Custom type definitions ❌
3. **Simplify**: API client to thin HTTP wrapper ✅
4. **Add**: Import from `@gateway/schemas/*` ✅
5. **Update**: tsconfig.json to extend parent ✅

### What Stays the Same:

- UI components structure ✅
- React hooks patterns ✅
- State management (Zustand) ✅
- shadcn/ui components ✅
- Tauri backend structure ✅

---

## Summary

This **simplified monorepo approach**:

✅ **Eliminates type duplication** - Import schemas directly from `/src/schemas`
✅ **Ensures type safety** - TypeScript catches API changes immediately
✅ **Reduces complexity** - Thin API client instead of full SDK
✅ **Maintains flexibility** - Can still customize frontend behavior
✅ **Easier testing** - Use real schemas in tests
✅ **Better DX** - Jump to definition works across entire repo

The app essentially becomes a **beautiful UI layer** on top of the existing Gateway infrastructure, rather than a separate application that duplicates logic.
