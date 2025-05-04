# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Command Reference
- Build: `pnpm build`
- Start server: `pnpm start`
- Run all tests: `pnpm test`
- Run specific test file: `GATEWAY_TEST_MODE=dev jest --runInBand path/to/file.test.ts`
- Lint code: `pnpm lint`
- Format code: `pnpm format`

## Coding Style Guidelines
- TypeScript with ESNext target and CommonJS modules
- 2-space indentation (no tabs)
- Single quotes for strings
- Semicolons required
- Arrow functions preferred over function declarations
- Explicit typing encouraged (TypeBox/Zod for API schemas)
- Unused variables prefixed with underscore (_variable)
- Error handling: Use appropriate try/catch blocks and logger

## Project Structure
- `src/`: Source code
  - `chains/`: Chain-specific implementations
  - `connectors/`: DEX and protocol connectors
  - `services/`: Core services and utilities
  - `schemas/`: API and config schemas
- `test/`: Test files mirroring src structure

## Best Practices
- Create tests for all new functionality
- Use the logger for debug/errors (not console.log)
- Follow existing code patterns for error handling
- Prefer async/await over promise chains