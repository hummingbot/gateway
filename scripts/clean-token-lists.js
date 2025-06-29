#!/usr/bin/env node
/**
 * Script to clean token lists by keeping only top 1000 tokens from CoinGecko
 * Uses direct CoinGecko API to avoid MCP token limits
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// CoinGecko API (free tier)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Token addresses to always include
const ALWAYS_INCLUDE = {
  ethereum: {
    'HBOT': '0xE5097D9baeAFB89f9bcB78C9290d545dB5f9e9CB' // Hummingbot token
  }
};

// Known platform IDs in CoinGecko
const PLATFORM_IDS = {
  ethereum: 'ethereum',
  solana: 'solana'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTopTokens() {
  console.log('Fetching top 1000 tokens from CoinGecko...');
  const allTokens = [];
  const perPage = 250;
  const pages = 4; // 4 pages × 250 = 1000 tokens
  
  for (let page = 1; page <= pages; page++) {
    try {
      console.log(`Fetching page ${page}/${pages}...`);
      const response = await axios.get(`${COINGECKO_API}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: perPage,
          page: page,
          sparkline: false,
          price_change_percentage: '24h'
        },
        timeout: 30000
      });
      
      allTokens.push(...response.data);
      console.log(`  Got ${response.data.length} tokens (total: ${allTokens.length})`);
      
      // CoinGecko free tier rate limit: 10-30 calls/minute
      await sleep(3000); // 3 seconds between requests
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      if (error.response?.status === 429) {
        console.log('Rate limited, waiting 60 seconds...');
        await sleep(60000);
        page--; // Retry this page
      }
    }
  }
  
  return allTokens;
}

async function loadTokenList(chain, network) {
  const tokenListPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', chain, `${network}.json`);
  
  try {
    const data = await fs.readFile(tokenListPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading token list for ${chain}/${network}:`, error.message);
    return [];
  }
}

async function cleanTokenLists() {
  try {
    // Fetch top 1000 tokens
    const topTokens = await fetchTopTokens();
    console.log(`\nFetched ${topTokens.length} top tokens`);
    
    if (topTokens.length === 0) {
      console.error('No tokens fetched!');
      return;
    }
    
    // Create lookup structures
    const topTokensBySymbol = new Map();
    const topTokensByCoingeckoId = new Map();
    const rankBySymbol = new Map();
    
    topTokens.forEach((token, index) => {
      const symbol = token.symbol.toUpperCase();
      topTokensBySymbol.set(symbol, token);
      topTokensByCoingeckoId.set(token.id, token);
      rankBySymbol.set(symbol, index + 1);
    });
    
    // Load existing token lists
    console.log('\nLoading existing token lists...');
    const ethTokens = await loadTokenList('ethereum', 'mainnet');
    const solTokens = await loadTokenList('solana', 'mainnet-beta');
    
    console.log(`Ethereum mainnet: ${ethTokens.length} tokens`);
    console.log(`Solana mainnet-beta: ${solTokens.length} tokens`);
    
    // Filter Ethereum tokens
    console.log('\n🔍 Filtering Ethereum tokens...');
    const filteredEthTokens = [];
    const ethStats = { kept: 0, removed: 0, alwaysInclude: 0 };
    
    for (const token of ethTokens) {
      const symbol = token.symbol.toUpperCase();
      
      // Always include specified tokens
      if (ALWAYS_INCLUDE.ethereum && ALWAYS_INCLUDE.ethereum[token.symbol]) {
        filteredEthTokens.push(token);
        ethStats.alwaysInclude++;
        console.log(`✅ ${token.symbol} - Always include`);
        continue;
      }
      
      // Check if in top 1000
      if (topTokensBySymbol.has(symbol)) {
        const rank = rankBySymbol.get(symbol);
        filteredEthTokens.push(token);
        ethStats.kept++;
        if (rank <= 100) { // Only log top 100
          console.log(`✅ ${token.symbol} - Rank #${rank}`);
        }
      } else {
        ethStats.removed++;
        if (ethStats.removed <= 20) { // Log first 20 removals
          console.log(`❌ ${token.symbol} - Not in top 1000`);
        }
      }
    }
    
    // Filter Solana tokens
    console.log('\n🔍 Filtering Solana tokens...');
    const filteredSolTokens = [];
    const solStats = { kept: 0, removed: 0 };
    
    for (const token of solTokens) {
      const symbol = token.symbol.toUpperCase();
      
      // Check if in top 1000
      if (topTokensBySymbol.has(symbol)) {
        const rank = rankBySymbol.get(symbol);
        filteredSolTokens.push(token);
        solStats.kept++;
        if (rank <= 100) { // Only log top 100
          console.log(`✅ ${token.symbol} - Rank #${rank}`);
        }
      } else {
        solStats.removed++;
        if (solStats.removed <= 20) { // Log first 20 removals
          console.log(`❌ ${token.symbol} - Not in top 1000`);
        }
      }
    }
    
    // Sort tokens alphabetically for consistency
    filteredEthTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    filteredSolTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    // Display summary
    console.log('\n📊 Summary:');
    console.log(`\nEthereum mainnet:`);
    console.log(`  Original: ${ethTokens.length} tokens`);
    console.log(`  Kept: ${ethStats.kept} tokens (in top 1000)`);
    console.log(`  Always include: ${ethStats.alwaysInclude} tokens`);
    console.log(`  Removed: ${ethStats.removed} tokens`);
    console.log(`  Final: ${filteredEthTokens.length} tokens`);
    
    console.log(`\nSolana mainnet-beta:`);
    console.log(`  Original: ${solTokens.length} tokens`);
    console.log(`  Kept: ${solStats.kept} tokens (in top 1000)`);
    console.log(`  Removed: ${solStats.removed} tokens`);
    console.log(`  Final: ${filteredSolTokens.length} tokens`);
    
    // Verify HBOT is included
    const hbotIncluded = filteredEthTokens.find(t => t.symbol === 'HBOT');
    console.log(`\n${hbotIncluded ? '✅' : '❌'} HBOT is ${hbotIncluded ? '' : 'NOT '}included in Ethereum list`);
    
    // Ask for confirmation before saving
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('\nDo you want to save these changes? (y/n) ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        // Save updated token lists
        const ethPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', 'mainnet.json');
        const solPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'solana', 'mainnet-beta.json');
        
        await fs.writeFile(ethPath, JSON.stringify(filteredEthTokens, null, 2) + '\n');
        await fs.writeFile(solPath, JSON.stringify(filteredSolTokens, null, 2) + '\n');
        
        console.log('\n✅ Token lists updated successfully!');
      } else {
        console.log('\n❌ Changes discarded');
      }
      
      readline.close();
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Check if HBOT exists in current list
async function checkHBOT() {
  const ethTokens = await loadTokenList('ethereum', 'mainnet');
  const hbot = ethTokens.find(t => t.symbol === 'HBOT');
  
  if (hbot) {
    console.log('Current HBOT token info:', hbot);
  } else {
    console.log('⚠️  HBOT not found in current Ethereum mainnet list');
    console.log('It will be preserved if it exists with address:', ALWAYS_INCLUDE.ethereum.HBOT);
  }
}

// Run
console.log('🧹 Token List Cleanup Tool');
console.log('This will keep only tokens in the top 1000 by market cap\n');

checkHBOT().then(() => {
  cleanTokenLists();
});