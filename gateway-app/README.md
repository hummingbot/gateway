# Gateway Desktop App

A lightweight desktop application for interacting with the Gateway API server, built with Tauri v2, React, TypeScript, and TailwindCSS.

## Features

- **Portfolio View**: View wallet balances and LP positions
- **Swap View**: Execute token swaps via DEX routers (Jupiter, 0x, Uniswap)
- **Pools View**: Search and manage liquidity pools
- **Liquidity View**: Manage CLMM/AMM liquidity positions

## Tech Stack

- **Tauri v2**: Desktop framework
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **TailwindCSS v4**: Styling
- **shadcn/ui**: UI components

## Prerequisites

- Gateway server must be running
- Node.js 18+ and pnpm installed

## Development

### Setup

1. **Configure Environment Variables**

Create a `.env` file in `gateway-app/`:

```bash
# Gateway API URL (HTTPS for production, HTTP for dev mode)
VITE_GATEWAY_URL=https://localhost:15888

# Gateway API Key (must match GATEWAY_API_KEYS on server)
# Generate with: openssl rand -hex 32
VITE_GATEWAY_API_KEY=your-api-key-here
```

2. **Start Gateway Server (Terminal 1)**

With API key authentication:
```bash
cd /Users/feng/gateway
GATEWAY_API_KEYS=your-api-key-here pnpm start --passphrase=<PASSPHRASE>
```

Or in dev mode (HTTP, no SSL):
```bash
pnpm start --passphrase=<PASSPHRASE> --dev
```

### Run in Dev Mode

**Option 1: Web Browser (faster)**

Start the web dev server:
```bash
cd /Users/feng/gateway/gateway-app
pnpm dev
```

The app will be available at http://localhost:1420

**Option 2: Desktop App (Tauri)**

Start the Tauri dev build:
```bash
cd /Users/feng/gateway/gateway-app
pnpm tauri dev
```

This opens the app in a native window with hot reload enabled.

### Authentication

The app connects to Gateway using API key authentication by default (`useCerts: false`). The app uses Tauri's HTTP plugin to handle self-signed certificates automatically.

**Environment Variables:**
- `VITE_GATEWAY_URL`: Gateway server URL (default: `https://localhost:15888`)
- `VITE_GATEWAY_API_KEY`: API key for authentication (must match server's `GATEWAY_API_KEYS`)

**For production deployments**, set Gateway to use client certificates by changing `useCerts: true` in Gateway's `conf/server.yml`.

## Production Build

### Build Web Assets

Build the frontend only:
```bash
cd /Users/feng/gateway/gateway-app
pnpm build
```

Output: `dist/` directory with HTML/CSS/JS

### Build Desktop App

Build the native desktop application:
```bash
cd /Users/feng/gateway/gateway-app
pnpm tauri build
```

This will:
1. Build the web assets (`pnpm build`)
2. Compile the Rust backend
3. Bundle the app for your platform

**Build Output:**
- **macOS App**: `src-tauri/target/release/bundle/macos/gateway-app.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/gateway-app_0.1.0_aarch64.dmg`

**Note**: The API key and Gateway URL are baked into the build from your `.env` file at build time.

## Architecture

### Clean Architecture Principles

- **KISS Principle**: No complex state management libraries - simple React state and context
- **Typed API Client**: Organized namespace-based API client with full TypeScript support
- **Reusable Components**: Modular UI components (BaseModal, FormField, LoadingState, etc.)
- **Type Safety**: TypeScript with path aliases to import Gateway backend schemas
- **React Context**: Global state for wallet/network selection only

### Project Structure

```
gateway-app/
├── src/
│   ├── components/         # Feature components
│   │   ├── App.tsx        # Main app with routing
│   │   ├── PortfolioView.tsx
│   │   ├── SwapView.tsx
│   │   ├── PoolsView.tsx
│   │   ├── LiquidityView.tsx
│   │   └── ConfigView.tsx
│   ├── components/ui/      # Reusable UI components
│   │   ├── BaseModal.tsx
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── FormField.tsx
│   │   ├── ActionButtons.tsx
│   │   └── button.tsx
│   ├── lib/
│   │   ├── GatewayAPI.ts  # Typed API client (ConfigAPI, ChainAPI, etc.)
│   │   ├── api.ts         # Base HTTP client
│   │   └── utils.ts       # Utility functions
│   └── styles/
│       └── index.css      # Global styles
├── DOCKER.md              # Docker deployment guide
├── API.md                 # API client documentation
├── COMPONENTS.md          # Component library documentation
└── README.md             # This file
```

### API Client

The app uses a typed API client (`GatewayAPI.ts`) that organizes endpoints into logical namespaces:

```typescript
import { gatewayAPI } from '@/lib/GatewayAPI';

// Get chain balances
const balances = await gatewayAPI.chains.getBalances('solana', {
  network: 'mainnet-beta',
  address: walletAddress
});

// Get swap quote
const quote = await gatewayAPI.router.quoteSwap('jupiter', {
  network: 'mainnet-beta',
  baseToken: 'SOL',
  quoteToken: 'USDC',
  amount: 1.0,
  side: 'SELL'
});
```

See [API.md](./API.md) for complete API documentation.

### Component Library

Reusable UI components for consistent design:

- **BaseModal**: Modal dialogs with consistent styling
- **FormField**: Form inputs with labels
- **LoadingState/EmptyState**: Loading and empty data states
- **ActionButtons**: Button layouts for forms

See [COMPONENTS.md](./COMPONENTS.md) for component documentation.

## Deployment Options

### Option 1: Desktop App (Tauri)

Run as a native desktop application:

```bash
# Development
pnpm tauri dev

# Production build
pnpm tauri build
```

**Use case**: Local installation, native OS integration

### Option 2: Web Browser (Docker)

Run as a web application accessible in browser:

```bash
# From gateway root directory
docker compose up
```

Access at http://localhost:1420

**Use case**: Remote access, multi-user deployments

See [DOCKER.md](./DOCKER.md) for complete Docker setup guide.

## Configuration Sharing

The app reuses the same `/conf` folder as the Gateway server:
- `conf/wallets/` - Encrypted wallet keys
- `conf/chains/` - Network configurations
- `conf/connectors/` - DEX connector settings
- `conf/tokens/` - Token lists
- `conf/rpc/` - RPC provider credentials

## Documentation

- **[API.md](./API.md)** - API client usage and examples
- **[COMPONENTS.md](./COMPONENTS.md)** - Component library reference
- **[DOCKER.md](./DOCKER.md)** - Docker deployment guide
