#!/usr/bin/env node
/**
 * Script to update token lists with top tokens from CoinGecko using Gateway MCP
 * Run with: node scripts/update-token-lists-mcp.js
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const GATEWAY_URL = 'http://localhost:15888';

// Token addresses to always include
const ALWAYS_INCLUDE = {
  ethereum: {
    'HBOT': '0xE5097D9baeAFB89f9bcB78C9290d545dB5f9e9CB' // Hummingbot token
  }
};

async function fetchTopTokensPage(page, perPage = 50) {
  try {
    console.log(`Fetching page ${page} (${perPage} tokens per page)...`);
    
    // Use the Gateway MCP endpoint
    const response = await axios.post(`${GATEWAY_URL}/mcp/coingecko/coins/markets`, {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: perPage,
      page: page,
      sparkline: false
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error.response?.data || error.message);
    return [];
  }
}

async function fetchTopTokens(totalTokens = 1000) {
  const perPage = 50; // Smaller page size to avoid token limits
  const pages = Math.ceil(totalTokens / perPage);
  const allTokens = [];
  
  console.log(`Fetching top ${totalTokens} tokens in ${pages} pages...`);
  
  for (let page = 1; page <= pages; page++) {
    const tokens = await fetchTopTokensPage(page, perPage);
    allTokens.push(...tokens);
    
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`Fetched ${allTokens.length} tokens total`);
  return allTokens;
}

async function loadExistingTokenList(chain, network) {
  const tokenListPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', chain, `${network}.json`);
  
  try {
    const data = await fs.readFile(tokenListPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading token list for ${chain}/${network}:`, error.message);
    return [];
  }
}

async function getTokenDetails(tokenId) {
  try {
    const response = await axios.post(`${GATEWAY_URL}/mcp/coingecko/coins/${tokenId}`, {
      localization: false,
      tickers: false,
      market_data: false,
      community_data: false,
      developer_data: false
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching details for ${tokenId}:`, error.message);
    return null;
  }
}

async function updateTokenLists() {
  console.log('Starting token list update...');
  console.log('Make sure Gateway is running on port 15888 with MCP enabled!\n');
  
  // Fetch top 1000 tokens
  const topTokens = await fetchTopTokens(1000);
  
  if (topTokens.length === 0) {
    console.error('Failed to fetch tokens. Is Gateway running with MCP enabled?');
    return;
  }
  
  // Create lookup maps
  const topTokensBySymbol = new Map();
  const topTokensById = new Map();
  const topTokenRanks = new Map();
  
  topTokens.forEach((token, index) => {
    topTokensBySymbol.set(token.symbol.toUpperCase(), token);
    topTokensById.set(token.id, token);
    topTokenRanks.set(token.id, index + 1);
  });
  
  // Load existing token lists
  console.log('\nLoading existing token lists...');
  const ethTokens = await loadExistingTokenList('ethereum', 'mainnet');
  const solTokens = await loadExistingTokenList('solana', 'mainnet-beta');
  
  console.log(`Loaded ${ethTokens.length} Ethereum tokens`);
  console.log(`Loaded ${solTokens.length} Solana tokens`);
  
  // Build platform maps by fetching details for relevant tokens
  console.log('\nBuilding platform address maps...');
  const ethAddressToToken = new Map();
  const solAddressToToken = new Map();
  const platformCache = new Map();
  
  // First, try to match by symbol and fetch platform data
  const tokensToCheck = new Set();
  
  // Add all tokens that might match by symbol
  [...ethTokens, ...solTokens].forEach(token => {
    const topToken = topTokensBySymbol.get(token.symbol.toUpperCase());
    if (topToken) {
      tokensToCheck.add(topToken.id);
    }
  });
  
  console.log(`Checking platform data for ${tokensToCheck.size} potential matches...`);
  
  let checked = 0;
  for (const tokenId of tokensToCheck) {
    if (checked % 10 === 0) {
      console.log(`Checking token ${checked}/${tokensToCheck.size}...`);
    }
    
    const details = await getTokenDetails(tokenId);
    if (details && details.platforms) {
      platformCache.set(tokenId, details.platforms);
      
      if (details.platforms.ethereum) {
        ethAddressToToken.set(details.platforms.ethereum.toLowerCase(), topTokensById.get(tokenId));
      }
      
      if (details.platforms.solana) {
        solAddressToToken.set(details.platforms.solana, topTokensById.get(tokenId));
      }
    }
    
    checked++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Filter Ethereum tokens
  console.log('\nFiltering Ethereum tokens...');
  const filteredEthTokens = [];
  const excludedEth = [];
  
  ethTokens.forEach(token => {
    // Always include HBOT
    if (token.symbol === 'HBOT') {
      console.log('✅ Including HBOT (always include)');
      filteredEthTokens.push(token);
      return;
    }
    
    // Check if token is in top 1000 by symbol
    const topToken = topTokensBySymbol.get(token.symbol.toUpperCase());
    if (topToken) {
      const rank = topTokenRanks.get(topToken.id);
      console.log(`✅ Including ${token.symbol} (rank #${rank})`);
      filteredEthTokens.push(token);
      return;
    }
    
    // Check by address
    const tokenByAddress = ethAddressToToken.get(token.address.toLowerCase());
    if (tokenByAddress) {
      const rank = topTokenRanks.get(tokenByAddress.id);
      console.log(`✅ Including ${token.symbol} by address match (rank #${rank})`);
      filteredEthTokens.push(token);
      return;
    }
    
    excludedEth.push(token.symbol);
  });
  
  // Filter Solana tokens
  console.log('\nFiltering Solana tokens...');
  const filteredSolTokens = [];
  const excludedSol = [];
  
  solTokens.forEach(token => {
    // Check if token is in top 1000 by symbol
    const topToken = topTokensBySymbol.get(token.symbol.toUpperCase());
    if (topToken) {
      const rank = topTokenRanks.get(topToken.id);
      console.log(`✅ Including ${token.symbol} (rank #${rank})`);
      filteredSolTokens.push(token);
      return;
    }
    
    // Check by address
    const tokenByAddress = solAddressToToken.get(token.address);
    if (tokenByAddress) {
      const rank = topTokenRanks.get(tokenByAddress.id);
      console.log(`✅ Including ${token.symbol} by address match (rank #${rank})`);
      filteredSolTokens.push(token);
      return;
    }
    
    excludedSol.push(token.symbol);
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`Ethereum: ${ethTokens.length} -> ${filteredEthTokens.length} tokens (removed ${excludedEth.length})`);
  console.log(`Solana: ${solTokens.length} -> ${filteredSolTokens.length} tokens (removed ${excludedSol.length})`);
  
  if (excludedEth.length > 0) {
    console.log(`\nExcluded Ethereum tokens: ${excludedEth.slice(0, 10).join(', ')}${excludedEth.length > 10 ? '...' : ''}`);
  }
  
  if (excludedSol.length > 0) {
    console.log(`Excluded Solana tokens: ${excludedSol.slice(0, 10).join(', ')}${excludedSol.length > 10 ? '...' : ''}`);
  }
  
  // Save updated token lists
  const ethPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', 'mainnet.json');
  const solPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'solana', 'mainnet-beta.json');
  
  // Sort tokens by symbol for consistency
  filteredEthTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  filteredSolTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  await fs.writeFile(ethPath, JSON.stringify(filteredEthTokens, null, 2));
  await fs.writeFile(solPath, JSON.stringify(filteredSolTokens, null, 2));
  
  console.log('\n✅ Token lists updated successfully!');
  
  // Verify HBOT is included
  const hbotIncluded = filteredEthTokens.find(t => t.symbol === 'HBOT');
  if (hbotIncluded) {
    console.log('✅ HBOT is included in Ethereum mainnet list');
  } else {
    console.log('❌ WARNING: HBOT is not in the Ethereum mainnet list!');
  }
}

// Run the update
updateTokenLists().catch(console.error);