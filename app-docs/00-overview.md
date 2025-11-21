# Gateway Desktop App - Overview & Index

## Documentation Files

This folder contains the complete specification for the Gateway Desktop App, a Tauri-based desktop interface for the Gateway API server.

### Architecture & Planning

1. **[GATEWAY_APP_PLAN_V3.md](./GATEWAY_APP_PLAN_V3.md)** - Ultra-simplified KISS architecture plan
   - Technology stack (Vite + React + TypeScript)
   - Simplified API client (30-line fetch wrapper)
   - No complex state libraries (just React Context)
   - Direct schema imports from Gateway
   - Complete implementation guide

2. **GATEWAY_APP_PLAN_V2.md** - Monorepo-optimized plan (reference)
3. **GATEWAY_APP_PLAN.md** - Original detailed plan (reference)

### View Specifications

Each view has detailed ASCII mockups, component breakdowns, API integrations, and user flows:

1. **[01-portfolio-view.md](./01-portfolio-view.md)** - Portfolio management
   - Wallet holdings display
   - LP positions grouped by protocol
   - Wallet + network selectors
   - Balance tables with USD values

2. **[02-pools-view.md](./02-pools-view.md)** - Pool discovery & management
   - Search pools by token pair + connector
   - Saved pools list
   - Position previews
   - Add pools manually

3. **[03-swap-view.md](./03-swap-view.md)** - Token swap interface
   - Router and direct connector swaps
   - Quote fetching
   - Slippage settings
   - Transaction monitoring
   - Recent swap history

4. **[04-liquidity-view.md](./04-liquidity-view.md)** - LP position management
   - AMM and CLMM position display
   - Add/remove liquidity forms
   - Collect fees (CLMM)
   - Price range visualization (CLMM)
   - Position analytics

5. **[05-wallet-network-selector.md](./05-wallet-network-selector.md)** - Header controls
   - Wallet selector with chain grouping
   - Add wallet modal
   - Network selector
   - Dark/light theme toggle

6. **[06-config-view.md](./06-config-view.md)** - Configuration admin panel
   - Namespace selection by chain + network
   - View and edit config settings
   - Save/reset functionality
   - Validation and error handling

## Quick Reference

### Technology Stack

```
Frontend:  React 18 + TypeScript + Vite
Styling:   TailwindCSS + shadcn/ui
State:     React Context (no libraries!)
API:       Simple fetch() wrapper
Types:     Import directly from ../src/schemas
Desktop:   Tauri v2
```

### Project Structure

```
gateway/                     # Gateway repository root
├── src/                     # Gateway server source
├── test/                    # Gateway tests
├── conf/                    # Gateway configuration
├── app-docs/                # This documentation folder
└── gateway-app/             # Desktop app (to be created)
    ├── src/
    │   ├── components/
    │   │   ├── ui/              # shadcn/ui components
    │   │   ├── PortfolioView.tsx
    │   │   ├── PoolsView.tsx
    │   │   ├── SwapView.tsx
    │   │   └── LiquidityView.tsx
    │   ├── lib/
    │   │   ├── api.ts           # 30-line fetch wrapper
    │   │   ├── AppContext.tsx   # Global state
    │   │   └── utils.ts
    │   ├── App.tsx
    │   └── main.tsx
    ├── src-tauri/
    │   ├── src/
    │   │   ├── main.rs          # Window setup only
    │   │   └── lib.rs           # Empty!
    │   └── tauri.conf.json
    └── tsconfig.json            # Extends ../tsconfig.json
```

### API Integration

All API calls use the simple client:

```typescript
// lib/api.ts
export async function api<T>(method, path, body?): Promise<T> {
  const res = await fetch(`http://localhost:15888${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}
```

### Type Imports

```typescript
// Import schemas directly from Gateway
import { QuoteSwapResponse } from '@gateway/schemas/router-schema';
import { PositionInfo } from '@gateway/schemas/clmm-schema';
import { BalanceResponse } from '@gateway/schemas/chain-schema';
```

### Configuration Sharing

The desktop app reuses the same `/conf` folder as the Gateway server:
- `conf/wallets/` - Encrypted wallet keys (shared between server & app)
- `conf/chains/` - Network configurations (RPC endpoints, chain IDs)
- `conf/connectors/` - DEX connector settings (fees, slippage defaults)
- `conf/tokens/` - Token lists per network
- `conf/rpc/` - RPC provider API keys (Helius, Infura, etc.)

Both the Gateway server and desktop app read from the same configuration files, ensuring consistency.

## Development Workflow

### Start Gateway Server (Terminal 1)
```bash
cd /Users/feng/gateway
pnpm build
pnpm start --passphrase=a --dev
```

### Start Desktop App (Terminal 2)
```bash
cd /Users/feng/gateway/gateway-app
pnpm tauri dev
```

## Key Design Principles

### 1. KISS (Keep It Simple, Stupid)
- No complex state management libraries
- No query caching (just refetch)
- Simple React patterns (useState + useEffect)
- 30-line API client instead of SDK

### 2. Type Safety via Monorepo
- Import TypeBox schemas from Gateway
- Single source of truth for types
- TypeScript catches API changes immediately

### 3. Component Simplicity
- Local state in components
- React Context for global state (wallet, network)
- Direct API calls with fetch()
- No over-engineering

### 4. UI/UX Consistency
- Dark theme throughout
- TailwindCSS utility classes
- shadcn/ui component library (copy-paste)
- Clear loading/error states

## View Navigation

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Gateway                    [Wallet ▼] [Network ▼] [🌙/☀️]              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─Wallet──┐  Swap    Pools    Liquidity    Configs                     │
│                                                                          │
│  [View content here]                                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

Simple tab navigation - click tab to switch view.

**Current Implementation Status:**
- ✅ Wallet View (Portfolio) - Basic structure created with Tokens and LP Positions tabs
- ✅ Swap View - Basic structure created
- ✅ Pools View - Basic structure created
- ✅ Liquidity View - Basic structure created
- ✅ Configs View - Fully implemented with namespace sidebar
- ✅ Wallet Selector - Fully implemented with chain grouping
- ✅ Network Selector - Fully implemented with dynamic loading
- ✅ Theme Toggle - Light/dark mode with persistence

## Common Components

### Shared Across Views

1. **Header**
   - App logo
   - Network selector dropdown
   - Wallet address selector dropdown

2. **Navigation Tabs**
   - Portfolio, Pools, Swap, Liquidity
   - Active tab highlighted

3. **shadcn/ui Components**
   - Button, Input, Card, Select
   - Dialog, Table, Tabs
   - All pre-styled, accessible

4. **Loading States**
   - Skeleton loaders for tables
   - Spinners for buttons
   - Loading overlays for forms

5. **Error States**
   - Error messages with retry
   - Toast notifications
   - Form validation errors

## API Response Patterns

### Success Response
```typescript
{
  signature: "tx-hash",
  status: 0,  // 0=PENDING, 1=CONFIRMED, -1=FAILED
  data: { /* operation-specific data */ }
}
```

### Error Response
```typescript
{
  statusCode: 400,
  error: "Bad Request",
  message: "Invalid token address",
  validation?: [/* validation errors */]
}
```

## Testing Strategy

### Simple Approach
- Manual testing during development
- Click through all user flows
- Test with real Gateway server
- No complex test setup initially

### Future Testing (V2)
- Unit tests for utility functions
- Component tests with Vitest
- E2E tests with Playwright

## Deployment

### Development
```bash
pnpm tauri dev
```

### Production Build
```bash
pnpm tauri build

# Outputs:
# macOS: src-tauri/target/release/bundle/macos/Gateway.app
# Windows: src-tauri/target/release/bundle/msi/Gateway.msi
# Linux: src-tauri/target/release/bundle/appimage/gateway.AppImage
```

## Future Enhancements

See individual view specs for detailed V2 features. High-level priorities:

1. **Analytics**
   - Portfolio value charts
   - Position performance tracking
   - P&L calculations

2. **Advanced Features**
   - Price alerts
   - Auto-compound
   - Limit orders
   - DCA scheduling

3. **User Experience**
   - Dark/light theme toggle
   - Customizable layouts
   - Keyboard shortcuts
   - Export data

4. **Integration**
   - Hardware wallet support
   - Multiple network aggregation
   - Cross-chain swaps
   - NFT positions (where applicable)

## Contributing

When adding new features:
1. Update the relevant view spec (.md file)
2. Keep components simple (KISS principle)
3. Import types from Gateway schemas
4. Follow existing patterns
5. Test with real Gateway server

## Questions?

Each view specification includes:
- ✅ ASCII mockups
- ✅ Component breakdown
- ✅ API integration details
- ✅ User flows
- ✅ Edge cases
- ✅ Styling notes

Refer to individual files for complete implementation details.
