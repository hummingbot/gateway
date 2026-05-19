# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.
Keep this file in sync with `CLAUDE.md` — changes to one must be reflected in the other.

## Lenses

Apply all lenses before proposing any solution. Each lens constrains acceptable answers.

- Hummingbot lens: Gateway is consumed by Hummingbot Python strategies via typed connector classes. API response shapes are parsed directly into Python dicts — breaking changes to field types or names silently corrupt live trading bots. Prefer additive changes (new optional fields) over mutations. `walletAddresses` must remain `string[]`. Use Tolerant Reader pattern for all response extensions.
- Blockchain lens: The `chain` field is the technology substrate (ethereum = all EVM, solana = SVM). `network` is the L1/L2 brand discriminator (mainnet, bsc, arbitrum, base, polygon, avalanche). A wallet address is chain-scoped, not network-scoped — the same keypair works across all EVM networks. Wallet files are stored under `conf/wallets/<chain>/<address>.json` as `{encryptedKey, network}` JSON; legacy files contain a raw encrypted string and must be handled transparently.
- System Architect lens: Routes follow `/{resource}/{operation}` REST conventions. Schemas are TypeBox objects auto-published to Swagger — every new field must be typed. Backwards compatibility is enforced via optional fields, never field removal or type mutation. Singleton pattern governs chain/connector instances (`getInstance(network)`). Error responses must use Fastify `httpErrors` — never throw raw errors from route handlers.
- Bitcoin lens: Not directly supported, but cryptographic primitives (key derivation, encryption, signing) must remain chain-agnostic. Wallet encryption uses a passphrase-derived key stored outside source control. Never log or expose private keys or passphrases in any code path.

## Build & Command Reference

- Build: `pnpm build`
- Start server: `pnpm start --passphrase=<PASSPHRASE>`
- Start in dev mode: `pnpm start --passphrase=<PASSPHRASE> --dev` (HTTP mode, no SSL)
- Run all tests: `pnpm test`
- Run specific test file: `GATEWAY_TEST_MODE=dev jest --runInBand path/to/file.test.ts`
- Run tests with coverage: `pnpm test:cov`
- Lint: `pnpm lint` / Format: `pnpm format` / Type check: `pnpm typecheck`

## Architecture Overview

- RESTful API gateway built with Fastify + TypeBox schemas (auto-generates Swagger at `/docs`)
- Chain routes: `/chains/{chain}/{operation}` — e.g. `/chains/ethereum/balances`
- Connector routes: `/connectors/{dex}/{type}/{operation}` — type is `router`, `amm`, or `clmm`
- Wallet routes: `/wallet/*`
- Config routes: `/config/*`
- Chains are singletons: `Ethereum.getInstance(network)`, `Solana.getInstance(network)`
- Connectors are singletons: `Pancakeswap.getInstance(network)`, `Uniswap.getInstance(network)`
- `chain` = substrate (`ethereum` covers all EVM networks, `solana` covers all SVM networks)
- `network` = specific network (`mainnet`, `bsc`, `arbitrum`, `base`, `mainnet-beta`, etc.)
- `chainNetwork` = combined shorthand (`ethereum-bsc`, `ethereum-arbitrum`) parsed as `chain-network`

## Coding Style

- TypeScript, ESNext, CommonJS modules, 2-space indent, single quotes, semicolons required
- TypeBox for all request/response schemas — no untyped `any` in route handlers
- `logger` for all logging — never `console.log`
- `fastify.httpErrors.*` for all API error responses — never throw raw `Error` from handlers
- Unused variables prefixed with `_`
- Tests required for all new functionality (min 75% coverage for PRs)
- Test files mirror `src/` structure under `test/`; mocks live in `test/mocks/`

## Key Patterns

- New wallet files: `JSON.stringify({ encryptedKey, network })` — always read with fallback to legacy raw string
- `chainNetwork` parsing: `parts = val.split('-'); chain = parts[0]; network = parts.slice(1).join('-')`
- Response extension: add optional fields alongside existing ones — never mutate existing field types
- Route files live in `{module}/routes/{operation}.ts`, registered in `{module}.routes.ts`
- Pool configs: `src/templates/pools/{connector}.json` — format: `{ type, network, baseSymbol, quoteSymbol, baseTokenAddress, quoteTokenAddress, feePct, address }`
