#!/usr/bin/env npx ts-node
/**
 * ============================================================================
 * WALLET GENERATOR FOR HUMMINGBOT GATEWAY
 * ============================================================================
 *
 * This script generates Solana or Ethereum keypairs LOCALLY on your machine
 * for use with Hummingbot Gateway. Private keys are never sent to any server
 * until you explicitly choose to add them to Gateway.
 *
 * ============================================================================
 * COMMANDS
 * ============================================================================
 *
 * CREATE A NEW WALLET (interactive):
 *   pnpm wallet:create                        # Solana (default)
 *   pnpm wallet:create -- --chain ethereum    # Ethereum
 *   pnpm wallet:create -- --chain solana      # Solana (explicit)
 *
 *   This will:
 *   1. Generate a new keypair locally
 *   2. Display the address and private key
 *   3. Prompt you to save your private key (THIS IS THE ONLY TIME IT'S SHOWN)
 *   4. Ask if you want to add the wallet to Gateway
 *
 * CREATE WITHOUT ADDING TO GATEWAY:
 *   pnpm wallet:create -- --no-add
 *   pnpm wallet:create -- --chain ethereum --no-add
 *
 *   Use this to generate and save your key before adding to Gateway.
 *   You can add it later using the /wallet/add API.
 *
 * VERIFY A SAVED PRIVATE KEY:
 *   pnpm wallet:create -- --verify
 *   pnpm wallet:create -- --verify --chain ethereum
 *
 *   Use this to:
 *   - Confirm your saved private key is valid
 *   - See the wallet address derived from the key
 *   - Verify you saved the key correctly before funding the wallet
 *
 * SPECIFY CUSTOM GATEWAY URL:
 *   pnpm wallet:create -- --gateway http://localhost:15888
 *
 * ============================================================================
 * SUPPORTED CHAINS
 * ============================================================================
 *
 * SOLANA (default):
 *   - Private key format: Base58 encoded (88 characters)
 *   - Address format: Base58 encoded (32-44 characters)
 *   - Example address: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
 *
 * ETHEREUM:
 *   - Private key format: Hex with 0x prefix (66 characters)
 *   - Address format: 0x + 40 hex characters
 *   - Example address: 0x71C7656EC7ab88b098defB751B7401B5f6d8976F
 *
 * ============================================================================
 * SECURITY NOTES
 * ============================================================================
 *
 * - Private keys are generated using cryptographically secure libraries
 * - Keys are generated locally - nothing is sent over the network during creation
 * - The private key is displayed ONLY ONCE - if you lose it, funds are lost forever
 * - Store your private key in a secure password manager
 * - Never share your private key with anyone
 * - Never store private keys in plain text files
 *
 * ============================================================================
 * ADDING WALLET TO GATEWAY MANUALLY
 * ============================================================================
 *
 * If you chose not to add the wallet during creation, you can add it later:
 *
 * Solana:
 *   curl -X POST http://localhost:15888/wallet/add \
 *     -H "Content-Type: application/json" \
 *     -d '{"chain": "solana", "privateKey": "<your-key>", "setDefault": true}'
 *
 * Ethereum:
 *   curl -X POST http://localhost:15888/wallet/add \
 *     -H "Content-Type: application/json" \
 *     -d '{"chain": "ethereum", "privateKey": "<your-key>", "setDefault": true}'
 *
 * ============================================================================
 */

import { Wallet } from 'ethers';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as readline from 'readline';

// Parse command line arguments
const GATEWAY_URL = process.argv.includes('--gateway')
  ? process.argv[process.argv.indexOf('--gateway') + 1]
  : 'http://localhost:15888';

const CHAIN = process.argv.includes('--chain')
  ? process.argv[process.argv.indexOf('--chain') + 1]?.toLowerCase()
  : 'solana';

const NO_ADD = process.argv.includes('--no-add');
const VERIFY_MODE = process.argv.includes('--verify');

// Validate chain
if (!['solana', 'ethereum'].includes(CHAIN)) {
  console.error(`\nError: Invalid chain "${CHAIN}". Supported chains: solana, ethereum\n`);
  process.exit(1);
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function addWalletToGateway(
  chain: string,
  privateKey: string,
  setDefault: boolean,
): Promise<{ address: string }> {
  const response = await fetch(`${GATEWAY_URL}/wallet/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chain,
      privateKey,
      setDefault,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gateway error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Generate a new wallet for the specified chain
 */
function generateWallet(chain: string): { address: string; privateKey: string } {
  if (chain === 'solana') {
    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
    };
  } else {
    const wallet = Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  }
}

/**
 * Verify a private key and return the derived address
 */
function verifyAndDeriveAddress(chain: string, privateKey: string): string {
  if (chain === 'solana') {
    const decoded = bs58.decode(privateKey);
    const secretKey = new Uint8Array(decoded);

    if (secretKey.length !== 64) {
      throw new Error(
        `Invalid key length: ${secretKey.length} bytes. Solana private keys must be 64 bytes (88 base58 characters).`,
      );
    }

    const keypair = Keypair.fromSecretKey(secretKey);
    return keypair.publicKey.toBase58();
  } else {
    // Ethereum - ethers will validate the key format
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }

    if (privateKey.length !== 66) {
      throw new Error(
        `Invalid key length: ${privateKey.length} characters. Ethereum private keys must be 66 characters (0x + 64 hex).`,
      );
    }

    const wallet = new Wallet(privateKey);
    return wallet.address;
  }
}

/**
 * Verify a private key is valid and show its derived address
 */
async function verifyPrivateKey(): Promise<void> {
  const chainUpper = CHAIN.toUpperCase();

  console.log('\n' + '='.repeat(60));
  console.log(`  ${chainUpper} PRIVATE KEY VERIFICATION`);
  console.log('='.repeat(60) + '\n');

  const keyFormat = CHAIN === 'solana' ? 'base58' : 'hex (0x...)';

  const rl = createReadlineInterface();

  try {
    const privateKeyInput = await prompt(rl, `Enter your private key (${keyFormat}): `);

    if (!privateKeyInput) {
      console.log('\nNo private key provided.');
      process.exit(1);
    }

    try {
      const address = verifyAndDeriveAddress(CHAIN, privateKeyInput);

      console.log('\n' + '='.repeat(60));
      console.log('  VALID PRIVATE KEY');
      console.log('='.repeat(60));
      console.log(`\n  Derived Address: ${address}`);
      console.log(`\n  Your private key is valid and can be used with Gateway.`);
      console.log('='.repeat(60) + '\n');
    } catch (error: any) {
      console.log('\n' + '!'.repeat(60));
      console.log('  INVALID PRIVATE KEY');
      console.log('!'.repeat(60));
      console.log(`\n  Error: ${error.message}`);
      console.log(`\n  Make sure you entered a valid ${chainUpper} private key.\n`);
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

async function main() {
  // Handle verify mode
  if (VERIFY_MODE) {
    await verifyPrivateKey();
    return;
  }

  const chainUpper = CHAIN.toUpperCase();

  console.log('\n' + '='.repeat(60));
  console.log(`  ${chainUpper} WALLET GENERATOR - Hummingbot Gateway`);
  console.log('='.repeat(60) + '\n');

  // Generate wallet locally
  const { address, privateKey } = generateWallet(CHAIN);

  console.log(`A new ${chainUpper} wallet has been generated LOCALLY on your machine.\n`);

  console.log('-'.repeat(60));
  console.log('  WALLET ADDRESS (public - safe to share):');
  console.log('-'.repeat(60));
  console.log(`  ${address}\n`);

  console.log('-'.repeat(60));
  console.log('  PRIVATE KEY (secret - NEVER share this):');
  console.log('-'.repeat(60));
  console.log(`  ${privateKey}\n`);

  console.log('!'.repeat(60));
  console.log('  CRITICAL: SAVE YOUR PRIVATE KEY NOW!');
  console.log('!'.repeat(60));
  console.log(`
  This is the ONLY time your private key will be displayed.
  If you lose it, your funds will be PERMANENTLY UNRECOVERABLE.

  1. Copy the private key to a secure password manager
  2. Store a backup in a secure offline location
  3. NEVER share your private key with anyone
  4. NEVER store it in plain text on your computer

  To verify your saved key later: pnpm wallet:create -- --verify${CHAIN !== 'solana' ? ` --chain ${CHAIN}` : ''}
`);

  if (NO_ADD) {
    console.log('--no-add specified, not adding to Gateway.');
    console.log('\nTo add this wallet to Gateway later, run:');
    console.log(`  curl -X POST ${GATEWAY_URL}/wallet/add \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"chain": "${CHAIN}", "privateKey": "<your-private-key>", "setDefault": true}'`);
    process.exit(0);
  }

  const rl = createReadlineInterface();

  try {
    // Confirm backup
    const backupConfirm = await prompt(rl, 'Have you securely saved your private key? (yes/no): ');

    if (backupConfirm.toLowerCase() !== 'yes') {
      console.log('\nPlease save your private key before proceeding.');
      console.log('Your wallet details are shown above. Run this script again when ready.');
      process.exit(0);
    }

    // Ask about adding to Gateway
    const addToGateway = await prompt(rl, `\nAdd this wallet to Gateway at ${GATEWAY_URL}? (yes/no): `);

    if (addToGateway.toLowerCase() !== 'yes') {
      console.log('\nWallet NOT added to Gateway.');
      console.log('To add it later, use the /wallet/add API endpoint.');
      process.exit(0);
    }

    // Ask about setting as default
    const setDefault = await prompt(rl, `Set as default ${chainUpper} wallet? (yes/no): `);

    console.log('\nAdding wallet to Gateway...');

    try {
      const result = await addWalletToGateway(CHAIN, privateKey, setDefault.toLowerCase() === 'yes');
      console.log('\n' + '='.repeat(60));
      console.log('  SUCCESS! Wallet added to Gateway');
      console.log('='.repeat(60));
      console.log(`  Address: ${result.address}`);
      console.log(`  Default: ${setDefault.toLowerCase() === 'yes' ? 'Yes' : 'No'}`);
      console.log('='.repeat(60) + '\n');
    } catch (error: any) {
      console.error('\nFailed to add wallet to Gateway:', error.message);
      console.log('\nYour wallet was generated successfully. You can add it manually later.');
      console.log('Make sure Gateway is running and the passphrase is configured.');
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
