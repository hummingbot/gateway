import { Contract } from '@ethersproject/contracts';
import { logger } from '../src/services/logger';
import { Ethereum } from '../src/chains/ethereum/ethereum';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_ADDRESSES = [
  '0x000Ae314E2A2172a039B26378814C252734f556A', // ASTER
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
];

const NETWORK = 'bsc';
const BSC_CHAIN_ID = 56;
const TOKEN_FILE = path.join(__dirname, '../src/templates/tokens/ethereum/bsc.json');

const ERC20_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
];

async function fetchTokenMetadata(address: string) {
  try {
    const ethereum = await Ethereum.getInstance(NETWORK);
    const contract = new Contract(address, ERC20_ABI, ethereum.provider);

    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    return {
      chainId: BSC_CHAIN_ID,
      name,
      symbol,
      address,
      decimals,
    };
  } catch (error: any) {
    logger.error(`Error fetching token metadata for ${address}: ${error.message}`);
    return null;
  }
}

async function addTokens() {
  logger.info('Fetching token metadata from BSC...\n');

  // Load existing tokens
  const existingTokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const existingAddresses = new Set(existingTokens.map((t: any) => t.address.toLowerCase()));

  const newTokens: any[] = [];

  for (const address of TOKEN_ADDRESSES) {
    logger.info(`Processing: ${address}`);

    // Skip if token already exists
    if (existingAddresses.has(address.toLowerCase())) {
      logger.info(`  ⊘ Already exists, skipping\n`);
      continue;
    }

    const metadata = await fetchTokenMetadata(address);

    if (metadata) {
      logger.info(`  ✓ Success`);
      logger.info(`    Name: ${metadata.name}`);
      logger.info(`    Symbol: ${metadata.symbol}`);
      logger.info(`    Decimals: ${metadata.decimals}\n`);
      newTokens.push(metadata);
    } else {
      logger.error(`  ✗ Failed\n`);
    }
  }

  if (newTokens.length === 0) {
    logger.info('No new tokens to add.');
    return;
  }

  // Merge and sort by symbol
  const allTokens = [...existingTokens, ...newTokens].sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );

  // Write updated token list
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(allTokens, null, 2));

  logger.info('========================================');
  logger.info(`Added ${newTokens.length} new tokens to bsc.json`);
  logger.info(`Total tokens: ${allTokens.length}`);
  logger.info('========================================');
}

addTokens().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
