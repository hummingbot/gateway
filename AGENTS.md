# Repository Guidelines

## Project Structure & Modules
- `src/`: TypeScript sources
  - `chains/`, `connectors/`, `services/`, `wallet/`, `templates/`
- `test/`: Jest tests, mocks, helpers
- `conf/`: Local runtime configuration (gitignored)
- `dist/`: Build output (generated)
- `logs/`, `coverage/`: Runtime and test artifacts (gitignored)

## Build, Test, and Dev Commands
- `pnpm install`: Install dependencies (Node 20+).
- `pnpm build`: Compile TypeScript to `dist/` and copy templates.
- `pnpm start -- --passphrase=<PASSPHRASE> [--dev]`: Run server (HTTP with `--dev`, HTTPS otherwise).
- `pnpm run setup` | `pnpm run setup:with-defaults`: Initialize configs in `conf/`.
- `pnpm test` | `pnpm test:cov`: Run tests | with coverage.
- `pnpm lint` | `pnpm format` | `pnpm typecheck`: Lint | Prettier format | TS type check.
- Example: run a single test file: `GATEWAY_TEST_MODE=dev jest --runInBand test/connectors/uniswap/uniswap.test.ts`.

## Coding Style & Naming
- Language: TypeScript. Module format: CommonJS.
- Formatting: Prettier (2 spaces, single quotes, semicolons, width 120).
- Linting: ESLint (`@typescript-eslint`, `import`, `prettier`). Sorted imports (grouped, alphabetical).
- Files/folders: `kebab-case` folders, `camelCase` variables/functions, `PascalCase` types/classes.
- Avoid unused identifiers; prefer explicit names over abbreviations.

## Testing Guidelines
- Framework: Jest with `ts-jest`. Tests in `test/**/*.(test.ts|test.js)`.
- Coverage: target ≥75% for new/changed code; include edge/error cases.
- Naming: mirror source paths, e.g. `src/services/token-service.ts` → `test/services/token-service.test.ts`.
- Use fixtures in `test/mocks/` and helpers under `test/helpers/`.

## Commit & Pull Requests
- Commits: short imperative subject, scoped when helpful. Example: `connectors/uniswap: fix quote slippage calc`.
- Before PR: `pnpm typecheck && pnpm lint && pnpm test:cov` must pass. Include:
  - Description, motivation, and risk notes
  - Linked issue(s) (e.g., `Closes #123`)
  - Test plan (commands, cases) and new/updated tests
  - API changes: sample requests/responses or `openapi.json` diff if relevant

## Security & Configuration Tips
- Do not commit secrets, `conf/`, `certs/`, or logs (already gitignored).
- Use `GATEWAY_PASSPHRASE` and `GATEWAY_DEV` env vars for local runs.
- Regenerate OpenAPI (when server is running): `pnpm run generate:openapi`.

## Architecture Notes
- Fastify server (`src/app.ts`), entrypoint (`src/index.ts`).
- Chains and connectors are singleton-per-network; register routes under their respective modules.
