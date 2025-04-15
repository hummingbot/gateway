![Hummingbot](https://i.ibb.co/X5zNkKw/blacklogo-with-text.png)

# Hummingbot Gateway

## Introduction

Hummingbot Gateway is an API/CLI client that exposes standardized REST endponts to perform actions and fetch data from **blockchain networks** (wallet, node & chain interaction) and their **decentralized exchanges (DEX)** (pricing, trading & liquidity provision).

Gateway is written in Typescript in order to use Javascript-based SDKs provided by blockchains and DEX protocols. The advantage of using Gateway is it provides a standardizedm, language-agnostic approach to interacting with these protocols.

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

# Switch to `core-2.5 branch
git checkout core-2.5
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

- The format of configuration files are dictated by [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts) and the corresponding schema files in [src/services/schema](./src/services/schema).

- For each supported chain, token lists that translate address to symbols for each chain are stored in `/conf/lists`. You can add tokens here to make them available to Gateway.


## Architecture

Gateway is currently undergoing a large-scale refactor to improve codebase architecture and modularity. The Meteora connector serves as the reference implementation for this new architecture:

- [src/connectors/meteora/meteora.ts](./src/connectors/meteora/meteora.ts): Core DEX connector class that implements the standard interface
- [src/connectors/meteora/meteora.config.ts](./src/connectors/meteora/meteora.config.ts): Configuration for the DEX connector
- [src/connectors/meteora/meteora.routes.ts](./src/connectors/meteora/meteora.routes.ts): Route definitions and handlers
- [src/connectors/meteora/routes/](./src/connectors/meteora/routes/): Individual route implementations for each DEX operation

Other key files:

- [src/services/clmm-interface.ts](./src/services/clmm-interface.ts): Standard request and response interfaces for Concentrated Liquidity Market Maker (CLMM) DEXs
- [src/chains/solana/solana.ts](./src/chains/solana/solana.ts): Base class for Solana chain operations
- [src/chains/solana/solana.routes.ts](./src/chains/solana/solana.routes.ts): Solana route definitions and handlers

## Testing

For a pull request merged into the codebase, it has to pass unit test coverage requirements. Take a look at [Workflow](./.github/workflows/workflow.yml) for more details.

### Unit tests

Run all unit tests.

```bash
pnpm test:unit
```

Run an individual test folder or file

```bash
pnpm run jest test/<folder>/<file>
```

### Manual tests

We have found it is useful to test individual endpoints with `curl` commands. We have a collection of prepared curl calls. POST bodies are stored in JSON files. Take a look at the [curl calls for gateway](./test-helpers/curl/curl.sh). Note that some environment variables are expected.

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


