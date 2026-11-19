# Meteora Dynamic Bonding Curve (launch) Connector

Meteora's Dynamic Bonding Curve (DBC) launches a token on a virtual pool that trades along a
curve and migrates to a DAMM v2 pool once the curve fills. Gateway exposes it through
`/trading/launch/*` with `connector=meteora`; after migration the token trades through this
connector's `amm` surface (see [meteora-damm-v2.md](meteora-damm-v2.md)).

## A launch needs a DBC config

Every DBC pool is created from a **config account**. The config is where the launch terms
live: the curve's shape and migration threshold, the quote token, the trading fee and how it
splits between partner and creator, and what happens to liquidity at migration. One config
serves any number of launches.

Gateway does not create configs. `POST /trading/launch/create-token` takes the config from:

1. `configAddress` in the request, or
2. `meteora.launch.configAddress` in `conf/connectors/meteora.yml`, used when the request
   names none.

With neither set, create-token answers 400 `No DBC config to launch from`.

### Getting a config

- **Use one you were given.** A launchpad or partner that runs on DBC publishes the address
  of its config; launching from it applies that partner's terms and fee split.
- **Create your own.** Meteora's launch UI has a create-config flow, and the
  [`@meteora-ag/dynamic-bonding-curve-sdk`](https://docs.meteora.ag) that Gateway bundles
  exposes `client.partner.createConfig(...)`, with `buildCurve*` helpers that turn launch
  terms (supply, start and migration market cap, fees) into the config's parameters. The
  transaction is signed by the fee payer and by a new keypair whose public key becomes the
  config address. On mainnet a config costs about 0.006 SOL in rent.

A config cannot be edited once created. Read it back before launching from it: the terms it
holds are the terms every pool created from it gets.

## Things to know

- **`firstBuySol` needs a SOL-quoted config.** The atomic first buy spends the config's
  quote token; Gateway refuses `firstBuySol` against a config quoted in anything else.
- **Curve swaps need no config.** `/trading/launch/quote-swap` and `execute-swap` work on
  any DBC pool, whatever it was launched from.
- **`creator` hands the pool over.** DBC's pool creator must sign the creation, so the
  wallet creates the pool and transfers it to `creator` in the same transaction.
