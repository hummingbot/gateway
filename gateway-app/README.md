# Gateway Desktop App

A lightweight desktop application for interacting with the Gateway API server, built with Tauri v2, React, TypeScript, and TailwindCSS.

**Primary Platform**: macOS Desktop
**Mobile Support**: Android builds available via `build-android-dev.sh` (experimental, being optimized)

## Features

- **Portfolio View**: View wallet balances and LP positions
- **Swap View**: Execute token swaps via DEX routers (Jupiter, 0x, Uniswap)
- **Pools View**: Search and manage liquidity pools
- **Liquidity View**: Manage CLMM/AMM liquidity positions

## Tech Stack

- **Tauri v2**: Desktop and mobile framework
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **TailwindCSS v4**: Styling
- **shadcn/ui**: Responsive UI components (Dialog/Drawer pattern for mobile)

## Prerequisites

- Gateway server must be running
- Node.js 18+ and pnpm installed

## Development

### Setup

1. **Configure Environment Variables**

Create a `.env` file in `gateway-app/`:

**For Development Mode (HTTP, no SSL):**
```bash
# Gateway API URL - use HTTP for development
VITE_GATEWAY_URL=http://localhost:15888

# No API key needed in development mode
```

**For Production Mode (HTTPS with SSL):**
```bash
# Gateway API URL - use HTTPS for production
VITE_GATEWAY_URL=https://localhost:15888

# Gateway API Key (must match GATEWAY_API_KEYS on server)
# Generate with: openssl rand -hex 32
VITE_GATEWAY_API_KEY=your-api-key-here
```

**Important**: The `VITE_GATEWAY_URL` protocol (HTTP/HTTPS) must match your Gateway server configuration in `conf/server.yml`:
- Development: `--dev` flag → HTTP → `http://localhost:15888`
- Production: Default mode → HTTPS → `https://localhost:15888`

2. **Start Gateway Server (Terminal 1)**

**Development mode** (HTTP, no SSL, no API key):
```bash
cd /Users/feng/gateway
pnpm start --passphrase=<PASSPHRASE> --dev
```

**Production mode** (HTTPS, requires API key):
```bash
cd /Users/feng/gateway
GATEWAY_API_KEYS=your-api-key-here pnpm start --passphrase=<PASSPHRASE>
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

### App Configuration

The app stores settings (dark mode, theme colors) in `app-config.json`:
- **Browser mode** (`pnpm dev`): Settings loaded from `public/app-config.json` on first visit, then stored in localStorage
- **Tauri mode** (`pnpm tauri dev`): Settings read/written to `app-config.json` directly via Rust commands

**Resetting settings in browser mode:**
1. Open browser DevTools (F12)
2. Console tab
3. Run: `localStorage.clear()`
4. Refresh page

Settings will reload from `app-config.json`.

**Syncing Tauri app config:**

If the Tauri desktop app shows outdated settings (e.g., only darkMode without theme colors):

1. Copy your project config to the Tauri app directory:
   ```bash
   cp app-config.json "$HOME/Library/Application Support/io.hummingbot.gateway/app-config.json"
   ```
2. Restart the Tauri app (`pnpm tauri dev`)

This syncs your project's `app-config.json` to the Tauri app's config storage location.

**Editing theme colors:**

Edit `app-config.json` in the project root:
```json
{
  "darkMode": true,
  "theme": {
    "colors": {
      "primary": "#0f172a",
      "primaryDark": "#f8fafc",
      "accent": "#f1f5f9",
      "accentDark": "#1e293b"
    }
  }
}
```

- Supports hex color codes (e.g., `#0f172a`)
- See `THEMES.json` for 10+ pre-made color schemes to copy from
- In browser mode: Clear localStorage and refresh to see changes
- In Tauri mode: Changes apply immediately when saved via Config UI

### Authentication

The app supports two authentication modes depending on how Gateway is running:

**Development Mode** (HTTP):
- No authentication required
- Set `VITE_GATEWAY_URL=http://localhost:15888` in `.env`
- Start Gateway with `--dev` flag
- No `VITE_GATEWAY_API_KEY` needed

**Production Mode** (HTTPS):
- API key authentication required (default: `useCerts: false` in `conf/server.yml`)
- Set `VITE_GATEWAY_URL=https://localhost:15888` in `.env`
- Set `VITE_GATEWAY_API_KEY` in `.env` (must match Gateway server's `GATEWAY_API_KEYS`)
- Tauri's HTTP plugin handles self-signed certificates automatically
- Alternatively, set `useCerts: true` in Gateway's `conf/server.yml` to use client certificates

**Environment Variables:**
- `VITE_GATEWAY_URL`: Gateway server URL (HTTP for dev, HTTPS for production)
- `VITE_GATEWAY_API_KEY`: API key for production mode authentication (not needed in dev mode)

## Production Build

### Build Desktop App (Default)

Build the native macOS desktop application:
```bash
cd /Users/feng/gateway/gateway-app
pnpm tauri build
```

This will:
1. Build the web assets (`pnpm build`)
2. Compile the Rust backend
3. Bundle the app for macOS

**Build Output:**
- **macOS App**: `src-tauri/target/release/bundle/macos/gateway-app.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/gateway-app_0.1.0_aarch64.dmg`

**Note**: The API key and Gateway URL are baked into the build from your `.env` file at build time.

### Build Android App (Experimental)

**Note**: Android builds are experimental and being optimized. Use only when specifically needed.

**Prerequisites:**
- Android SDK and NDK installed
- Gateway server running with ngrok tunnel
- `ANDROID_HOME`, `JAVA_HOME`, and `ANDROID_NDK_HOME` environment variables set

Build and install Android APK:
```bash
cd /Users/feng/gateway/gateway-app
./build-android-dev.sh
```

This script will:
1. Detect ngrok URL for Gateway connection
2. Build debug APK with responsive UI (Dialog→Drawer on mobile)
3. Show APK location for installation

**Build Output:**
- **APK**: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

Install on device:
```bash
adb install src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

### Build Web Assets Only

Build the frontend without Tauri:
```bash
cd /Users/feng/gateway/gateway-app
pnpm build
```

Output: `dist/` directory with HTML/CSS/JS

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

### Option 1: macOS Desktop App (Primary)

Run as a native macOS desktop application:

```bash
# Development
pnpm tauri dev

# Production build
pnpm tauri build
```

**Use case**: Local installation, native macOS integration

### Option 2: Web Browser

Run as a web application accessible in browser:

```bash
# Development server
pnpm dev
```

Access at http://localhost:1420

**Use case**: Web testing, cross-platform development

### Option 3: Docker (Web)

Deploy as containerized web application:

```bash
# From gateway root directory
docker compose up
```

Access at http://localhost:1420

**Use case**: Remote access, multi-user deployments

See [DOCKER.md](../DOCKER.md) for complete Docker setup guide.

### Option 4: Android App (Experimental)

Build and install Android APK for mobile testing:

```bash
./build-android-dev.sh
```

**Use case**: Mobile testing, being optimized

**Note**: Requires Android SDK/NDK and Gateway with ngrok tunnel.

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
- **[DOCKER.md](../DOCKER.md)** - Docker deployment guide (root directory)
