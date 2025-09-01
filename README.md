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

Hummingbot Gateway is a versatile API server that standardizes interactions with blockchain networks and decentralized exchanges (DEXs). It acts as a middleware layer, providing a unified interface for performing actions like checking balances, executing trades, and managing wallets across different protocols.

Gateway can be accessed through:
- **REST API**: Direct HTTP/HTTPS endpoints for programmatic access
- **Hummingbot Client**: For automated trading strategies, use the [Hummingbot repository](https://github.com/hummingbot/hummingbot)

### Key Features
- **Standardized REST API**: Consistent endpoints for interacting with blockchains (Ethereum, Solana) and DEXs (Uniswap, Jupiter, Raydium, Meteora, 0x)
- **Three Trading Types**: Router (DEX aggregators), AMM (V2-style pools), and CLMM (V3-style concentrated liquidity)
- **Modular Architecture**: Clear separation of concerns with distinct modules for chains, connectors, configuration, and wallet management
- **TypeScript-based**: Leverages the TypeScript ecosystem and popular libraries like Fastify, Ethers.js, and Solana/web3.js
- **Security**: Built-in rate limiting (100 requests/minute) to prevent DoS attacks
- **Extensible**: Easily extended with new chains and connectors

### Core Technologies
- **Backend**: Node.js, TypeScript, Fastify
- **Blockchain Interaction**: Ethers.js (Ethereum), @solana/web3.js (Solana)
- **Package Manager**: pnpm
- **Testing**: Jest
- **Linting/Formatting**: ESLint, Prettier
- **API Documentation**: Swagger/OpenAPI

Gateway abstracts the complexity of interacting with different blockchain protocols by providing standardized endpoints that work consistently across different chains and DEXs. Built with TypeScript to leverage native blockchain SDKs, it offers a language-agnostic API that can be integrated into any trading system.

Gateway may be used alongside the main [Hummingbot client](https://github.com/hummingbot/hummingbot) to enable trading and market making on DEXs, or as a standalone API server.

## Supported Networks and DEXs

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

### RPC Provider Integration

Gateway includes optimized RPC provider abstractions for improved performance and reliability:

#### **Infura (Ethereum Networks)**
- **Networks Supported**: Ethereum Mainnet, Polygon, Arbitrum, Optimism, Base, Avalanche
- **Features**: HTTP and WebSocket providers, automatic endpoint mapping, graceful fallback
- **Configuration**: Set `rpcProvider: infura` in network configs and configure API key in `conf/rpc/infura.yml`
- **Benefits**: Enhanced reliability (99.9% uptime SLA), reduced latency, higher rate limits

#### **Helius (Solana Networks)**  
- **Networks Supported**: Solana Mainnet-Beta, Solana Devnet
- **Features**: WebSocket transaction monitoring, Sender endpoints for fast execution, regional optimization
- **Configuration**: Set `rpcProvider: helius` in network configs and configure API key in `conf/rpc/helius.yml`
- **Benefits**: Real-time transaction monitoring, optimized transaction sending, connection warming

Both RPC providers maintain full backward compatibility - networks default to standard RPC endpoints when provider-specific configurations are not available.

### Supported DEX Protocols

| Protocol | Chain | Router | AMM | CLMM | Description |
|----------|-------|--------|-----|------|-------------|
| Jupiter | Solana | ✅ | ❌ | ❌ | DEX aggregator finding optimal swap routes |
| Meteora | Solana | ❌ | ❌ | ✅ | Dynamic Liquidity Market Maker (DLMM) |
| Raydium | Solana | ❌ | ✅ | ✅ | Full-featured DEX with V2 AMM and V3 CLMM |
| Uniswap | Ethereum/EVM | ✅ | ✅ | ✅ | Complete V2 AMM, V3 CLMM, and Smart Order Router |
| 0x | Ethereum/EVM | ✅ | ❌ | ❌ | DEX aggregator with professional market making features |

#### Trading Types Explained:
- **Router**: DEX aggregators that find optimal swap routes across multiple liquidity sources
- **AMM** (Automated Market Maker): Traditional V2-style constant product pools (x*y=k)
- **CLMM** (Concentrated Liquidity Market Maker): V3-style pools with capital efficiency through concentrated liquidity positions

## API Documentation

Gateway uses [Swagger](https://swagger.io/) for API documentation. When running Gateway, access the interactive API documentation at:
- Development mode: <http://localhost:15888/docs>
- Production mode: <https://localhost:15888/docs>

### API Route Structure

#### Configuration Routes (`/config/*`)
- `GET /config/namespaces` - List all configuration namespaces
- `GET /config/chains` - Get available chains and networks
- `GET /config/connectors` - List available DEX connectors
- `GET /config` - Get configuration for a namespace
- `PUT /config` - Update configuration values

#### Chain Routes (`/chains/{chain}/*`)
- `GET /chains/{chain}/status` - Get chain status and block height
- `GET /chains/{chain}/tokens` - List supported tokens
- `POST /chains/{chain}/balances` - Get wallet token balances
- `POST /chains/{chain}/allowances` - Check token allowances
- `POST /chains/{chain}/approve` - Approve token spending
- `POST /chains/{chain}/wrap` - Wrap/unwrap native tokens

#### Connector Routes (`/connectors/{dex}/{type}/*`)

**Router Operations** (e.g., `/connectors/jupiter/router/*`):
- `POST /quote` - Get swap quote from aggregator
- `POST /swap` - Execute swap through aggregator

**AMM Operations** (e.g., `/connectors/raydium/amm/*`):
- `POST /poolInfo` - Get pool details
- `POST /positionInfo` - Get liquidity position info
- `POST /quoteSwap` - Get swap quote
- `POST /executeSwap` - Execute swap
- `POST /quoteLiquidity` - Quote add/remove liquidity
- `POST /addLiquidity` - Add liquidity to pool
- `POST /removeLiquidity` - Remove liquidity from pool

**CLMM Operations** (e.g., `/connectors/uniswap/clmm/*`):
- `POST /poolInfo` - Get concentrated liquidity pool info
- `POST /openPosition` - Open new position
- `POST /closePosition` - Close existing position
- `POST /addLiquidity` - Add liquidity to position
- `POST /removeLiquidity` - Remove liquidity from position
- `POST /collectFees` - Collect earned fees
- `POST /positionsOwned` - List owned positions

#### Wallet Routes (`/wallet/*`)
- `GET /wallet` - List all wallets
- `POST /wallet/add` - Add new wallet
- `POST /wallet/addHardware` - Add hardware wallet
- `DELETE /wallet/remove` - Remove wallet
- `POST /wallet/setDefault` - Set default wallet per chain


## Installation from Source

### Prerequisites

#### System Requirements
- NodeJS 20+ (required)
- Python 3 (required for node-gyp)
- C++ build tools (required for native dependencies)
- USB libraries (required for hardware wallet support)

#### Platform-specific Prerequisites

**macOS:**
```bash
# Install Xcode Command Line Tools (for C++ compiler)
xcode-select --install

# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 20+ and required libraries
brew install node@20 libusb python@3
```

**Ubuntu/Debian:**
```bash
# Update package list and install dependencies
sudo apt update
sudo apt install -y curl build-essential libusb-1.0-0-dev libudev-dev python3

# Add Node 20.x repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs
```

**Windows:**
1. Install [Node.js 20+](https://nodejs.org/en/download/)
2. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) or Visual Studio Community with C++ workload
3. Install [Python 3](https://www.python.org/downloads/)
4. Run PowerShell as Administrator and install windows-build-tools:
   ```powershell
   npm install --global windows-build-tools
   ```

### Install NodeJS 20+

We recommend downloading the graphical installer from the [NodeJS official site](https://nodejs.org/en/download/).

For terminal-based users who haven't installed Node.js using the platform-specific instructions above:

```bash
# Check Node.js version: 
node --version
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

# Switch to core-2.8 branch
git checkout core-2.8
```

### Setup Gateway
```bash
# Install JS libraries (this will compile native dependencies)
pnpm install

# If you encounter USB HID errors during install, try:
# macOS/Linux:
pnpm install --force

# Windows (run as Administrator):
pnpm install --force

# Compile Typescript into JS
pnpm build

# Run Gateway setup script
# Option 1: Interactive setup (choose which configs to update)
pnpm run setup

# Option 2: Setup with all defaults (updates all configs automatically)
pnpm run setup:with-defaults
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

### Step 1: Get the Docker Image

**Option A: Pull from Docker Hub**
```bash
# Note: This image will be available after the v2.8 release
docker pull hummingbot/gateway:latest
```

**Option B: Build locally**
```bash
# Simple build
docker build -t hummingbot/gateway:core-2.8 .

# Build with version tag and metadata
docker build \
  --build-arg BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  --build-arg COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%d") \
  -t hummingbot/gateway:core-2.8 .
```

### Step 2: Run the Gateway Container

**Development mode (Unencrypted HTTP endpoints, default):**
```bash
docker run -p 15888:15888 \
  -e GATEWAY_PASSPHRASE=admin \
  -e GATEWAY_DEV=true \
  -v $(pwd)/conf:/home/gateway/conf \
  -v $(pwd)/logs:/home/gateway/logs \
  hummingbot/gateway:core-2.8
```

**Production mode (Encypted HTTPS endpoints, requires Hummingbot certs):**
```bash
docker run -p 15888:15888 \
  -e GATEWAY_PASSPHRASE=a \
  -e GATEWAY_DEV=false \
  -v $(pwd)/conf:/home/gateway/conf \
  -v $(pwd)/logs:/home/gateway/logs \
  -v $(pwd)/certs:/home/gateway/certs \
  hummingbot/gateway:core-2.8
```

### Access Points

- Development mode: http://localhost:15888
- Production mode: https://localhost:15888  
- Swagger API docs: http://localhost:15888/docs (dev mode only)


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

#### Router Operations (DEX Aggregators)
- `GET /connectors/{dex}/router/quote-swap` - Get swap quote
- `POST /connectors/{dex}/router/execute-swap` - Execute swap without quote
- `POST /connectors/{dex}/router/execute-quote` - Execute pre-fetched quote
- `GET /connectors/0x/router/get-price` - Get price estimate (0x only)

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

- The format of configuration files are dictated by [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts) and the corresponding schema files in [src/templates/namespace](./src/templates/namespace).

- For each supported chain, token lists that translate address to symbols for each chain are stored in `/conf/tokens`. Use the `/tokens` API endpoints to manage tokens - changes require a Gateway restart to take effect.

### RPC Provider Configuration

Gateway supports optimized RPC providers for enhanced performance:

#### **Infura Configuration (Ethereum Networks)**
1. **Configure API Key**: Add your Infura API key to `conf/rpc/infura.yml`:
   ```yaml
   apiKey: 'your_infura_api_key_here'
   useWebSocket: true
   ```

2. **Enable for Networks**: Set `rpcProvider: infura` in network configurations:
   ```yaml
   # In conf/chains/ethereum/mainnet.yml
   chainID: 1
   nodeURL: https://eth.llamarpc.com  # fallback URL
   rpcProvider: infura
   ```

3. **Supported Networks**: Mainnet, Polygon, Arbitrum, Optimism, Base, Avalanche

#### **Helius Configuration (Solana Networks)**
1. **Configure API Key**: Add your Helius API key to `conf/rpc/helius.yml`:
   ```yaml
   apiKey: 'your_helius_api_key_here'
   useWebSocketRPC: true
   useSender: true
   regionCode: 'slc'  # Optional: slc, ewr, lon, fra, ams, sg, tyo
   ```

2. **Enable for Networks**: Set `rpcProvider: helius` in network configurations:
   ```yaml
   # In conf/chains/solana/mainnet-beta.yml
   nodeURL: https://api.mainnet-beta.solana.com  # fallback URL
   rpcProvider: helius
   ```

3. **Supported Networks**: Mainnet-Beta, Devnet

#### **Benefits of RPC Provider Integration**
- **Improved Performance**: 20-40% faster response times vs public RPC endpoints
- **Enhanced Reliability**: Professional-grade uptime SLAs (99.9%+)  
- **Advanced Features**: WebSocket support, transaction monitoring, regional optimization
- **Higher Rate Limits**: Avoid public RPC throttling and connection limits
- **Automatic Failover**: Graceful fallback to standard RPC if provider unavailable


## Architecture

Gateway follows a modular architecture with clear separation of concerns:

```
/src
├── chains/               # Blockchain-specific implementations
│   ├── ethereum/        # Ethereum chain implementation
│   │   └── infura-service.ts  # Infura RPC provider integration
│   └── solana/          # Solana chain implementation
│       └── helius-service.ts  # Helius RPC provider integration
├── connectors/           # DEX-specific implementations
│   ├── {dex}/           # Each DEX connector directory
│   │   ├── router-routes/   # DEX aggregator operations
│   │   ├── amm-routes/      # AMM pool operations
│   │   └── clmm-routes/     # Concentrated liquidity operations
├── services/             # Core services (config, logging, tokens)
├── schemas/              # API request/response schemas (TypeBox)
│   ├── router-schema.ts  # Router operation schemas
│   ├── amm-schema.ts     # AMM operation schemas
│   └── clmm-schema.ts    # CLMM operation schemas
├── templates/            # Configuration templates
│   ├── rpc/             # RPC provider configurations
│   │   ├── helius.yml   # Helius provider template
│   │   └── infura.yml   # Infura provider template
│   └── chains/          # Chain network configurations
├── config/               # Configuration routes and utilities
└── wallet/               # Wallet management
```

### Key Components

#### Chains
The `src/chains` directory contains blockchain network implementations. Each chain module includes:
- Core chain class implementing operations like `getBalances`, `getTokens`
- Chain-specific routes defining API endpoints
- Configuration management for the chain
- **RPC Provider Services**: Optional optimized RPC providers (Infura for Ethereum, Helius for Solana)

#### Connectors
The `src/connectors` directory houses DEX protocol implementations. Each connector provides:
- **Router operations**: DEX aggregator functionality (router-routes/)
  - Quote and execute swaps through aggregator protocols
  - Support for execute-quote pattern for better execution
- **AMM operations**: Automated Market Maker pools (amm-routes/)
  - Manage liquidity positions in V2-style pools
- **CLMM operations**: Concentrated Liquidity pools (clmm-routes/)
  - Manage positions with custom price ranges

#### Services
Essential services in `src/services` include:
- **config-manager-v2.ts**: Robust configuration management with validation
- **logger.ts**: Flexible logging service
- **token-service.ts**: Token list management with security validation

#### RPC Provider Abstraction
Gateway implements a flexible RPC provider abstraction pattern:
- **Provider Selection**: Network configs specify `rpcProvider` field to choose between standard or optimized providers
- **Service Classes**: Each provider (Infura, Helius) has dedicated service class with provider-specific features
- **Automatic Fallback**: Gracefully falls back to standard RPC when provider unavailable or unconfigured
- **Enhanced Features**: WebSocket support, transaction monitoring, regional optimization per provider
- **Configuration Isolation**: Provider API keys stored in separate `conf/rpc/*.yml` files for security

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

/scripts                      # Live testing and utility scripts
  test-helius-live.js        # Helius RPC provider integration tests
  test-infura-live.js        # Infura RPC provider integration tests
  test-provider-switching.js  # RPC provider switching tests
```

#### RPC Provider Testing

Gateway includes comprehensive testing for RPC provider integrations:

**Live Integration Tests** (`scripts/test-*-live.js`):
- Test real API connectivity with configured keys
- Verify WebSocket connections and features
- Measure performance improvements vs standard RPC
- Validate network-specific endpoint mappings

**Running RPC Provider Tests**:
```bash
# Test Infura integration (requires API key in conf/rpc/infura.yml)
node scripts/test-infura-live.js

# Test Helius integration (requires API key in conf/rpc/helius.yml)
node scripts/test-helius-live.js

# Test provider switching functionality
node scripts/test-provider-switching.js
```

**Test Coverage Areas**:
- Provider initialization and configuration loading
- Automatic fallback to standard RPC on failures
- Network-specific endpoint resolution
- WebSocket connection establishment
- Performance benchmarking and health checks

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

2. **Implement required routes**:
   - `getWallet(address: string)`
   - `getBalance(address: string)`
   - `getTokens(tokenSymbols: string[])`
   - `getPool(tradingPair: string)`
   - `getStatus()`

3. **Create route handlers** in `src/chains/mychain/routes/`

4. **Add configuration for each supported network**:
   - Add chain schema in `src/templates/namespace/mychain-schema.json`
   - Add network schema in `src/templates/namespace/mychain-network-schema.json`
   - Create `src/templates/chains/mychain.yml` chain default YAML
   - Create `src/templates/chains/mychain/` folder
   - In this folder, create default YAML files for each support network titled `network-name.yml`

5. **Register the chain** in `src/chains/chain.routes.ts`

### Adding a New RPC Provider

Gateway's RPC provider abstraction allows integration of optimized RPC services. Follow this guide to add support for a new provider:

#### Step 1: Create Configuration Template

1. **Create provider configuration template** (`src/templates/rpc/myprovider.yml`):
   ```yaml
   # MyProvider RPC Configuration
   # Get your API key from https://myprovider.com
   
   # Required: Your MyProvider API key
   apiKey: ''
   
   # Optional: Enable WebSocket connections
   useWebSocket: true
   
   # Optional: Provider-specific settings
   region: 'us-east'
   rateLimit: 100
   ```

2. **Create JSON schema for validation** (`src/templates/namespace/myprovider-schema.json`):
   ```json
   {
     "type": "object",
     "properties": {
       "apiKey": {
         "type": "string",
         "minLength": 1,
         "description": "MyProvider API key"
       },
       "useWebSocket": {
         "type": "boolean",
         "default": true,
         "description": "Enable WebSocket connections"
       },
       "region": {
         "type": "string",
         "enum": ["us-east", "us-west", "eu", "asia"],
         "description": "Provider region"
       }
     },
     "required": ["apiKey"],
     "additionalProperties": false
   }
   ```

3. **Register namespace in root.yml** (`src/templates/root.yml`):
   ```yaml
   # RPC providers
   $namespace myprovider:
     configurationPath: rpc/myprovider.yml
     schemaPath: myprovider-schema.json
   ```

#### Step 2: Implement Service Class

Create the provider service (`src/chains/{chain}/myprovider-service.ts`):

```typescript
import { providers } from 'ethers';
import { logger } from '../../services/logger';
import { ChainNetworkConfig } from './{chain}.config';

export class MyProviderService {
  private config: ChainNetworkConfig;
  private provider: providers.JsonRpcProvider | providers.WebSocketProvider;
  private wsProvider?: providers.WebSocketProvider;

  constructor(config: ChainNetworkConfig) {
    this.config = config;
    this.initializeProvider();
  }

  private initializeProvider(): void {
    const httpUrl = this.getProviderHttpUrl();
    
    // Initialize HTTP provider
    this.provider = new providers.JsonRpcProvider(httpUrl, {
      name: this.getNetworkName(),
      chainId: this.config.chainID
    });

    // Initialize WebSocket if enabled
    if (this.shouldUseWebSocket()) {
      try {
        const wsUrl = this.getProviderWebSocketUrl();
        this.wsProvider = new providers.WebSocketProvider(wsUrl);
        logger.info(`✅ MyProvider WebSocket initialized for ${this.getNetworkName()}`);
      } catch (error: any) {
        logger.warn(`Failed to initialize WebSocket: ${error.message}`);
      }
    }
  }

  private getProviderHttpUrl(): string {
    const network = this.mapChainToProviderNetwork();
    return `https://${network}.myprovider.com/v1/${this.config.myProviderAPIKey}`;
  }

  private mapChainToProviderNetwork(): string {
    // Map chain IDs to provider network names
    const networkMap: Record<number, string> = {
      1: 'eth-mainnet',
      137: 'polygon-mainnet',
      // Add more mappings
    };

    const network = networkMap[this.config.chainID];
    if (!network) {
      throw new Error(`Network not supported by MyProvider: ${this.config.chainID}`);
    }
    return network;
  }

  public getProvider(): providers.JsonRpcProvider | providers.WebSocketProvider {
    return this.wsProvider || this.provider;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch (error: any) {
      logger.error(`Health check failed: ${error.message}`);
      return false;
    }
  }

  public disconnect(): void {
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
  }
}
```

#### Step 3: Update Chain Connector

1. **Update chain config interface** (`src/chains/{chain}/{chain}.config.ts`):
   ```typescript
   export interface ChainNetworkConfig {
     // Existing fields...
     rpcProvider?: string;
     myProviderAPIKey?: string;
     useMyProviderWebSocket?: boolean;
   }
   ```

2. **Update chain connector** (`src/chains/{chain}/{chain}.ts`):
   ```typescript
   import { MyProviderService } from './myprovider-service';
   
   export class ChainConnector {
     private myProviderService?: MyProviderService;
     
     private constructor(network: string) {
       const config = getChainNetworkConfig(network);
       
       // Initialize RPC based on provider
       if (config.rpcProvider === 'myprovider') {
         logger.info(`Initializing MyProvider for: ${network}`);
         this.initializeMyProvider(config);
       } else {
         // Standard RPC initialization
       }
     }
     
     private initializeMyProvider(config: ChainNetworkConfig): void {
       try {
         const apiKey = ConfigManagerV2.getInstance().get('myprovider.apiKey');
         
         if (!apiKey || apiKey.trim() === '') {
           logger.warn('MyProvider selected but no API key, using standard RPC');
           this.provider = new providers.StaticJsonRpcProvider(config.nodeURL);
           return;
         }
         
         const mergedConfig = {
           ...config,
           myProviderAPIKey: apiKey,
           useMyProviderWebSocket: ConfigManagerV2.getInstance().get('myprovider.useWebSocket')
         };
         
         this.myProviderService = new MyProviderService(mergedConfig);
         this.provider = this.myProviderService.getProvider();
         
       } catch (error: any) {
         logger.warn(`Failed to initialize MyProvider: ${error.message}`);
         this.provider = new providers.StaticJsonRpcProvider(config.nodeURL);
       }
     }
   }
   ```

#### Step 4: Update Network Configurations

1. **Update network schema** (`src/templates/namespace/{chain}-network-schema.json`):
   ```json
   {
     "properties": {
       "rpcProvider": {
         "type": "string",
         "enum": ["url", "myprovider"],
         "default": "url",
         "description": "RPC provider to use"
       }
     }
   }
   ```

2. **Update network configs** (`src/templates/chains/{chain}/{network}.yml`):
   ```yaml
   chainID: 1
   nodeURL: https://default-rpc.com
   nativeCurrencySymbol: ETH
   rpcProvider: myprovider  # Enable new provider
   ```

#### Step 5: Create Testing Scripts

Create live integration test (`scripts/test-myprovider-live.js`):

```javascript
#!/usr/bin/env node

const axios = require('axios');

const GATEWAY_URL = 'http://localhost:15888';

async function testProviderIntegration() {
  console.log('🚀 Testing MyProvider Integration');
  
  try {
    // Test chain status
    const response = await axios.get(`${GATEWAY_URL}/chains/{chain}/status?network=mainnet`);
    console.log('✅ Provider working:', response.data);
    
    // Test specific features
    // Add provider-specific tests here
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testProviderIntegration();
```

#### Step 6: Documentation

1. **Update README.md** with:
   - Provider overview in "RPC Provider Integration" section
   - Configuration instructions
   - Supported networks and features
   - Testing documentation

2. **Create provider documentation** detailing:
   - API key acquisition process
   - Feature capabilities
   - Performance benchmarks
   - Troubleshooting guide

#### Best Practices

- **Graceful Fallback**: Always fall back to standard RPC if provider unavailable
- **Comprehensive Logging**: Log provider selection, initialization, and errors
- **Configuration Isolation**: Store API keys in separate config files
- **Network Mapping**: Clearly map chain IDs to provider-specific network names
- **Health Checks**: Implement health check methods for monitoring
- **WebSocket Support**: Optional WebSocket for real-time features
- **Testing**: Create comprehensive live integration tests
- **Documentation**: Document all configuration options and features

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
   - Router routes in `router-routes/` (for DEX aggregators)
   - AMM routes in `amm-routes/` (for V2-style pools)
   - CLMM routes in `clmm-routes/` (for concentrated liquidity)

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

### Hardware Wallet (Ledger) Issues

If you encounter errors when using hardware wallets (Ledger devices), here are common solutions:

#### USB HID Errors
If you see errors like `Cannot find module '@ledgerhq/hw-transport-node-hid'` or similar USB/HID-related errors:

1. **Ensure prerequisites are installed** (see Prerequisites section above)
2. **Rebuild native dependencies:**
   ```bash
   # Clean and reinstall
   pnpm clean
   pnpm install --force
   ```

3. **Platform-specific fixes:**
   
   **Linux:** Add udev rules for Ledger devices
   ```bash
   wget -q -O - https://raw.githubusercontent.com/LedgerHQ/udev-rules/master/add_udev_rules.sh | sudo bash
   ```
   
   **macOS:** Grant Terminal/IDE USB permissions in System Preferences > Security & Privacy
   
   **Windows:** Run as Administrator and ensure drivers are installed from [Ledger Live](https://www.ledger.com/ledger-live)

#### Permission Errors
- **Linux/macOS:** Run Gateway with appropriate permissions or add your user to the `plugdev` group:
  ```bash
  sudo usermod -a -G plugdev $USER
  # Logout and login again for changes to take effect
  ```

#### Device Not Found
- Ensure Ledger device is connected and unlocked
- Open the appropriate app (Ethereum or Solana) on the device
- Try different USB ports or cables
- Close Ledger Live if it's running (it may lock the device)
