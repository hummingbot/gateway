# Signer seam and wallet records

Issues: #673 (proposal 1, unified signer seam) and #682 (phase 1, stateless signing).

## Goal

Gateway signs every transaction through one seam per chain. A wallet's signer is a
backend behind that seam: `local`, `hardware`, `external` or `privy`. An execute route
is "build, sign through the seam, submit". Its `build-*` twin is the same build path
with no signing. Gateway can then run with no keys (`external` wallets only), and a new
backend (Privy, a KMS) is one more entry behind the seam, not a change to each connector.

## Wallet record

```ts
interface WalletRecord {
  chain: 'solana' | 'ethereum';
  address: string;
  signer: 'local' | 'hardware' | 'external' | 'privy';
  derivationPath?: string;   // hardware
  privyWalletId?: string;    // privy
  addedAt?: string;
}
```

The record is derived from the files in `conf/wallets/{chain}/` when Gateway loads a
wallet. No file is rewritten.

| File | Signer | Holds |
|---|---|---|
| `{address}.json` | `local` | the encrypted key (unchanged format) |
| `hardware-wallets.json` | `hardware` | `{wallets: [{address, publicKey, derivationPath, addedAt}]}` (unchanged) |
| `external-wallets.json` | `external` | `{wallets: [{address, addedAt}]}` (new) |
| `privy-wallets.json` | `privy` | `{wallets: [{address, privyWalletId, addedAt}]}` (Privy backend) |

Migration: there is none to run. An existing key file loads as `local`, and an existing
`hardware-wallets.json` entry loads as `hardware`, exactly as before. An address that is in
two of these files is an error that names both files: Gateway does not pick one.

## The `Signer` interface

The exact TypeScript is in `src/wallet/signers/types.ts`.

**Solana.** `signTransactionMessage(message: Uint8Array)` gets the serialized message and
returns the 64-byte signature. The chokepoint prepares the transaction first (compute
budget, blockhash, ephemeral co-signers' signatures), then places the signature in the
wallet's slot and verifies it against the message. A signer cannot change what is sent.

**Ethereum.** `signTransaction(tx: UnsignedEvmTransaction)` gets a fully populated
transaction (chainId, nonce, gas limit, fee fields) and returns the signed serialized
transaction. The chokepoint parses it and checks the sender, chainId, nonce, to, data and
value before it sends it.

**Result.** Both return `{kind: 'signed', value}` or `{kind: 'unsigned', reason}`. Only the
`external` backend returns `unsigned`.

**Backends.** `signerBackends` in `src/wallet/signers/registry.ts` maps a signer kind to a
factory per chain. A new backend adds one entry there. A kind with no entry fails with an
error that names it.

## Chokepoints

- Solana: `Solana.sendAndConfirmTransactionForWallet(tx, address, extraSigners, fee)`.
  Every Solana connector already hands its unsigned transaction here. In build mode
  (#721's `captureUnsignedTransaction`), it returns the prepared transaction and signs
  nothing; the address does not have to be a registered wallet.
  An operation of several transactions (Meteora DLMM wide positions, DBC migrate, a pump
  create with a new lookup table) builds with `captureSequenceForExternalSigner`, which
  also signs nothing for the wallet; executed, it sends each transaction through this
  chokepoint, so an external wallet is refused before the first one is sent.
- Ethereum: `Ethereum.sendTransactionForWallet(address, tx)`. A route gives it the
  populated transaction request (`to`, `data`, `value`, gas options); the chokepoint sets
  chainId and nonce, signs through the seam and broadcasts.

## Route rules

1. A route that sends a transaction signs only through its chain's chokepoint. No route
   loads a key, calls `.sign(...)` with a wallet, or passes a wallet to an SDK.
2. Each such route has a `build-*` twin that runs the same connector code and returns the
   unsigned transaction for `POST /chains/{chain}/submit`.
3. An execute request for an `external` wallet is refused with a 400 that names the
   build twin and the submit route.
4. Reads (balances, allowances) take an address. They never load a key.

`src/wallet/signers/transaction-routes.ts` lists each route that sends a transaction with
its build twin, or with the task that adds the twin. A test fails when a registered POST
route is neither in that list nor in the list of routes that send nothing, when a listed
twin is not registered, and when source outside the seam loads a key or signs.

## Routes

- `POST /wallet/add-external` `{chain, address, setDefault?}`: add an address-only wallet.
- `GET /wallet`: each chain's entry adds `wallets: [{address, signer}]`. The existing
  `walletAddresses` (local) and `hardwareWalletAddresses` stay, because the Hummingbot
  client and Hummingbot API read them.
- `POST /wallet/add-hardware`: unchanged.
- `POST /wallet/add-privy` `{chain, privyWalletId, setDefault?}`: add an existing Privy server
  wallet. Gateway reads it from Privy (`GET /v1/wallets/{id}`), checks its chain, and stores
  its id and address.
- `POST /wallet/create-privy` `{chain, setDefault?}`: create a Privy wallet owned by
  Gateway's authorization key, and add it.

## The `privy` backend

Privy holds the key and signs; Gateway builds and sends. Credentials come from the
environment only, never from conf files, templates or request bodies:

| Variable | Use |
|---|---|
| `PRIVY_APP_ID` | Privy app id (`privy-app-id` header, Basic auth user) |
| `PRIVY_APP_SECRET` | Privy app secret (Basic auth password) |
| `PRIVY_AUTHORIZATION_KEY` | `wallet-auth:<base64 PKCS8>` P-256 key. Signs every wallet RPC request (`privy-authorization-signature`) and is the owner of wallets Gateway creates. |

- Solana: the backend wraps the seam's message in a transaction, calls `signTransaction`,
  checks that Privy returned the same message, and returns only the wallet's signature.
- Ethereum: the populated transaction goes to `eth_signTransaction`; the chokepoint checks
  the signed transaction before it sends it.
- The Privy wallet id must match `^[a-z0-9]{16,64}$` before it is put in a URL.
- Privy errors map to Gateway errors: a policy denial is 403, a missing or wrong
  authorization signature is 403, an unknown wallet is 404, a rate limit is 429, other
  Privy 4xx are 400, Privy 5xx or no answer is 502, missing credentials are 503. Privy's
  error text is not returned or logged above debug level.
- Scope: one authorization key per Gateway. Wallets that another app signs with its own
  session signers are not a Gateway use case.
