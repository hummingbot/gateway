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
- Privy routes come with the Privy backend.
