# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Command Reference
- Build: `pnpm build`
- Start server: `pnpm start`
- Start in dev mode: `pnpm start --dev` (HTTP mode, no SSL)
- Run all tests: `pnpm test`
- Run specific test file: `GATEWAY_TEST_MODE=dev jest --runInBand path/to/file.test.ts`
- Run tests with coverage: `pnpm test:cov`
- Lint code: `pnpm lint`
- Format code: `pnpm format`
- Type check: `pnpm typecheck`
- Initial setup: `pnpm setup` (creates configs and generates certificates)
- Generate OpenAPI spec: `pnpm generate:openapi` (outputs to openapi.json)

## Architecture Overview

### Gateway Pattern
- RESTful API gateway providing standardized endpoints for blockchain and DEX interactions
- Built with Fastify framework using TypeBox for schema validation
- Supports both HTTP (dev mode) and HTTPS (production) protocols
- Swagger documentation auto-generated at `/docs` (http://localhost:15888/docs in dev mode)

### Module Organization
- **Chains**: Blockchain implementations (Ethereum, Solana)
  - Each chain implements standard methods: balances, tokens, status, allowances
  - Singleton pattern with network-specific instances via `getInstance()`
  
- **Connectors**: DEX protocol implementations (Jupiter, Meteora, Raydium, Uniswap)
  - Support for AMM (V2-style), CLMM (V3-style), and simple swap operations
  - Each connector organized into operation-specific route files
  - Standardized request/response schemas across all connectors

### API Route Structure
- Chain routes: `/chains/{chain}/{operation}`
- Connector routes: `/connectors/{dex}/{type}/{operation}`
- Config routes: `/config/*`
- Wallet routes: `/wallet/*`

### API Documentation
- Live Swagger docs: `/docs` endpoint when server is running
- OpenAPI specification: `openapi.json` (generated from running server)
- Use the OpenAPI spec for accurate route information and schemas
- To update OpenAPI spec: start server and run `pnpm generate:openapi`

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
  - `chains/`: Chain-specific implementations (ethereum, solana)
  - `connectors/`: DEX and protocol connectors (jupiter, meteora, raydium, uniswap)
  - `services/`: Core services and utilities
  - `schemas/`: API schemas, interfaces and type definitions
    - `json/`: JSON schema files
    - `trading-types/`: Shared trading types (AMM, CLMM, swap)
  - `config/`: Configuration-related routes and utils
  - `wallet/`: Wallet management routes
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
- All configs validated against JSON schemas in `src/templates/json/`

## Hummingbot Gateway Endpoint Standardization
- This repo standardized DEX and chain endpoints that are used by Hummingbot strategies. See this branch for the matching code, especially the Gateway connector classes https://github.com/hummingbot/hummingbot/tree/feat/gateway-2.6