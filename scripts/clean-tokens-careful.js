#!/usr/bin/env node
/**
 * Script to clean token lists with careful rate limiting
 * Fetches top 200 tokens and their platform addresses
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const DELAY_BETWEEN_REQUESTS = 12000; // 12 seconds to be safe with free tier

// HBOT address
const HBOT_ADDRESS = '0xe5097d9baeafb89f9bcb78c9290d545db5f9e9cb';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, { params, timeout: 30000 });
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`Rate limited, waiting ${60 * (i + 1)} seconds...`);
        await sleep(60000 * (i + 1)); // Wait 1, 2, 3 minutes
      } else if (i === retries - 1) {
        throw error;
      } else {
        await sleep(5000);
      }
    }
  }
}

async function getTop200TokenIds() {
  console.log('Fetching top 200 token IDs...');
  const tokens = [];
  
  // Get 2 pages of 100 each
  for (let page = 1; page <= 2; page++) {
    console.log(`Fetching page ${page}/2...`);
    const data = await fetchWithRetry(`${COINGECKO_API}/coins/markets`, {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: 100,
      page: page,
      sparkline: false
    });
    
    tokens.push(...data.map(t => ({
      id: t.id,
      symbol: t.symbol.toUpperCase(),
      name: t.name,
      rank: tokens.length + data.indexOf(t) + 1
    })));
    
    if (page < 2) {
      console.log(`Waiting ${DELAY_BETWEEN_REQUESTS/1000} seconds...`);
      await sleep(DELAY_BETWEEN_REQUESTS);
    }
  }
  
  return tokens;
}

async function loadExistingAddresses() {
  // Try to load from a cache file if it exists
  const cacheFile = path.join(__dirname, 'token-addresses-cache.json');
  try {
    const data = await fs.readFile(cacheFile, 'utf8');
    console.log('Loaded address cache');
    return JSON.parse(data);
  } catch (error) {
    return { ethereum: {}, solana: {} };
  }
}

async function saveAddressCache(addresses) {
  const cacheFile = path.join(__dirname, 'token-addresses-cache.json');
  await fs.writeFile(cacheFile, JSON.stringify(addresses, null, 2));
}

async function fetchPlatformAddresses(tokens) {
  console.log('\nFetching platform addresses...');
  const addresses = await loadExistingAddresses();
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Skip if we already have this token's addresses
    if (addresses.ethereum[token.id] !== undefined || addresses.solana[token.id] !== undefined) {
      console.log(`${i+1}/${tokens.length}: ${token.symbol} - cached`);
      continue;
    }
    
    console.log(`${i+1}/${tokens.length}: ${token.symbol} (${token.id})`);
    
    try {
      const data = await fetchWithRetry(`${COINGECKO_API}/coins/${token.id}`, {
        localization: false,
        tickers: false,
        market_data: false,
        community_data: false,
        developer_data: false
      });
      
      if (data.platforms) {
        if (data.platforms.ethereum) {
          addresses.ethereum[token.id] = data.platforms.ethereum.toLowerCase();
          console.log(`  ✓ ETH: ${addresses.ethereum[token.id]}`);
        }
        if (data.platforms.solana) {
          addresses.solana[token.id] = data.platforms.solana;
          console.log(`  ✓ SOL: ${addresses.solana[token.id]}`);
        }
      }
      
      // Save cache after each successful fetch
      await saveAddressCache(addresses);
      
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
    }
    
    // Always wait between requests
    console.log(`  Waiting ${DELAY_BETWEEN_REQUESTS/1000} seconds...`);
    await sleep(DELAY_BETWEEN_REQUESTS);
  }
  
  return addresses;
}

async function cleanTokenLists() {
  try {
    // Get top 200 tokens
    const top200 = await getTop200TokenIds();
    console.log(`\nGot ${top200.length} top tokens`);
    
    // Get their addresses
    const addresses = await fetchPlatformAddresses(top200);
    
    // Build sets of valid addresses
    const validEthAddresses = new Set();
    const validSolAddresses = new Set();
    
    for (const tokenId in addresses.ethereum) {
      validEthAddresses.add(addresses.ethereum[tokenId]);
    }
    for (const tokenId in addresses.solana) {
      validSolAddresses.add(addresses.solana[tokenId]);
    }
    
    // Always include HBOT
    validEthAddresses.add(HBOT_ADDRESS);
    
    console.log(`\nValid Ethereum addresses: ${validEthAddresses.size}`);
    console.log(`Valid Solana addresses: ${validSolAddresses.size}`);
    
    // Load current token lists
    const ethPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', 'mainnet.json');
    const solPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'solana', 'mainnet-beta.json');
    
    const ethTokens = JSON.parse(await fs.readFile(ethPath, 'utf8'));
    const solTokens = JSON.parse(await fs.readFile(solPath, 'utf8'));
    
    console.log(`\nCurrent Ethereum tokens: ${ethTokens.length}`);
    console.log(`Current Solana tokens: ${solTokens.length}`);
    
    // Filter by address
    const filteredEth = ethTokens.filter(t => 
      validEthAddresses.has(t.address.toLowerCase())
    );
    
    const filteredSol = solTokens.filter(t => 
      validSolAddresses.has(t.address)
    );
    
    console.log(`\nFiltered Ethereum tokens: ${filteredEth.length}`);
    console.log(`Filtered Solana tokens: ${filteredSol.length}`);
    
    // Sort by symbol
    filteredEth.sort((a, b) => a.symbol.localeCompare(b.symbol));
    filteredSol.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    // Save
    await fs.writeFile(ethPath, JSON.stringify(filteredEth, null, 2) + '\n');
    await fs.writeFile(solPath, JSON.stringify(filteredSol, null, 2) + '\n');
    
    console.log('\n✅ Token lists updated!');
    
    // Verify HBOT
    const hasHbot = filteredEth.some(t => 
      t.address.toLowerCase() === HBOT_ADDRESS
    );
    console.log(`HBOT included: ${hasHbot ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run
cleanTokenLists();