![Hummingbot](https://i.ibb.co/X5zNkKw/blacklogo-with-text.png)

# Hummingbot Gateway

Hummingbot Gateway is a REST API that exposes connections to various blockchains (wallet, node & chain interaction) and decentralized exchanges (pricing, trading & liquidity provision). It is written in Typescript and takes advantage of existing blockchain and DEX SDKs. The advantage of using gateway is it provideds a programming language agnostic approach to interacting with blockchains and DEXs.

Gateway may be used alongside the main [Hummingbot client](https://github.com/hummingbot/hummingbot) to enable trading on DEXs, or as a standalone module by external developers.

## Installation

### Generate certificates

To run Gateway in `https` (default):
* **CERTS_PATH**: path to folder where Hummingbot generated and saved self-signed SSL certificates
* **PASSPHRASE**: passphrase used to generate the certificates above

### Run Gateway from source

Dependencies:
* NodeJS (16.0.0 or higher)
* Yarn: run `npm install -g yarn` after installing NodeJS

```bash
# Install dependencies
yarn

# Complile Typescript into JS
$ yarn build

# Run Gateway setup script, which helps you set configs and CERTS_PATH
$ chmod a+x gateway-setup.sh
$ ./gateway-setup.sh

# Start the Gateway server using PASSPHRASE
$ yarn start --passphrase=<PASSPHRASE>
```

### Run Gateway using Docker

Dependencies:
* [Docker](https://docker.com)

See the [`/docker`](./docker) folder for Docker installation scripts and instructions on how to use them.


### Build Gateway Docker Image locally

Dependencies:
* [Docker](https://docker.com)

To build the gateway docker image locally execute the below make command:

```bash
make docker
```

Pass the `${TAG}` environmental variable to add a tag to the docker
image. For example, the below command will create the `hummingbot/gateway:dev`
image.

```bash
TAG=dev make docker
```

## Documentation

See the [official Gateway docs](https://docs.hummingbot.org/gateway/).

The API is documented using [Swagger](./docs/swagger). When Gateway is started, it also generates Swagger API docs at: https://localhost:8080


## Contributing

There are a number of ways to contribute to gateway.

- File an issue at [hummingbot issues](https://github.com/hummingbot/gateway/issues)

- Make a [pull request](https://github.com/hummingbot/gateway/)

- Edit the [docs](https://github.com/hummingbot/hummingbot-site/)

- Vote on a [Snapshot proposal](https://snapshot.org/#/hbot.eth)


### Configuration

- Edit `certs_path` in [conf/server.yml](./conf/server.yml) and enter the absolute path to the folder where Hummingbot stored the certificates it created with `gateway generate-certs`. You can also edit this config inside the Hummingbot client by running the command: `gateway config server.certs_path`.

- If you want to turn off `https`, set `unsafeDevModeWithHTTP` to `true` in [conf/server.yml](./conf/server.yml). 

- If you want Gateway to log to standard out, set `logToStdOut` to `true` in [conf/server.yml](./conf/server.yml).

- The format of configuration files are dictated by [src/services/config-manager-v2.ts](./src/services/config-manager-v2.ts) and the corresponding schema files in [src/services/schema](./src/services/schema).


### Architecture

Here are some files we recommend you look at in order to get familiar with the Gateway codebase:

- [src/services/ethereum-base.ts](./src/services/ethereum-base.ts): base class for EVM chains.

- [src/connectors/uniswap/uniswap.ts](./src/connectors/uniswap/uniswap.ts): functionality for interacting with Uniswap.

- [src/services/validator.ts](./src/services/validator.ts): defines functions for validating request payloads.


### Testing

For a pull request merged into the codebase, it has to pass unit test coverage requirements. Take a look at [Workflow](../.github/workflows/workflow.yml) for more details.

#### Unit tests

Read this document for more details about how to write unit test in gateway: [How we write unit tests for gateway](./docs/testing.md).

Run all unit tests.

```bash
yarn test:unit
```

Run an individual test folder or file

```bash
yarn jest test/<folder>/<file>
```

#### Manual tests

We have found it is useful to test individual endpoints with `curl` commands. We have a collection of prepared curl calls. POST bodies are stored in JSON files. Take a look at the [curl calls for gateway](./manual-tests/curl.sh). Note that some environment variables are expected.

## Linting

This repo uses `eslint` and `prettier`. When you run `git commit` it will trigger the `pre-commit` hook. This will run `eslint` on the `src` and `test` directories.

You can lint before committing with:

```bash
yarn run lint
```

You can run the prettifier before committing with:

```bash
yarn run prettier
```

