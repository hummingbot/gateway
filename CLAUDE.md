# AI Agent Instructions

This file provides guidance to AI coding assistants when working with code in this repository.

## Build & Command Reference
- Build: `pnpm build`
- Start server: `pnpm start --passphrase=<PASSPHRASE>`
- Start in dev mode: `pnpm start --passphrase=<PASSPHRASE> --dev` (HTTP mode, no SSL)
- Run all tests: `pnpm test`
- Run specific test file: `GATEWAY_TEST_MODE=dev jest --runInBand path/to/file.test.ts`
- Run tests with coverage: `pnpm test:cov`
- Lint code: `pnpm lint`
- Format code: `pnpm format`
- Type check: `pnpm typecheck`
- Initial setup: `pnpm run setup` (interactive - choose which configs to update)
- Setup with defaults: `pnpm run setup:with-defaults` (updates all configs automatically)
- Clean install: `pnpm clean` (removes node_modules, coverage, logs, dist)

## Architecture Overview

### Gateway Pattern
- RESTful API gateway providing standardized endpoints for blockchain and DEX interactions
- Built with Fastify framework using TypeBox for schema validation
- Supports both HTTP (dev mode) and HTTPS (production) protocols
- Swagger documentation auto-generated at `/docs` (http://localhost:15888/docs in dev mode)
- Global rate limiting implemented (100 requests/minute) to prevent DoS attacks

### Module Organization
- **Chains**: Blockchain implementations (Ethereum, Solana)
  - Each chain implements standard methods: balances, tokens, status, allowances
  - Singleton pattern with network-specific instances via `getInstance()`
  
- **Connectors**: DEX protocol implementations (Jupiter, Meteora, Raydium, Uniswap, 0x)
  - Support for three trading types:
    - **Router**: DEX aggregators that find optimal swap routes (Jupiter, 0x, Uniswap V3 SOR)
    - **AMM** (Automated Market Maker): V2-style constant product pools (Raydium, Uniswap V2)
    - **CLMM** (Concentrated Liquidity Market Maker): V3-style concentrated liquidity (Meteora DLMM, Raydium, Uniswap V3)
  - Each connector organized into operation-specific route files by type
  - Standardized request/response schemas across all connectors

### API Route Structure
- Chain routes: `/chains/{chain}/{operation}`
  - Examples: `/chains/ethereum/balances`, `/chains/solana/tokens`
- Connector routes: `/connectors/{dex}/{type}/{operation}`
  - Router: `/connectors/jupiter/router/quote`, `/connectors/0x/router/swap`
  - AMM: `/connectors/raydium/amm/addLiquidity`, `/connectors/uniswap/amm/poolInfo`
  - CLMM: `/connectors/meteora/clmm/openPosition`, `/connectors/uniswap/clmm/collectFees`
- Config routes: `/config/*`
  - `/config/namespaces`: List all configuration namespaces
  - `/config/chains`: Get available chains and networks
  - `/config/connectors`: List available DEX connectors
- Wallet routes: `/wallet/*`
  - `/wallet`: List all wallets
  - `/wallet/add`: Add new wallet
  - `/wallet/setDefault`: Set default wallet per chain

## Coding Style Guidelines
- TypeScript with ESNext target and CommonJS modules
- 2-space indentation (no tabs)
- Single quotes for strings
- Semicolons required
- Arrow functions preferred over function declarations
- Explicit typing encouraged (TypeBox for API schemas)
- Unused variables prefixed with underscore (_variable)
- Error handling: Use Fastify's httpErrors for API errors

## Project Structure
- `src/`: Source code
  - `chains/`: Chain-specific implementations
    - `ethereum/`: Ethereum chain implementation with route handlers
    - `solana/`: Solana chain implementation with route handlers
  - `connectors/`: DEX and protocol connectors
    - `jupiter/router-routes/`: Jupiter aggregator routes
    - `meteora/clmm-routes/`: Meteora DLMM routes
    - `raydium/`: Contains both `amm-routes/` and `clmm-routes/`
    - `uniswap/`: Contains `router-routes/`, `amm-routes/`, and `clmm-routes/`
    - `0x/router-routes/`: 0x aggregator routes
  - `services/`: Core services and utilities
    - `config-manager-v2.ts`: Configuration management
    - `logger.ts`: Logging service
    - `wallet/`: Wallet management services
  - `schemas/`: API schemas and type definitions
    - `chain-schema.ts`: Chain operation schemas
    - `router-schema.ts`: Router/aggregator schemas
    - `amm-schema.ts`: AMM operation schemas
    - `clmm-schema.ts`: CLMM operation schemas
  - `config/`: Configuration-related routes and utils
    - `routes/`: Config API endpoints
  - `wallet/`: Wallet management routes
    - `routes/`: Wallet API endpoints
  - `templates/`: Configuration templates
    - `chains/`: Chain config templates
    - `connectors/`: Connector config templates
    - `namespace/`: JSON schema definitions
    - `tokens/`: Token lists by network
- `test/`: Test files mirroring src structure
  - `mocks/`: Mock data organized by module type
- `conf/`: Runtime configuration (created by setup)
  - `lists/`: Token lists for each network

## Best Practices
- Create tests for all new functionality (minimum 75% coverage for PRs)
- Use the logger for debug/errors (not console.log)
- Use Fastify's httpErrors for API error responses:
  - `fastify.httpErrors.badRequest('Invalid input')`
  - `fastify.httpErrors.notFound('Resource not found')`
  - `fastify.httpErrors.internalServerError('Something went wrong')`
- Create route files in dedicated routes/ folders
- Define schemas using TypeBox
- Prefer async/await over promise chains
- Follow singleton pattern for chains/connectors

## Adding New Features
- Follow existing patterns in chains/connectors directories
- Create corresponding test files with mock data
- Use TypeBox for all request/response schema definitions
- Register new routes in appropriate route files
- Update chain.routes.ts or connector.routes.ts to list new modules

## Configuration
- Chain configs: `src/templates/{chain}.yml`
- Connector configs: `src/templates/{connector}.yml`
- Token lists: `src/templates/lists/{network}.json`
- All configs validated against JSON schemas in `src/templates/namespace/`

## Supported Networks

### Ethereum & EVM Networks
- Ethereum Mainnet
- Arbitrum
- Avalanche
- Base
- BSC (Binance Smart Chain)
- Celo
- Optimism
- Polygon
- Sepolia (testnet)

### Solana Networks
- Solana Mainnet-Beta
- Solana Devnet

## Supported DEX Connectors
- **Jupiter** (Solana): Router-based swaps via DEX aggregator
- **Meteora** (Solana): DLMM operations
- **Raydium** (Solana): Standard AMM and CLMM operations
- **Uniswap** (Ethereum/EVM): V2 AMM, V3 CLMM, and V3 Smart Order Router swaps
- **0x** (Ethereum/EVM): Router-based swaps via DEX aggregator

### Supported DEX Protocols

| Protocol | Chain | Router | AMM | CLMM |
|----------|-------|--------|-----|------|
| Jupiter | Solana | ✅ | ❌ | ❌ |
| Meteora | Solana | ❌ | ❌ | ✅ |
| Raydium | Solana | ❌ | ✅ | ✅ |
| Uniswap | Ethereum/EVM | ✅ | ✅ | ✅ |
| 0x | Ethereum/EVM | ✅ | ❌ | ❌ |

## Environment Variables
- `GATEWAY_PASSPHRASE`: Set passphrase for wallet encryption
- `GATEWAY_TEST_MODE=dev`: Run tests in development mode
- `START_SERVER=true`: Required to start the server
- `DEV=true`: Run in HTTP mode (Docker)

## Hummingbot Gateway Endpoint Standardization
- This repo standardized DEX and chain endpoints that are used by Hummingbot strategies. See this branch for the matching code, especially the Gateway connector classes https://github.com/hummingbot/hummingbot/tree/development

