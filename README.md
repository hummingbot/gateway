![Hummingbot](https://i.ibb.co/X5zNkKw/blacklogo-with-text.png)

# Hummingbot Gateway

## Introduction

Hummingbot Gateway is a REST API that provides a unified interface for interacting with **blockchain networks** (wallet, node & chain operations) and **decentralized exchanges (DEX)** (trading, liquidity provision, and market data).

Gateway abstracts the complexity of interacting with different blockchain protocols by providing standardized endpoints that work consistently across different chains and DEXs. Built with TypeScript to leverage native blockchain SDKs, it offers a language-agnostic API that can be integrated into any trading system.

### Key Features

- **Multi-Chain Support**: Ethereum (and EVM-compatible chains) and Solana
- **DEX Integration**: Jupiter, Uniswap, Raydium, and Meteora
- **Trading Types**: Simple swaps, AMM (V2-style), and CLMM (V3-style concentrated liquidity)
- **Wallet Management**: Secure wallet storage and transaction signing
- **Swagger Documentation**: Auto-generated interactive API docs at `/docs`
- **TypeBox Validation**: Type-safe request/response schemas

### Supported Networks

#### Ethereum & EVM Networks
- Ethereum Mainnet
- Arbitrum
- Avalanche
- Base
- BSC (Binance Smart Chain)
- Celo
- Optimism
- Polygon
- World Chain
- Sepolia (testnet)

#### Solana Networks
- Solana Mainnet
- Solana Devnet

### Supported DEX Protocols

| Protocol | Chain | Swap | AMM | CLMM |
|----------|-------|------|-----|------|
| Jupiter | Solana | ✅ | ❌ | ❌ |
| Meteora | Solana | ✅ | ❌ | ✅ |
| Raydium | Solana | ✅ | ✅ | ✅ |
| Uniswap | Ethereum/EVM | ✅ | ✅ | ✅ |

Gateway uses [Swagger](https://swagger.io/) for API documentation. When running in development mode, access the interactive API documentation at: <http://localhost:15888/docs>


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


## API Endpoints Overview

### System Endpoints
- `GET /` - Health check
- `GET /chains` - List supported blockchains
- `GET /connectors` - List supported DEX connectors

### Configuration Management
- `GET /config` - Get configuration
- `POST /config/update` - Update configuration

### Wallet Management
- `GET /wallet` - List all wallets
- `POST /wallet/add` - Add new wallet
- `DELETE /wallet/remove` - Remove wallet
- `POST /wallet/sign` - Sign message

### Chain Operations

#### Ethereum/EVM (`/chains/ethereum`)
- `GET /status` - Chain connection status
- `GET /tokens` - Get token information
- `GET /balances` - Get wallet balances
- `GET /allowances` - Check token allowances
- `POST /approve` - Approve token spending
- `GET /poll` - Poll transaction status

#### Solana (`/chains/solana`)
- `GET /status` - Chain connection status
- `GET /tokens` - Get token information
- `GET /balances` - Get wallet balances
- `GET /poll` - Poll transaction status

### DEX Trading Endpoints

#### Simple Swaps
- `GET /connectors/{dex}/quote-swap` - Get swap quote
- `POST /connectors/{dex}/execute-swap` - Execute swap

#### AMM Operations (Uniswap V2, Raydium)
- `GET /connectors/{dex}/amm/pool-info` - Pool information
- `GET /connectors/{dex}/amm/position-info` - LP position details
- `POST /connectors/{dex}/amm/add-liquidity` - Add liquidity
- `POST /connectors/{dex}/amm/remove-liquidity` - Remove liquidity

#### CLMM Operations (Uniswap V3, Raydium, Meteora)
- `GET /connectors/{dex}/clmm/pool-info` - Pool information
- `GET /connectors/{dex}/clmm/positions-owned` - List positions
- `POST /connectors/{dex}/clmm/open-position` - Open position
- `POST /connectors/{dex}/clmm/add-liquidity` - Add to position
- `POST /connectors/{dex}/clmm/remove-liquidity` - Remove from position
- `POST /connectors/{dex}/clmm/collect-fees` - Collect fees

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

- The format of configuration files are dictated by [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts) and the corresponding schema files in [src/templates/json](./src/templates/json).

- For each supported chain, token lists that translate address to symbols for each chain are stored in `/conf/lists`. You can add tokens here to make them available to Gateway.


## Architecture

Gateway follows a modular architecture with clear separation between chains, connectors, and core services:

### Directory Structure

```
src/
├── chains/              # Blockchain implementations
│   ├── ethereum/        # Ethereum and EVM chains
│   │   ├── ethereum.ts  # Core chain class
│   │   ├── routes/      # Individual route handlers
│   │   └── ethereum.routes.ts
│   └── solana/          # Solana chain
│       ├── solana.ts
│       ├── routes/
│       └── solana.routes.ts
├── connectors/          # DEX implementations
│   ├── jupiter/         # Jupiter aggregator (Solana)
│   ├── meteora/         # Meteora CLMM (Solana)
│   ├── raydium/         # Raydium AMM/CLMM (Solana)
│   └── uniswap/         # Uniswap V2/V3 (Ethereum)
├── schemas/             # TypeBox schemas
│   ├── trading-types/   # AMM, CLMM, Swap schemas
│   └── json/            # JSON schemas
├── services/            # Core services
├── wallet/              # Wallet management
└── config/              # Configuration management
```

### Design Patterns

- **Singleton Pattern**: Chains and connectors use singleton instances per network
- **Route Organization**: Each module has a dedicated routes folder with operation-specific files
- **Schema Validation**: All API requests/responses validated with TypeBox schemas
- **Error Handling**: Consistent error responses using Fastify's httpErrors

### Key Components

#### Chains
Handle blockchain interactions including:
- Wallet balance queries
- Token information and lists
- Transaction submission and monitoring
- Gas estimation
- Token approvals (EVM only)

#### Connectors
Implement DEX-specific logic for:
- Price quotes and routing
- Swap execution
- Liquidity pool operations
- Position management (CLMM)
- Fee collection

#### Services
Provide shared functionality:
- Configuration management with YAML/JSON schemas
- Structured logging with Winston
- Database operations with LevelDB
- API server setup with Fastify

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

## Development Guide

### Adding a New Chain

1. **Create chain implementation**:
   ```typescript
   // src/chains/mychain/mychain.ts
   export class MyChain extends ChainBase {
     private static instances: Record<string, MyChain> = {};
     
     public static getInstance(network: string): MyChain {
       if (!MyChain.instances[network]) {
         MyChain.instances[network] = new MyChain(network);
       }
       return MyChain.instances[network];
     }
   }
   ```

2. **Implement required methods**:
   - `getWallet(address: string)`
   - `getBalance(address: string)`
   - `getTokens(tokenSymbols: string[])`
   - `getStatus()`

3. **Create route handlers** in `src/chains/mychain/routes/`

4. **Add configuration**:
   - Create `src/templates/mychain.yml`
   - Add JSON schema in `src/templates/json/mychain-schema.json`

5. **Register the chain** in `src/chains/chain.routes.ts`

### Adding a New Connector

1. **Choose the appropriate base class**:
   - For AMM: Extend from AMM base functionality
   - For CLMM: Implement CLMM interface
   - For simple swaps: Implement basic swap methods

2. **Create connector class**:
   ```typescript
   // src/connectors/mydex/mydex.ts
   export class MyDex {
     private static instances: Record<string, MyDex> = {};
     
     public static getInstance(chain: string, network: string): MyDex {
       const key = `${chain}:${network}`;
       if (!MyDex.instances[key]) {
         MyDex.instances[key] = new MyDex(chain, network);
       }
       return MyDex.instances[key];
     }
   }
   ```

3. **Implement trading methods** based on supported operations

4. **Create route files** following the pattern:
   - Swap routes in `routes/`
   - AMM routes in `amm-routes/`
   - CLMM routes in `clmm-routes/`

5. **Add configuration and register** in `src/connectors/connector.routes.ts`

### Testing Requirements

- Minimum 75% code coverage for new features
- Create mock responses in `test/mocks/`
- Write unit tests for all route handlers
- Test error cases and edge conditions

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
