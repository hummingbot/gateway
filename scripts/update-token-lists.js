#!/usr/bin/env node
/**
 * Script to update token lists with top 1000 tokens from CoinGecko
 * Keeps only tokens that are in the top 1000 by market cap
 * Always includes HBOT in Ethereum mainnet list
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const GATEWAY_URL = 'http://localhost:15888';
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';

// Token addresses to always include
const ALWAYS_INCLUDE = {
  ethereum: {
    'HBOT': '0xE5097D9baeAFB89f9bcB78C9290d545dB5f9e9CB' // Hummingbot token
  }
};

async function fetchTopTokensFromCoinGecko(pages = 10) {
  console.log(`Fetching top ${pages * 100} tokens from CoinGecko...`);
  const allTokens = [];
  
  for (let page = 1; page <= pages; page++) {
    try {
      console.log(`Fetching page ${page}...`);
      const response = await axios.get(`${COINGECKO_API_URL}/coins/markets`, {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          page: page,
          sparkline: false,
          locale: 'en'
        }
      });
      
      allTokens.push(...response.data);
      
      // Add a small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      break;
    }
  }
  
  console.log(`Fetched ${allTokens.length} tokens total`);
  return allTokens;
}

async function getTokenPlatforms(tokenId) {
  try {
    const response = await axios.get(`${COINGECKO_API_URL}/coins/${tokenId}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: false,
        community_data: false,
        developer_data: false
      }
    });
    
    return response.data.platforms || {};
  } catch (error) {
    console.error(`Error fetching platforms for ${tokenId}:`, error.message);
    return {};
  }
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

async function updateTokenLists() {
  // Fetch top 1000 tokens (10 pages of 100)
  const topTokens = await fetchTopTokensFromCoinGecko(10);
  
  // Create maps for quick lookup
  const topTokensBySymbol = new Map();
  const topTokensById = new Map();
  
  topTokens.forEach(token => {
    topTokensBySymbol.set(token.symbol.toUpperCase(), token);
    topTokensById.set(token.id, token);
  });
  
  // Load existing token lists
  console.log('\nLoading existing token lists...');
  const ethTokens = await loadExistingTokenList('ethereum', 'mainnet');
  const solTokens = await loadExistingTokenList('solana', 'mainnet-beta');
  
  console.log(`Loaded ${ethTokens.length} Ethereum tokens`);
  console.log(`Loaded ${solTokens.length} Solana tokens`);
  
  // Build platform address maps
  console.log('\nBuilding platform address maps...');
  const ethAddressToToken = new Map();
  const solAddressToToken = new Map();
  
  // Fetch platform data for top tokens
  let processed = 0;
  for (const token of topTokens) {
    if (processed % 50 === 0) {
      console.log(`Processing token ${processed}/${topTokens.length}...`);
    }
    
    const platforms = await getTokenPlatforms(token.id);
    
    if (platforms.ethereum) {
      ethAddressToToken.set(platforms.ethereum.toLowerCase(), token);
    }
    
    if (platforms.solana) {
      solAddressToToken.set(platforms.solana, token);
    }
    
    processed++;
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  
  // Filter Ethereum tokens
  console.log('\nFiltering Ethereum tokens...');
  const filteredEthTokens = ethTokens.filter(token => {
    // Always include HBOT
    if (token.symbol === 'HBOT') {
      console.log('Including HBOT (always include)');
      return true;
    }
    
    // Check if token is in top 1000 by symbol
    const topToken = topTokensBySymbol.get(token.symbol.toUpperCase());
    if (topToken) {
      console.log(`Including ${token.symbol} (rank #${topTokens.indexOf(topToken) + 1})`);
      return true;
    }
    
    // Check by address
    const tokenByAddress = ethAddressToToken.get(token.address.toLowerCase());
    if (tokenByAddress) {
      console.log(`Including ${token.symbol} by address (rank #${topTokens.indexOf(tokenByAddress) + 1})`);
      return true;
    }
    
    console.log(`Excluding ${token.symbol} (not in top 1000)`);
    return false;
  });
  
  // Filter Solana tokens
  console.log('\nFiltering Solana tokens...');
  const filteredSolTokens = solTokens.filter(token => {
    // Check if token is in top 1000 by symbol
    const topToken = topTokensBySymbol.get(token.symbol.toUpperCase());
    if (topToken) {
      console.log(`Including ${token.symbol} (rank #${topTokens.indexOf(topToken) + 1})`);
      return true;
    }
    
    // Check by address
    const tokenByAddress = solAddressToToken.get(token.address);
    if (tokenByAddress) {
      console.log(`Including ${token.symbol} by address (rank #${topTokens.indexOf(tokenByAddress) + 1})`);
      return true;
    }
    
    console.log(`Excluding ${token.symbol} (not in top 1000)`);
    return false;
  });
  
  // Add any missing tokens from always include list
  for (const [symbol, address] of Object.entries(ALWAYS_INCLUDE.ethereum || {})) {
    if (!filteredEthTokens.find(t => t.symbol === symbol)) {
      // Find the token in original list
      const originalToken = ethTokens.find(t => t.symbol === symbol);
      if (originalToken) {
        console.log(`Adding ${symbol} from always include list`);
        filteredEthTokens.push(originalToken);
      }
    }
  }
  
  console.log(`\nFiltered Ethereum tokens: ${ethTokens.length} -> ${filteredEthTokens.length}`);
  console.log(`Filtered Solana tokens: ${solTokens.length} -> ${filteredSolTokens.length}`);
  
  // Save updated token lists
  const ethPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', 'mainnet.json');
  const solPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'solana', 'mainnet-beta.json');
  
  await fs.writeFile(ethPath, JSON.stringify(filteredEthTokens, null, 2));
  await fs.writeFile(solPath, JSON.stringify(filteredSolTokens, null, 2));
  
  console.log('\n✅ Token lists updated successfully!');
  console.log(`Ethereum mainnet: ${filteredEthTokens.length} tokens`);
  console.log(`Solana mainnet-beta: ${filteredSolTokens.length} tokens`);
  
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