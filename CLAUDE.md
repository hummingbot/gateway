# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Command Reference
- Build: `pnpm build`
- Start server: `pnpm start`
- Run all tests: `pnpm test`
- Run specific test file: `GATEWAY_TEST_MODE=dev jest --runInBand path/to/file.test.ts`
- Lint code: `pnpm lint`
- Format code: `pnpm format`
- Type check: `pnpm typecheck`

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
  - `system/`: System-level routes and utilities
    - `config/`: Configuration-related routes and utils
    - `connectors/`: Connector routes
    - `wallet/`: Wallet management routes
- `test/`: Test files mirroring src structure

## Best Practices
- Create tests for all new functionality
- Use the logger for debug/errors (not console.log)
- Use Fastify's httpErrors for API error responses:
  - `fastify.httpErrors.badRequest('Invalid input')`
  - `fastify.httpErrors.notFound('Resource not found')`
  - `fastify.httpErrors.internalServerError('Something went wrong')`
- Create route files in dedicated routes/ folders
- Define schemas using TypeBox
- Prefer async/await over promise chains