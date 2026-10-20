/**
 * The signer seam (hummingbot/gateway#673 proposal 1, #682 phase 1).
 *
 * Every transaction Gateway sends is signed through one of these per-chain interfaces.
 * A connector builds an unsigned transaction; the chain's chokepoint prepares it,
 * hands the bytes to the wallet's signer, places the signature itself, checks it, and
 * broadcasts. No connector and no third-party SDK holds key material.
 *
 * A wallet is a record `{chain, address, signer}`. Its signer kind picks the backend:
 *
 *   local     an encrypted key file in conf/wallets/{chain}/{address}.json
 *   hardware  a Ledger account, listed in conf/wallets/{chain}/hardware-wallets.json
 *   external  an address only, listed in conf/wallets/{chain}/external-wallets.json.
 *             Gateway holds no key: it builds, the caller signs and submits.
 *   privy     a Privy server wallet (added by the Privy backend).
 *
 * See docs/signer-seam.md for the route rules and how existing wallet files load.
 */
import type { BigNumberish } from 'ethers';

export type SignerKind = 'local' | 'hardware' | 'external' | 'privy';

export type WalletChain = 'solana' | 'ethereum';

/** What Gateway knows about one wallet. Never holds key material. */
export interface WalletRecord {
  chain: WalletChain;
  /** Base58 (Solana) or checksummed 0x address (Ethereum). */
  address: string;
  signer: SignerKind;
  /** hardware: the BIP32/BIP44 path on the Ledger. */
  derivationPath?: string;
  /** privy: the Privy wallet id. */
  privyWalletId?: string;
  /** hardware, external, privy: when the record was added (ISO 8601). */
  addedAt?: string;
}

/**
 * What a signer returns.
 *
 * `signed`: the signature (Solana) or the signed transaction (Ethereum).
 * `unsigned`: the backend holds no key (an `external` wallet). The chokepoint refuses
 * the execute request and names the route's build twin.
 */
export type SignResult<T> = { kind: 'signed'; value: T } | { kind: 'unsigned'; reason: string };

/**
 * Solana: serialized message in, 64-byte ed25519 signature out.
 *
 * `message` is the exact bytes to sign: `VersionedTransaction.message.serialize()` or
 * `Transaction.serializeMessage()`. The blockhash, the compute budget and the
 * ephemeral co-signers' signatures are already final. A signer cannot change the
 * message: the chokepoint places the returned signature in the wallet's slot and
 * verifies it against these bytes before the transaction is sent.
 *
 * A backend whose API wants a whole transaction (Privy) rebuilds one from the message:
 * `new VersionedTransaction(VersionedMessage.deserialize(message))`, and returns the
 * wallet's signature from the result.
 */
export interface SolanaSigner {
  readonly kind: SignerKind;
  /** Base58 public key: the account whose signature this signer produces. */
  readonly address: string;
  signTransactionMessage(message: Uint8Array): Promise<SignResult<Uint8Array>>;
}

/**
 * Ethereum (all EVM networks): a fully populated unsigned transaction in, the signed
 * serialized transaction out.
 *
 * Every field the network needs is set before the signer sees it: chainId, nonce, gas
 * limit and the fee fields. `type: 2` carries maxFeePerGas and maxPriorityFeePerGas;
 * `type: 0` carries gasPrice. This is also the shape a build route returns.
 */
export interface UnsignedEvmTransaction {
  chainId: number;
  to: string;
  data: string;
  value: BigNumberish;
  nonce: number;
  gasLimit: BigNumberish;
  type: 0 | 2;
  gasPrice?: BigNumberish;
  maxFeePerGas?: BigNumberish;
  maxPriorityFeePerGas?: BigNumberish;
}

/**
 * The chokepoint parses the signed transaction and checks that its sender is the
 * wallet and that chainId, nonce, to, data and value are the ones it gave the signer.
 */
export interface EthereumSigner {
  readonly kind: SignerKind;
  /** Checksummed 0x address. */
  readonly address: string;
  /** Returns the signed, RLP-serialized transaction (0x hex) for eth_sendRawTransaction. */
  signTransaction(tx: UnsignedEvmTransaction): Promise<SignResult<string>>;
}

/**
 * How a backend makes a signer from a wallet record: one factory per chain. Each signer
 * kind has one entry in `signerBackends` (src/wallet/signers/registry.ts); a new backend
 * adds its entry there and changes nothing in the chokepoints.
 */
export interface SignerFactories {
  solana: (record: WalletRecord) => Promise<SolanaSigner>;
  ethereum: (record: WalletRecord) => Promise<EthereumSigner>;
}
