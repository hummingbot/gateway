![Hummingbot](https://i.ibb.co/X5zNkKw/blacklogo-with-text.png)

# Hummingbot Gateway

## Introduction

Hummingbot Gateway is an API/CLI client that exposes standardized REST endponts to perform actions and fetch data from **blockchain networks** (wallet, node & chain interaction) and their **decentralized exchanges (DEX)** (pricing, trading & liquidity provision).

Gateway is written in Typescript in order to use Javascript-based SDKs provided by blockchains and DEX protocols. The advantage of using Gateway is it provides a standardized, language-agnostic approach to interacting with these protocols.

Gateway may be used alongside the main [Hummingbot client](https://github.com/hummingbot/hummingbot) to enable trading and market making on DEXs, or as a standalone command line interface (CLI).

Gateway uses [Swagger](https://swagger.io/) for API documentation. When Gateway is started in HTTP mode, it automatically generates interactive Swagger API docs at: <http://localhost:15888/docs>


## Installation from Source

### Install NodeJS 20+

We recommend downloading the graphical installer from the [NodeJS official site](https://nodejs.org/en/download/).

For terminal-based users, follow the steps below to install from a Linux-based machine (Ubunbu 20+)

```bash
#  Ensure your package list is up to date and install curl
sudo apt update && sudo apt install -y curl

# Add Node 20.x repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -


# Install the default versions from Ubuntu’s repository:
sudo apt install -y nodejs

# Check Node.js version: 
nodejs --version
```  

### Install `pnpm` package manager

`pnpm` is a faster and more space-efficient package manager than `npm`.

```bash
# Install PNPM globally
sudo npm install -g pnpm

# Check pnpm version
pnpm --version
```

### Clone Gateway repo

```bash
# Clone Github repo
git clone https://github.com/hummingbot/gateway.git

# Go to newly created folder
cd gateway

# Switch to main branch (or a specific version branch like core-2.6)
git checkout main
```

### Setup Gateway
```bash
# Install JS libraries
pnpm install

# Complile Typescript into JS
pnpm build

# Run Gateway setup script, which helps you set configs and CERTS_PATH
pnpm run setup
```

### Start Gateway

You can run Gateway in the Gateway server in unencrypted HTTP mode using the `--dev` flag. Note that a passphrase is still needed to encrypt and decrypt wallets used in executing transactions.

```bash
pnpm start --passphrase=<PASSPHRASE> --dev
```

To start the Gateway server in HTTPS mode, run the command without the `--dev` flag. Make sure to use the same passphrase that you used to generate certs in the Hummingbot client.

```bash
pnpm start --passphrase=<PASSPHRASE>
```

## Installation with Docker

Build the Gateway Docker image locally by executing the below command. You may replace `development` with a tag of your choice.

```bash
docker build \
  --build-arg BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  --build-arg COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%d") \
  -t hummingbot/gateway:development -f Dockerfile .
```

### Start Gateway from Docker

Start a container in HTTPS mode using this `development` Docker image. Make sure to replace `<PASSPHRASE>` with the passphrase you used to generate the certs in the Hummingbot client. 

```bash
docker run --name gateway \
  -p 15888:15888 \
  -v "$(pwd)/conf:/home/gateway/conf" \
  -v "$(pwd)/logs:/home/gateway/logs" \
  -v "$(pwd)/db:/home/gateway/db" \
  -v "$(pwd)/certs:/home/gateway/certs" \
  -e GATEWAY_PASSPHRASE=<PASSPHRASE> \
  hummingbot/gateway:development
```
Afterwards, clients with valid certificates can connect to Gateway at: <https://localhost:15888>

You may also start the container in HTTP mode by setting the `DEV` environment variable to `true`. Note that this will disable HTTPS and allow unauthenticated access to Gateway and its endpoints.

```bash
docker run --name gateway \
  -p 15888:15888 \
  -v "$(pwd)/conf:/home/gateway/conf" \
  -v "$(pwd)/logs:/home/gateway/logs" \
  -v "$(pwd)/db:/home/gateway/db" \
  -v "$(pwd)/certs:/home/gateway/certs" \
  -e DEV=true \
  hummingbot/gateway:development
```

Afterwards, client may connect to Gateway at: <http://localhost:15888> and you can access the Swagger documentation UI at: <http://localhost:15888/docs>


## CLI Commands

When running Gateway from source, it provides a CLI interface for interacting with chains and DEXs. After installing from source, you can enable the `gateway` command by linking the CLI globally:
```bash
pnpm link --global
```

Afterwards, you can use the `gateway` command to see available commands:
```bash
gateway
```

Sample commands:
```bash
# Check wallet balances (requires running server)
gateway balance --chain solana --wallet <WALLET_ADDRESS>

# Build project from source (same as pnpm build)
gateway build

# Start the API server (same as pnpm start)
gateway start --passphrase=<PASSPHRASE> [--dev]

# Get command help
gateway help [COMMAND]
```

**Note:** Similar to the server, CLI commands require a `passphrase` argument used to encrypt and decrypt wallets used in executing transactions. Set the passphrase using the `--passphrase` argument when starting the server or by setting the `GATEWAY_PASSPHRASE` environment variable:
```bash
export GATEWAY_PASSPHRASE=<PASSPHRASE>
```

## Contribution

Gateway is part of the open source Hummingbot project, which is powered by community contributions. Please see the [Contributing](https://hummingbot.org/gateway/contributing/) guide in the Hummingbot docs for more information.

Here are some ways that you can contribute to Gateway:

- File an issue at [hummingbot issues](https://github.com/hummingbot/gateway/issues)
- Make a [pull request](https://github.com/hummingbot/gateway/)
- Edit the [docs](https://github.com/hummingbot/hummingbot-site/)
- Vote in quarterly [polls](https://snapshot.org/#/hbot.eth) to decide which DEXs Gateway should support

## Configuration

- To run in HTTP mode (for development), use `pnpm start --dev`. By default, Gateway runs in secure HTTPS mode.

- If you want Gateway to log to standard out, set `logToStdOut` to `true` in [conf/server.yml](./conf/server.yml).

- The format of configuration files are dictated by [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts) and the corresponding schema files in [src/schemas/json](./src/schemas/json).

- For each supported chain, token lists that translate address to symbols for each chain are stored in `/conf/lists`. You can add tokens here to make them available to Gateway.


## Architecture

Gateway follows a modular architecture with clear separation of concerns between chains, connectors, and system components:

- **Chains**: Blockchain network implementations
  - [src/chains/ethereum/ethereum.ts](./src/chains/ethereum/ethereum.ts): Core Ethereum chain operations
  - [src/chains/solana/solana.ts](./src/chains/solana/solana.ts): Core Solana chain operations

- **Connectors**: DEX protocol implementations
  - [src/connectors/connector.interfaces.ts](./src/connectors/connector.interfaces.ts): Standard interfaces for all connectors
  - [src/connectors/jupiter/jupiter.ts](./src/connectors/jupiter/jupiter.ts): Jupiter DEX connector for Solana
  - [src/connectors/raydium/raydium.ts](./src/connectors/raydium/raydium.ts): Raydium DEX connector for Solana (AMM, CLMM, Launchpad)
  - [src/connectors/uniswap/uniswap.ts](./src/connectors/uniswap/uniswap.ts): Uniswap DEX connector for Ethereum

- **System**: Core system components and utilities
  - [src/system/wallet/utils.ts](./src/system/wallet/utils.ts): Wallet management utilities
  - [src/system/config/utils.ts](./src/system/config/utils.ts): Configuration management utilities

- **Schemas**: Common type definitions and schemas
  - [src/schemas/trading-types/clmm-schema.ts](./src/schemas/trading-types/clmm-schema.ts): Standard schemas for CLMM operations
  - [src/schemas/trading-types/amm-schema.ts](./src/schemas/trading-types/amm-schema.ts): Standard schemas for AMM operations
  - [src/schemas/trading-types/swap-schema.ts](./src/schemas/trading-types/swap-schema.ts): Standard schemas for swap operations

- **Services**: Core functionality and utilities
  - [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts): Configuration management
  - [src/services/logger.ts](./src/services/logger.ts): Logging utilities
  - [src/services/base.ts](./src/services/base.ts): Base service functionality

## Testing

For a pull request merged into the codebase, it has to pass unit test coverage requirements. Take a look at [Workflow](./.github/workflows/workflow.yml) for more details.

### Unit tests

Run all unit tests.

```bash
pnpm test
```

Run an individual test folder or file

```bash
GATEWAY_TEST_MODE=dev jest --runInBand test/<folder>/<file>.test.ts
```

### Test Structure

The test directory is organized as follows:

```
/test
  /schemas/                   # Schema and API validation tests 
  /services/                  # Service tests
    /data/                    # Test data files
  /wallet/                    # Wallet tests
  /utils/                     # Test utilities
```

### Manual tests

We have found it is useful to test individual endpoints with `curl` commands. We have a collection of prepared curl calls. POST bodies are stored in JSON files. Take a look at the [curl calls for gateway](./test-helpers/curl/curl.sh). Note that some environment variables are expected.

## Adding a New Chain or Connector

### Adding a New Chain

1. Create chain implementation files:
   ```bash
   mkdir -p src/chains/yourchain/routes
   touch src/chains/yourchain/yourchain.ts
   touch src/chains/yourchain/yourchain.config.ts
   touch src/chains/yourchain/yourchain.routes.ts
   touch src/chains/yourchain/yourchain.utils.ts
   ```

2. Create test mock files:
   ```bash
   mkdir -p test/schemas/mock-responses/yourchain
   touch test/schemas/mock-responses/yourchain/balance.json
   touch test/schemas/mock-responses/yourchain/status.json
   touch test/schemas/mock-responses/yourchain/estimate-gas.json
   ```

3. Create test parameter files:
   ```bash
   mkdir -p test/schemas/test-params/yourchain
   touch test/schemas/test-params/yourchain/balance.json
   touch test/schemas/test-params/yourchain/status.json
   touch test/schemas/test-params/yourchain/estimate-gas.json
   ```

4. Create schema test files (if needed) or reuse existing schema tests

### Adding a New Connector

1. Create connector implementation files:
   ```bash
   mkdir -p src/connectors/yourconnector/routes
   touch src/connectors/yourconnector/yourconnector.ts
   touch src/connectors/yourconnector/yourconnector.config.ts
   touch src/connectors/yourconnector/yourconnector.routes.ts
   ```

2. If the connector supports AMM, create these files:
   ```bash
   mkdir -p src/connectors/yourconnector/amm-routes
   touch src/connectors/yourconnector/amm-routes/executeSwap.ts
   touch src/connectors/yourconnector/amm-routes/poolInfo.ts
   touch src/connectors/yourconnector/amm-routes/quoteSwap.ts
   # Add other AMM operation files as needed
   ```

3. If the connector supports CLMM, create these files:
   ```bash
   mkdir -p src/connectors/yourconnector/clmm-routes
   touch src/connectors/yourconnector/clmm-routes/executeSwap.ts
   touch src/connectors/yourconnector/clmm-routes/poolInfo.ts
   touch src/connectors/yourconnector/clmm-routes/quoteSwap.ts
   touch src/connectors/yourconnector/clmm-routes/openPosition.ts
   # Add other CLMM operation files as needed
   ```

4. Create test mock files:
   ```bash
   mkdir -p test/schemas/mock-responses/yourconnector
   touch test/schemas/mock-responses/yourconnector/swap-quote.json
   touch test/schemas/mock-responses/yourconnector/swap-execute.json
   # Add other mock response files as needed
   ```

5. Create test parameter files:
   ```bash
   mkdir -p test/schemas/test-params/yourconnector
   touch test/schemas/test-params/yourconnector/swap-quote.json
   touch test/schemas/test-params/yourconnector/swap-execute.json
   # Add other test parameter files as needed
   ```

## Linting

This repo uses `eslint` and `prettier`. When you run `git commit` it will trigger the `pre-commit` hook. This will run `eslint` on the `src` and `test` directories.

You can lint before committing with:

```bash
pnpm run lint
```

You can run the prettifier before committing with:

```bash
pnpm run prettier
```


