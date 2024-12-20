// This improved code demonstrates multiple variations of deriving public keys from a mnemonic
// and creating a wallet address, now considering a testnet environment. We show how to derive keys,
// convert the public key to base64url, and connect to a testnet endpoint using TonClient4.
// The concept of mainnet vs testnet primarily differs in which endpoint you query for blockchain data.
// Addresses themselves are universal, but we use a testnet endpoint for any interactions.
//
// Dependencies:
// npm install @ton/crypto ton base64url
//
// Note: Replace the mnemonicString and password variables with actual values before running.
// Avoid committing sensitive mnemonics or passwords.
// This code assumes you're using the TonClient4 (v4) testnet endpoint.

import {
  mnemonicToPrivateKey,
  mnemonicToWalletKey,
  mnemonicToKeyPair,
  mnemonicToSeed,
  ed25519,
} from '@ton/crypto';
import { TonClient4 } from 'ton'; // ton library
import { WalletV3R2Source } from 'ton'; // for constructing a wallet address
import base64url from 'base64url';

// Example mnemonic and password (replace with actual values)
const mnemonicString =
  'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor adapt add';
const password = ''; // optional password
const seed = 'TON default seed';

// Helper function: convert a public key (Uint8Array) to base64url
function publicKeyToBase64Url(publicKey: Uint8Array): string {
  return base64url(Buffer.from(publicKey));
}

// Split mnemonic string into array
function getMnemonicArray(mnemonic: string) {
  return mnemonic.trim().split(/\s+/);
}

async function main() {
  const mnemonic = getMnemonicArray(mnemonicString);

  // Variation 1: Using mnemonicToPrivateKey (no password)
  const keysNoPassword = await mnemonicToPrivateKey(mnemonic);
  const publicKeyBase64NoPass = publicKeyToBase64Url(keysNoPassword.publicKey);
  console.log(
    'Public Key Base64 (Private Key, no password):',
    publicKeyBase64NoPass,
  );

  // Variation 2: Using mnemonicToPrivateKey (with password)
  const keysWithPassword = await mnemonicToPrivateKey(mnemonic, password);
  const publicKeyBase64WithPass = publicKeyToBase64Url(
    keysWithPassword.publicKey,
  );
  console.log(
    'Public Key Base64 (Private Key, with password):',
    publicKeyBase64WithPass,
  );

  // Variation 3: Using mnemonicToWalletKey (with password)
  const walletKeysWithPass = await mnemonicToWalletKey(mnemonic, password);
  const publicKeyBase64WalletWithPass = publicKeyToBase64Url(
    walletKeysWithPass.publicKey,
  );
  console.log(
    'Public Key Base64 (Wallet Key, with password):',
    publicKeyBase64WalletWithPass,
  );

  // Variation 4: Using mnemonicToWalletKey (no password)
  const walletKeysNoPassword = await mnemonicToWalletKey(mnemonic);
  const publicKeyBase64WalletNoPass = publicKeyToBase64Url(
    walletKeysNoPassword.publicKey,
  );
  console.log(
    'Public Key Base64 (Wallet Key, no password):',
    publicKeyBase64WalletNoPass,
  );

  // Additional Variation: Using mnemonicToKeyPair
  const keyPair = await mnemonicToKeyPair(mnemonic);
  const publicKeyBase64KeyPair = publicKeyToBase64Url(keyPair.publicKey);
  console.log('Public Key Base64 (Key Pair):', publicKeyBase64KeyPair);

  // Additional Variation: Using mnemonicToSeed + ed25519
  const seed = await mnemonicToSeed(mnemonic, seed);
  const edKeyPair = ed25519.keyPairFromSeed(seed);
  const publicKeyBase64EdPair = publicKeyToBase64Url(edKeyPair.publicKey);
  console.log('Public Key Base64 (Seed + ed25519):', publicKeyBase64EdPair);

  // Now, consider testnet: we can instantiate a TonClient4 pointing to the testnet endpoint
  const client = new TonClient4({
    endpoint: 'https://testnet-v4.tonhubapi.com', // testnet endpoint
  });

  // Example: Derive a Wallet V3R2 address from the walletKeysNoPassword public key
  // Workchain = 0 for regular wallet, can vary if needed
  const walletSource = WalletV3R2Source.create({
    publicKey: walletKeysNoPassword.publicKey,
    workchain: 0,
  });
  const walletAddress = walletSource.address(); // This is a universal address
  console.log('Wallet Address (Testnet context):', walletAddress.toString());

  // Although addresses are universal, you would use this address and keys with the testnet endpoint above
  // to query balance, send transactions, etc.
}

main()
  .then(() => console.log('Done'))
  .catch((err) => console.error('Error:', err));
