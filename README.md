```
╔██████╗  █████╗ ████████╗███████╗██╗    ██╗ █████╗ ██╗   ██╗
██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝██║    ██║██╔══██╗╚██╗ ██╔╝
██║  ███╗███████║   ██║   █████╗  ██║ █╗ ██║███████║ ╚████╔╝
██║   ██║██╔══██║   ██║   ██╔══╝  ██║███╗██║██╔══██║  ╚██╔╝
╚██████╔╝██║  ██║   ██║   ███████╗╚███╔███╔╝██║  ██║   ██║
 ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝
```

# Hummingbot Gateway

## Introduction

Hummingbot Gateway is a versatile API and Model Context Protocol (MCP) server that standardizes interactions with blockchain networks and decentralized exchanges (DEXs). It acts as a middleware layer, providing a unified interface for performing actions like checking balances, executing trades, and managing wallets across different protocols.

Gateway can be accessed through:
- **MCP (Model Context Protocol)**: Use AI assistants like Claude to interact with Gateway through natural language
- **REST API**: Direct HTTP/HTTPS endpoints for programmatic access
- **Hummingbot Client**: For automated trading strategies, use the [Hummingbot repository](https://github.com/hummingbot/hummingbot)

### Key Features
- **Standardized REST API**: Consistent endpoints for interacting with blockchains (Ethereum, Solana) and DEXs (Uniswap, Jupiter, Raydium, Meteora)
- **MCP Integration**: Natural language interaction with trading operations through AI assistants
- **Modular Architecture**: Clear separation of concerns with distinct modules for chains, connectors, configuration, and wallet management
- **TypeScript-based**: Leverages the TypeScript ecosystem and popular libraries like Fastify, Ethers.js, and Solana/web3.js
- **Extensible**: Easily extended with new chains and connectors

### Core Technologies
- **Backend**: Node.js, TypeScript, Fastify
- **Blockchain Interaction**: Ethers.js (Ethereum), @solana/web3.js (Solana)
- **Package Manager**: pnpm
- **Testing**: Jest
- **Linting/Formatting**: ESLint, Prettier

### API Overview

- GET /chains - List all available blockchain networks and their supported networks
- GET /connectors - List all available DEX connectors and their supported networks
- GET /ethereum/... - Ethereum chain endpoints (balances, tokens, allowances)
- GET /solana/... - Solana chain endpoints (balances, tokens)
- GET /jupiter/... - Jupiter Aggregator swap endpoints
- GET /uniswap/... - Uniswap swap, AMM, and CLMM endpoints
- GET /uniswap/routes/quote-swap - Get price quote using Uniswap V3 Swap Router (recommended for token swapping)
- GET /uniswap/routes/execute-swap - Execute swap using Uniswap V3 Swap Router (recommended for token swapping)
- GET /raydium/amm/... - Raydium AMM endpoints
- GET /raydium/clmm/... - Raydium CLMM endpoints
- GET /meteora/clmm/... - Meteora CLMM endpoints

Gateway is written in TypeScript to leverage JavaScript-based SDKs provided by blockchains and DEX protocols. The advantage of using Gateway is it provides a standardized, language-agnostic approach to interacting with these protocols.

## MCP (Model Context Protocol) Integration

Gateway includes an enhanced MCP server that exposes trading operations as tools for AI assistants like Claude. This enables natural language interaction with decentralized exchanges and blockchain networks with reduced permission requests through resources and prompts.

### Available MCP Tools (18 total)

#### Discovery Tools (4)
- **get_chains** - Get available blockchain networks
- **get_connectors** - Get available DEX connectors
- **get_tokens** - Get supported tokens for a chain/network
- **get_status** - Get blockchain network status

#### Configuration Tools (5)
- **get_config** - Get configuration settings
- **update_config** - Update configuration values
- **get_pools** - Get default pools for a connector
- **add_pool** - Add a default pool
- **remove_pool** - Remove a default pool

#### Trading Tools (5)
- **quote_swap** - Get swap quotes
- **execute_swap** - Execute token swaps
- **get_pool_info** - Get liquidity pool information
- **estimate_gas** - Estimate gas prices
- **poll_transaction** - Poll transaction status

#### Wallet Tools (4)
- **wallet_list** - List wallets
- **wallet_add** - Add new wallet
- **wallet_remove** - Remove wallet
- **get_balances** - Get token balances

### MCP Resources (8 total)
Resources provide read-only access without requiring permissions:

- `gateway://chains` - Available blockchain networks
- `gateway://connectors` - DEX connectors and capabilities
- `gateway://config/ethereum` - Ethereum configuration
- `gateway://config/solana` - Solana configuration
- `gateway://wallets` - Wallet list
- `gateway://token-lists/ethereum-mainnet` - Ethereum token list
- `gateway://token-lists/solana-mainnet` - Solana token list
- `gateway://openapi` - Complete API specification

### MCP Prompts (4 total)
Guided workflows for complex operations:

- **swap_optimizer** - Find best swap route across DEXs
- **portfolio_analyzer** - Analyze wallet portfolio
- **liquidity_finder** - Find best liquidity pools
- **gas_optimizer** - Optimize gas settings

### Quick Start with Claude Code

```bash
# 1. Build MCP server
pnpm mcp:build

# 2. Start Gateway
pnpm start --passphrase=YOUR_PASSPHRASE

# 3. Add to Claude Code (from gateway directory)
claude mcp add gateway -e GATEWAY_URL=http://localhost:15888 -- node dist/mcp/index.js

# 4. Use in Claude Code
# Example: "What chains are available?"
# Example: "Show me the Ethereum configuration" (uses resource, no permission needed)
# Example: "Help me find the best swap route for 1 ETH to USDC" (uses prompt)
```

### MCP Benefits

- **Fewer Interruptions**: Resources and prompts reduce permission requests
- **Better Organization**: Tools grouped by functionality
- **Offline Support**: Fallback data when Gateway isn't running
- **Guided Assistance**: Prompts provide structured workflows
- **Comprehensive Coverage**: All major Gateway operations exposed

For detailed MCP setup instructions and architecture, see the [MCP documentation](./src/mcp/README.md).

Gateway may be used alongside the main [Hummingbot client](https://github.com/hummingbot/hummingbot) to enable trading and market making on DEXs, or as a standalone API/MCP server.

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

- The format of configuration files are dictated by [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts) and the corresponding schema files in [src/templates/namespace](./src/templates/namespace).

- For each supported chain, token lists that translate address to symbols for each chain are stored in `/conf/tokens`. Use the `/tokens` API endpoints to manage tokens - changes require a Gateway restart to take effect.


## Architecture

Gateway follows a modular architecture with clear separation of concerns:

```
/src
├── chains/               # Blockchain-specific implementations
├── connectors/           # DEX-specific implementations
├── mcp/                  # Model Context Protocol server
├── services/             # Core services (config, logging, tokens)
├── schemas/              # API request/response schemas (TypeBox)
├── config/               # Configuration routes and utilities
└── wallet/               # Wallet management
```

### Key Components

#### Chains
The `src/chains` directory contains blockchain network implementations. Each chain module includes:
- Core chain class implementing operations like `getBalances`, `getTokens`
- Chain-specific routes defining API endpoints
- Configuration management for the chain

#### Connectors
The `src/connectors` directory houses DEX protocol implementations. Each connector provides:
- **Quoting**: Getting price quotes for swaps
- **Trading**: Executing trades
- **Liquidity Pool Info**: Fetching pool information
- Support for different DEX models (AMM, CLMM)

#### MCP Server
The `src/mcp` directory implements the Model Context Protocol server, exposing Gateway's functionality as "tools" that can be called by AI assistants.

#### Services
Essential services in `src/services` include:
- **config-manager-v2.ts**: Robust configuration management with validation
- **logger.ts**: Flexible logging service
- **token-service.ts**: Token list management with security validation

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

## Troubleshooting

### Fixing bigint-buffer warnings

If you see warnings like `bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)` when running Gateway, you can safely ignore them. The warnings are related to the bigint-buffer package, which falls back to pure JavaScript implementation when native bindings are not available. This doesn't affect Gateway's functionality.

If you want to attempt to fix these warnings, you can run:

```bash
pnpm rebuild-bigint
```

Note that this requires having the necessary C++ build tools installed on your system.
