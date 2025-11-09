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

- Gateway server must be running on `http://localhost:15888`
- Node.js 18+ and pnpm installed

## Development

### Start Gateway Server (Terminal 1)

```bash
cd /Users/feng/gateway
pnpm start --passphrase=<PASSPHRASE> --dev
```

### Start App Dev Server (Terminal 2)

```bash
cd /Users/feng/gateway/gateway-app
pnpm dev
```

The app will be available at http://localhost:1420

## Build

```bash
pnpm build
```

## Build Desktop App

```bash
pnpm tauri build
```

## Architecture

- **KISS Principle**: No complex state management libraries
- **Direct API calls**: Simple fetch-based API client (~30 lines)
- **React Context**: Global state for wallet/network selection
- **Type Safety**: TypeScript with path aliases to import Gateway schemas

## Configuration Sharing

The app reuses the same `/conf` folder as the Gateway server:
- `conf/wallets/` - Encrypted wallet keys
- `conf/chains/` - Network configurations
- `conf/connectors/` - DEX connector settings
- `conf/tokens/` - Token lists
- `conf/rpc/` - RPC provider credentials
