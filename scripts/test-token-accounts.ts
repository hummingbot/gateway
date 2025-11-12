/**
 * Test script to identify which token account is causing base64 parsing errors
 *
 * This script:
 * 1. Loads the token list from mainnet-beta.json
 * 2. Fetches token accounts for the wallet address
 * 3. Tests each account to identify which one has base64-encoded data
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

const WALLET_ADDRESS = '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5';
const HELIUS_API_KEY = '34978b51-526d-4674-b4ee-2d6d3ee01cb9';
const STANDARD_RPC_URL = 'https://api.mainnet-beta.solana.com';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId?: number;
}

async function testTokenAccounts() {
  console.log('=== Testing Token Accounts for Base64 Error ===\n');
  console.log(`Wallet: ${WALLET_ADDRESS}\n`);

  // Load token list
  const tokenListPath = join(__dirname, '../conf/tokens/solana/mainnet-beta.json');
  const tokenListContent = await readFile(tokenListPath, 'utf-8');
  const tokens: Token[] = JSON.parse(tokenListContent);
  console.log(`Loaded ${tokens.length} tokens from mainnet-beta.json\n`);

  const walletPubkey = new PublicKey(WALLET_ADDRESS);

  // Test with both RPC endpoints
  console.log('### Testing with STANDARD RPC ###');
  console.log(`RPC: ${STANDARD_RPC_URL}\n`);
  const standardConnection = new Connection(STANDARD_RPC_URL, 'confirmed');
  await testWithConnection(standardConnection, walletPubkey, tokens, 'Standard RPC');

  console.log('\n\n### Testing with HELIUS RPC ###');
  console.log(`RPC: ${HELIUS_RPC_URL}\n`);
  const heliusConnection = new Connection(HELIUS_RPC_URL, 'confirmed');
  await testWithConnection(heliusConnection, walletPubkey, tokens, 'Helius RPC');
}

async function testWithConnection(
  connection: Connection,
  walletPubkey: PublicKey,
  tokens: Token[],
  label: string
) {

  // Fetch all token accounts
  console.log('Fetching token accounts with jsonParsed encoding...\n');

  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') },
      'jsonParsed'  // Explicitly specify jsonParsed encoding
    );

  console.log(`Found ${tokenAccounts.value.length} token accounts\n`);
  console.log('--- Testing Each Account ---\n');

  let base64Count = 0;
  let parsedCount = 0;

  for (let i = 0; i < tokenAccounts.value.length; i++) {
    const account = tokenAccounts.value[i];
    const accountData = account.account.data;

    // Check if data is base64 encoded (string) or parsed (object)
    const isBase64 = typeof accountData === 'string';
    const isParsed = typeof accountData === 'object' && accountData !== null && 'parsed' in accountData;

    if (isBase64) {
      base64Count++;
      console.log(`❌ Account ${i}: BASE64 ENCODED`);
      console.log(`   Pubkey: ${account.pubkey.toBase58()}`);
      console.log(`   Data type: ${typeof accountData}`);
      console.log(`   Data (first 100 chars): ${(accountData as string).substring(0, 100)}...\n`);
    } else if (isParsed) {
      parsedCount++;
      const parsed = (accountData as any).parsed;
      const mint = parsed?.info?.mint;

      // Try to match with token list
      const matchedToken = tokens.find(t => t.address === mint);

      console.log(`✅ Account ${i}: PARSED`);
      console.log(`   Pubkey: ${account.pubkey.toBase58()}`);
      console.log(`   Mint: ${mint}`);
      if (matchedToken) {
        console.log(`   Token: ${matchedToken.symbol} (${matchedToken.name})`);
      } else {
        console.log(`   Token: NOT IN LIST`);
      }
      console.log(`   Amount: ${parsed?.info?.tokenAmount?.uiAmountString || 'N/A'}\n`);
    } else {
      console.log(`⚠️  Account ${i}: UNKNOWN FORMAT`);
      console.log(`   Pubkey: ${account.pubkey.toBase58()}`);
      console.log(`   Data type: ${typeof accountData}`);
      console.log(`   Data: ${JSON.stringify(accountData).substring(0, 100)}...\n`);
    }
  }

    console.log(`\n=== ${label} Summary ===`);
    console.log(`Total accounts: ${tokenAccounts.value.length}`);
    console.log(`Parsed accounts: ${parsedCount}`);
    console.log(`Base64 accounts: ${base64Count}`);

    if (base64Count > 0) {
      console.log(`\n⚠️  Found ${base64Count} account(s) with base64-encoded data!`);
      console.log('These are likely causing the parsing error.');
    } else {
      console.log(`\n✅ All accounts are properly parsed with ${label}.`);
    }
  } catch (error: any) {
    console.log(`\n❌ Error fetching token accounts with ${label}:`);
    console.log(error.message);
    if (error.message.includes('Expected an object')) {
      console.log('\n⚠️  This is the base64 parsing error!');
      console.log('The RPC is returning base64-encoded data instead of parsed JSON.');
    }
  }
}

testTokenAccounts().catch(error => {
  console.error('Error testing token accounts:', error);
  process.exit(1);
});
