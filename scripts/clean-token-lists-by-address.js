#!/usr/bin/env node
/**
 * Script to clean token lists by keeping only top 200 tokens by market cap
 * Matches tokens by ADDRESS (not symbol) to avoid duplicates
 * Always includes HBOT for Ethereum
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// CoinGecko API (free tier)
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Token addresses to always include
const ALWAYS_INCLUDE_ETH = new Set([
  '0xe5097d9baeafb89f9bcb78c9290d545db5f9e9cb' // HBOT (lowercase)
]);

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

async function fetchTokenDetails(tokenId) {
  try {
    const response = await axios.get(`${COINGECKO_API}/coins/${tokenId}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: false,
        community_data: false,
        developer_data: false
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching details for ${tokenId}:`, error.message);
    return null;
  }
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
    // Fetch top 200 tokens
    const topTokens = await fetchTop200Tokens();
    console.log(`\nFetched ${topTokens.length} top tokens`);
    
    if (topTokens.length === 0) {
      console.error('No tokens fetched! Check your internet connection.');
      return;
    }
    
    // Fetch platform addresses for all top 200 tokens
    console.log('\nFetching platform addresses for top 200 tokens...');
    const ethAddresses = new Set();
    const solAddresses = new Set();
    const tokenInfo = new Map();
    
    for (let i = 0; i < topTokens.length; i++) {
      const token = topTokens[i];
      console.log(`Fetching ${i + 1}/${topTokens.length}: ${token.symbol.toUpperCase()} (${token.id})`);
      
      const details = await fetchTokenDetails(token.id);
      if (details && details.platforms) {
        // Store token info for display
        tokenInfo.set(token.id, {
          symbol: token.symbol.toUpperCase(),
          name: token.name,
          rank: i + 1
        });
        
        // Ethereum addresses
        if (details.platforms.ethereum) {
          const ethAddr = details.platforms.ethereum.toLowerCase();
          ethAddresses.add(ethAddr);
          console.log(`  ✓ Ethereum: ${ethAddr}`);
        }
        
        // Solana addresses
        if (details.platforms.solana) {
          solAddresses.add(details.platforms.solana);
          console.log(`  ✓ Solana: ${details.platforms.solana}`);
        }
      }
      
      // Rate limit: 3 seconds between requests
      await sleep(3000);
    }
    
    console.log(`\nFound ${ethAddresses.size} Ethereum addresses`);
    console.log(`Found ${solAddresses.size} Solana addresses`);
    
    // Load existing token lists
    console.log('\nLoading existing token lists...');
    const ethTokens = await loadTokenList('ethereum', 'mainnet');
    const solTokens = await loadTokenList('solana', 'mainnet-beta');
    
    console.log(`Current Ethereum mainnet: ${ethTokens.length} tokens`);
    console.log(`Current Solana mainnet-beta: ${solTokens.length} tokens`);
    
    // Filter Ethereum tokens by address
    console.log('\n🔍 Filtering Ethereum tokens by address...');
    const filteredEthTokens = [];
    const ethRemoved = [];
    
    for (const token of ethTokens) {
      const addr = token.address.toLowerCase();
      
      // Always include HBOT
      if (ALWAYS_INCLUDE_ETH.has(addr)) {
        filteredEthTokens.push(token);
        console.log(`✅ ${token.symbol} - Always include (HBOT)`);
        continue;
      }
      
      // Check if address is in top 200
      if (ethAddresses.has(addr)) {
        filteredEthTokens.push(token);
        console.log(`✅ ${token.symbol} (${addr}) - In top 200`);
      } else {
        ethRemoved.push(token);
      }
    }
    
    // Filter Solana tokens by address
    console.log('\n🔍 Filtering Solana tokens by address...');
    const filteredSolTokens = [];
    const solRemoved = [];
    
    for (const token of solTokens) {
      // Check if address is in top 200
      if (solAddresses.has(token.address)) {
        filteredSolTokens.push(token);
        console.log(`✅ ${token.symbol} (${token.address}) - In top 200`);
      } else {
        solRemoved.push(token);
      }
    }
    
    // Sort tokens alphabetically for consistency
    filteredEthTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    filteredSolTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    // Display summary
    console.log('\n📊 Summary:');
    console.log(`\nEthereum mainnet:`);
    console.log(`  Original: ${ethTokens.length} tokens`);
    console.log(`  Kept: ${filteredEthTokens.length} tokens`);
    console.log(`  Removed: ${ethRemoved.length} tokens`);
    
    console.log(`\nSolana mainnet-beta:`);
    console.log(`  Original: ${solTokens.length} tokens`);
    console.log(`  Kept: ${filteredSolTokens.length} tokens`);
    console.log(`  Removed: ${solRemoved.length} tokens`);
    
    // Verify HBOT is included
    const hbotIncluded = filteredEthTokens.find(t => 
      t.address.toLowerCase() === '0xe5097d9baeafb89f9bcb78c9290d545db5f9e9cb'
    );
    console.log(`\n${hbotIncluded ? '✅' : '❌'} HBOT is ${hbotIncluded ? '' : 'NOT '}included in Ethereum list`);
    
    // Show removed tokens
    console.log('\nTokens that will be removed:');
    console.log('Ethereum:', ethRemoved.slice(0, 10).map(t => `${t.symbol} (${t.address})`).join('\n  '));
    if (ethRemoved.length > 10) {
      console.log(`  ... and ${ethRemoved.length - 10} more`);
    }
    
    console.log('\nSolana:', solRemoved.slice(0, 10).map(t => `${t.symbol} (${t.address})`).join('\n  '));
    if (solRemoved.length > 10) {
      console.log(`  ... and ${solRemoved.length - 10} more`);
    }
    
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
console.log('🧹 Token List Cleanup - Top 200 by Market Cap (Address-based matching)');
console.log('==============================================================\n');

cleanTokenLists();