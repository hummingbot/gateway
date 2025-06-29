#!/usr/bin/env node
/**
 * Script to update token lists with only top 200 tokens by market cap + HBOT
 * Uses direct CoinGecko API
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// CoinGecko API (free tier)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Token addresses to always include
const ALWAYS_INCLUDE = {
  ethereum: {
    'HBOT': '0xe5097d9baeafb89f9bcb78c9290d545db5f9e9cb' // Hummingbot token (lowercase)
  }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTop200Tokens() {
  console.log('Fetching top 200 tokens from CoinGecko...');
  const allTokens = [];
  
  try {
    // Fetch 2 pages of 100 tokens each
    for (let page = 1; page <= 2; page++) {
      console.log(`Fetching page ${page}/2...`);
      const response = await axios.get(`${COINGECKO_API}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          page: page,
          sparkline: false
        },
        timeout: 30000
      });
      
      allTokens.push(...response.data);
      console.log(`  Got ${response.data.length} tokens (total: ${allTokens.length})`);
      
      // Rate limit: wait 3 seconds between requests
      if (page < 2) {
        await sleep(3000);
      }
    }
  } catch (error) {
    console.error('Error fetching tokens:', error.message);
    if (error.response) {
      console.error('Response:', error.response.status, error.response.data);
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

async function updateTokenLists() {
  try {
    // Fetch top 200 tokens
    const topTokens = await fetchTop200Tokens();
    console.log(`\nFetched ${topTokens.length} top tokens`);
    
    if (topTokens.length === 0) {
      console.error('No tokens fetched! Check your internet connection.');
      return;
    }
    
    // Create lookup structures
    const topTokensBySymbol = new Map();
    const rankBySymbol = new Map();
    
    topTokens.forEach((token, index) => {
      const symbol = token.symbol.toUpperCase();
      topTokensBySymbol.set(symbol, token);
      rankBySymbol.set(symbol, index + 1);
    });
    
    // Load existing token lists
    console.log('\nLoading existing token lists...');
    const ethTokens = await loadTokenList('ethereum', 'mainnet');
    const solTokens = await loadTokenList('solana', 'mainnet-beta');
    
    console.log(`Current Ethereum mainnet: ${ethTokens.length} tokens`);
    console.log(`Current Solana mainnet-beta: ${solTokens.length} tokens`);
    
    // Get HBOT token info from existing list
    const hbotToken = ethTokens.find(t => t.symbol === 'HBOT');
    if (hbotToken) {
      console.log('\nFound HBOT token in existing list:', {
        symbol: hbotToken.symbol,
        address: hbotToken.address,
        name: hbotToken.name
      });
    }
    
    // Filter Ethereum tokens
    console.log('\n🔍 Filtering Ethereum tokens (keeping top 200 + HBOT)...');
    const filteredEthTokens = [];
    let ethKept = 0;
    let ethRemoved = 0;
    
    for (const token of ethTokens) {
      const symbol = token.symbol.toUpperCase();
      
      // Always include HBOT
      if (token.symbol === 'HBOT' || 
          token.address.toLowerCase() === ALWAYS_INCLUDE.ethereum.HBOT) {
        filteredEthTokens.push(token);
        console.log(`✅ ${token.symbol} - Always include (HBOT)`);
        continue;
      }
      
      // Check if in top 200
      if (topTokensBySymbol.has(symbol)) {
        const rank = rankBySymbol.get(symbol);
        filteredEthTokens.push(token);
        ethKept++;
        if (rank <= 50) { // Only log top 50
          console.log(`✅ ${token.symbol} - Rank #${rank}`);
        }
      } else {
        ethRemoved++;
      }
    }
    
    // Filter Solana tokens
    console.log('\n🔍 Filtering Solana tokens (keeping top 200)...');
    const filteredSolTokens = [];
    let solKept = 0;
    let solRemoved = 0;
    
    for (const token of solTokens) {
      const symbol = token.symbol.toUpperCase();
      
      // Check if in top 200
      if (topTokensBySymbol.has(symbol)) {
        const rank = rankBySymbol.get(symbol);
        filteredSolTokens.push(token);
        solKept++;
        if (rank <= 50) { // Only log top 50
          console.log(`✅ ${token.symbol} - Rank #${rank}`);
        }
      } else {
        solRemoved++;
      }
    }
    
    // Sort tokens alphabetically for consistency
    filteredEthTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    filteredSolTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    // Display summary
    console.log('\n📊 Summary:');
    console.log(`\nEthereum mainnet:`);
    console.log(`  Original: ${ethTokens.length} tokens`);
    console.log(`  Kept from top 200: ${ethKept} tokens`);
    console.log(`  Always included: 1 token (HBOT)`);
    console.log(`  Removed: ${ethRemoved} tokens`);
    console.log(`  Final: ${filteredEthTokens.length} tokens`);
    
    console.log(`\nSolana mainnet-beta:`);
    console.log(`  Original: ${solTokens.length} tokens`);
    console.log(`  Kept from top 200: ${solKept} tokens`);
    console.log(`  Removed: ${solRemoved} tokens`);
    console.log(`  Final: ${filteredSolTokens.length} tokens`);
    
    // Verify HBOT is included
    const hbotIncluded = filteredEthTokens.find(t => t.symbol === 'HBOT');
    console.log(`\n${hbotIncluded ? '✅' : '❌'} HBOT is ${hbotIncluded ? '' : 'NOT '}included in Ethereum list`);
    
    // Show some of the removed tokens
    console.log('\nSome tokens that will be removed:');
    const removedEth = ethTokens.filter(t => 
      t.symbol !== 'HBOT' && 
      !topTokensBySymbol.has(t.symbol.toUpperCase())
    );
    console.log('Ethereum:', removedEth.slice(0, 10).map(t => t.symbol).join(', '), 
                removedEth.length > 10 ? `... and ${removedEth.length - 10} more` : '');
    
    const removedSol = solTokens.filter(t => 
      !topTokensBySymbol.has(t.symbol.toUpperCase())
    );
    console.log('Solana:', removedSol.slice(0, 10).map(t => t.symbol).join(', '),
                removedSol.length > 10 ? `... and ${removedSol.length - 10} more` : '');
    
    // Save updated token lists
    console.log('\nSaving updated token lists...');
    const ethPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', 'mainnet.json');
    const solPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'solana', 'mainnet-beta.json');
    
    await fs.writeFile(ethPath, JSON.stringify(filteredEthTokens, null, 2) + '\n');
    await fs.writeFile(solPath, JSON.stringify(filteredSolTokens, null, 2) + '\n');
    
    console.log('\n✅ Token lists updated successfully!');
    console.log(`Ethereum mainnet: ${filteredEthTokens.length} tokens`);
    console.log(`Solana mainnet-beta: ${filteredSolTokens.length} tokens`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run
console.log('🧹 Token List Update - Top 200 by Market Cap + HBOT');
console.log('================================================\n');

updateTokenLists();