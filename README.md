![Hummingbot](https://i.ibb.co/X5zNkKw/blacklogo-with-text.png)

# Hummingbot Gateway

## Introduction

Hummingbot Gateway is an API/CLI client that exposes standardized REST endponts to perform actions and fetch data from **blockchain networks** (wallet, node & chain interaction) and their **decentralized exchanges (DEX)** (pricing, trading & liquidity provision).

### API Overview

- GET /chains - List all available blockchain networks and their supported networks
- GET /connectors - List all available DEX connectors and their supported networks
- GET /ethereum/... - Ethereum chain endpoints (balances, tokens, allowances)
- GET /solana/... - Solana chain endpoints (balances, tokens)
- GET /jupiter/... - Jupiter Aggregator swap endpoints
- GET /uniswap/... - Uniswap swap, AMM, and CLMM endpoints
- GET /uniswap/routes/... - Uniswap Universal Router swap endpoints (recommended for token swapping)
- GET /raydium/amm/... - Raydium AMM endpoints
- GET /raydium/clmm/... - Raydium CLMM endpoints
- GET /meteora/clmm/... - Meteora CLMM endpoints

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

Gateway follows a modular architecture with clear separation of concerns between chains, connectors, configuration, and wallet management:

- **Chains**: Blockchain network implementations
  - [src/chains/chain.routes.ts](./src/chains/chain.routes.ts): List of supported chains and networks
  - [src/chains/ethereum/ethereum.ts](./src/chains/ethereum/ethereum.ts): Core Ethereum chain operations
  - [src/chains/solana/solana.ts](./src/chains/solana/solana.ts): Core Solana chain operations

- **Connectors**: DEX protocol implementations
  - [src/connectors/connector.routes.ts](./src/connectors/connector.routes.ts): List of available DEX connectors
  - [src/connectors/jupiter/jupiter.ts](./src/connectors/jupiter/jupiter.ts): Jupiter DEX connector for Solana
  - [src/connectors/raydium/raydium.ts](./src/connectors/raydium/raydium.ts): Raydium DEX connector for Solana (AMM, CLMM)
  - [src/connectors/uniswap/uniswap.ts](./src/connectors/uniswap/uniswap.ts): Uniswap DEX connector for Ethereum
  - [src/connectors/uniswap/routes/quote-swap.ts](./src/connectors/uniswap/routes/quote-swap.ts): Uniswap Universal Router for quote generation
  - [src/connectors/uniswap/routes/execute-swap.ts](./src/connectors/uniswap/routes/execute-swap.ts): Uniswap Universal Router for swap execution
  - [src/connectors/uniswap/uniswap.contracts.ts](./src/connectors/uniswap/uniswap.contracts.ts): Contract addresses including Universal Router addresses for all networks

- **Configuration**: Configuration management
  - [src/config/config.routes.ts](./src/config/config.routes.ts): Configuration endpoints
  - [src/config/utils.ts](./src/config/utils.ts): Configuration utilities

- **Wallet**: Wallet management
  - [src/wallet/wallet.routes.ts](./src/wallet/wallet.routes.ts): Wallet endpoints
  - [src/wallet/utils.ts](./src/wallet/utils.ts): Wallet utilities

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
  /chains/                    # Chain endpoint tests
    chain.test.js            # Chain routes test
    ethereum.test.js         # Ethereum chain tests
    solana.test.js           # Solana chain tests
  /connectors/                # Connector endpoint tests by protocol
    /jupiter/                 # Jupiter connector tests
    /uniswap/                 # Uniswap connector tests
    /raydium/                 # Raydium connector tests
    /meteora/                 # Meteora connector tests
  /mocks/                     # Mock response data
    /chains/                  # Chain mock responses
      chains.json            # Chain routes mock response
      /ethereum/             # Ethereum mock responses
      /solana/               # Solana mock responses
    /connectors/              # Connector mock responses
  /services/                  # Service tests
    /data/                    # Test data files
  /wallet/                    # Wallet tests
  /config/                    # Configuration tests
  /jest-setup.js              # Test environment configuration
```

For more details on the test setup and structure, see [Test README](./test/README.md).

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
   mkdir -p test/mocks/chains/yourchain
   touch test/mocks/chains/yourchain/balance.json
   touch test/mocks/chains/yourchain/status.json
   touch test/mocks/chains/yourchain/tokens.json
   ```

3. Create chain test file:
   ```bash
   touch test/chains/yourchain.test.js
   ```

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
   mkdir -p test/mocks/connectors/yourconnector
   touch test/mocks/connectors/yourconnector/amm-pool-info.json
   touch test/mocks/connectors/yourconnector/amm-quote-swap.json
   touch test/mocks/connectors/yourconnector/clmm-pool-info.json
   touch test/mocks/connectors/yourconnector/clmm-quote-swap.json
   # Add other mock response files as needed
   ```

5. Create connector test files:
   ```bash
   mkdir -p test/connectors/yourconnector
   touch test/connectors/yourconnector/amm.test.js
   touch test/connectors/yourconnector/clmm.test.js
   touch test/connectors/yourconnector/swap.test.js
   ```

## Linting and Formatting

This repo uses `eslint` and `prettier` for code quality and consistent formatting.

Run linting manually with:

```bash
pnpm lint
```

Format code with prettier:

```bash
pnpm format
```
