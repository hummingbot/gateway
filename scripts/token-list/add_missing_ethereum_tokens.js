const https = require('https');
const fs = require('fs');
const path = require('path');

// Function to fetch data from CoinGecko API with proper rate limiting
async function fetchCoinGeckoData(page) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.coingecko.com',
      path: `/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 429) {
        console.log('Rate limit reached, waiting to retry...');
        setTimeout(() => {
          fetchCoinGeckoData(page).then(resolve).catch(reject);
        }, 60000); // Wait 1 minute on rate limit
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Function to fetch list of tokens by platform (more efficient)
async function fetchTokensByPlatform(platform) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.coingecko.com',
      path: `/api/v3/coins/list?include_platform=true`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 429) {
        console.log('Rate limit reached, waiting to retry...');
        setTimeout(() => {
          fetchTokensByPlatform(platform).then(resolve).catch(reject);
        }, 60000); // Wait 1 minute on rate limit
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          // Filter tokens that exist on the specified platform
          const filteredTokens = jsonData.filter(token => 
            token.platforms && token.platforms[platform]
          );
          
          resolve(filteredTokens);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Main function to fetch all pages of top tokens
async function fetchTopTokens() {
  const tokens = [];
  
  for (let page = 1; page <= 4; page++) { // 4 pages of 250 tokens each = 1000 tokens
    console.log(`Fetching page ${page}...`);
    try {
      const data = await fetchCoinGeckoData(page);
      tokens.push(...data);
      
      // Add a delay to avoid rate limiting
      if (page < 4) {
        console.log('Waiting to avoid rate limits...');
        await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds between requests
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
    }
  }

  return tokens;
}

// Function to process Ethereum tokens
async function processEthereumTokens() {
  try {
    console.log('\n=== Processing Ethereum Tokens ===');
    
    // Fetch top tokens
    const topTokens = await fetchTopTokens();
    console.log(`Fetched ${topTokens.length} top tokens from CoinGecko`);
    
    // Create a set of top token symbols for faster lookup
    const topTokenSymbols = new Set(topTokens.map(token => token.symbol.toUpperCase()));
    
    // Create a map of top token details by symbol for easy access
    const topTokenDetails = {};
    topTokens.forEach(token => {
      topTokenDetails[token.symbol.toUpperCase()] = {
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        image: token.image
      };
    });
    
    console.log(`Created set of ${topTokenSymbols.size} unique top token symbols`);
    
    // Get all Ethereum tokens from CoinGecko
    console.log('Fetching all Ethereum tokens from CoinGecko...');
    const allEthereumTokens = await fetchTokensByPlatform('ethereum');
    console.log(`Found ${allEthereumTokens.length} tokens on Ethereum blockchain`);
    
    // Filter to only get tokens that are in the top 1000
    const topEthereumTokens = allEthereumTokens.filter(token => 
      topTokenSymbols.has(token.symbol.toUpperCase())
    );
    
    console.log(`Found ${topEthereumTokens.length} top tokens on Ethereum blockchain`);
    
    // Read the current Ethereum token list
    const ethereumPath = './src/templates/lists/mainnet.json';
    const ethereumTokens = JSON.parse(fs.readFileSync(ethereumPath, 'utf8'));
    console.log(`Read ${ethereumTokens.length} tokens from current mainnet.json`);
    
    // Create a set of existing token symbols for faster lookup (case-insensitive)
    const existingSymbols = new Set(ethereumTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Current list has ${existingSymbols.size} unique symbols`);
    
    // Find missing tokens that are in top 1000 AND on Ethereum but not in our list
    const missingTokens = topEthereumTokens.filter(token => 
      !existingSymbols.has(token.symbol.toUpperCase())
    );
    
    console.log(`Found ${missingTokens.length} top Ethereum tokens missing from our list`);
    
    // Create new token entries
    const newTokens = missingTokens.map(token => {
      const details = topTokenDetails[token.symbol.toUpperCase()];
      
      return {
        chainId: 1, // Ethereum mainnet
        name: token.name,
        symbol: token.symbol,
        address: token.platforms.ethereum,
        decimals: 18, // Default for most ERC20 tokens
        logoURI: details?.image || null
      };
    });
    
    // Combine with existing tokens
    const combinedTokens = [...ethereumTokens, ...newTokens];
    console.log(`New combined Ethereum list has ${combinedTokens.length} tokens`);
    
    // Write the combined list to file
    fs.writeFileSync('./updated_ethereum_tokens.json', JSON.stringify(combinedTokens, null, 2));
    console.log('Updated Ethereum token list written to updated_ethereum_tokens.json');
    
    return newTokens;
  } catch (error) {
    console.error('Error processing Ethereum tokens:', error);
    return [];
  }
}

// Function to process Solana tokens
async function processSolanaTokens() {
  try {
    console.log('\n=== Processing Solana Tokens ===');
    
    // Fetch top tokens
    const topTokens = await fetchTopTokens();
    console.log(`Fetched ${topTokens.length} top tokens from CoinGecko`);
    
    // Create a set of top token symbols for faster lookup
    const topTokenSymbols = new Set(topTokens.map(token => token.symbol.toUpperCase()));
    
    // Create a map of top token details by symbol for easy access
    const topTokenDetails = {};
    topTokens.forEach(token => {
      topTokenDetails[token.symbol.toUpperCase()] = {
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        image: token.image
      };
    });
    
    console.log(`Created set of ${topTokenSymbols.size} unique top token symbols`);
    
    // Get all Solana tokens from CoinGecko
    console.log('Fetching all Solana tokens from CoinGecko...');
    const allSolanaTokens = await fetchTokensByPlatform('solana');
    console.log(`Found ${allSolanaTokens.length} tokens on Solana blockchain`);
    
    // Filter to only get tokens that are in the top 1000
    const topSolanaTokens = allSolanaTokens.filter(token => 
      topTokenSymbols.has(token.symbol.toUpperCase())
    );
    
    console.log(`Found ${topSolanaTokens.length} top tokens on Solana blockchain`);
    
    // Read the current Solana token list
    const solanaPath = './src/templates/lists/solana.json';
    const solanaTokens = JSON.parse(fs.readFileSync(solanaPath, 'utf8'));
    console.log(`Read ${solanaTokens.length} tokens from current solana.json`);
    
    // Create a set of existing token symbols for faster lookup (case-insensitive)
    const existingSymbols = new Set(solanaTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Current list has ${existingSymbols.size} unique symbols`);
    
    // Find missing tokens that are in top 1000 AND on Solana but not in our list
    const missingTokens = topSolanaTokens.filter(token => 
      !existingSymbols.has(token.symbol.toUpperCase())
    );
    
    console.log(`Found ${missingTokens.length} top Solana tokens missing from our list`);
    
    // Create new token entries
    const newTokens = missingTokens.map(token => {
      const details = topTokenDetails[token.symbol.toUpperCase()];
      
      return {
        chainId: 101, // Solana mainnet
        name: token.name,
        symbol: token.symbol,
        address: token.platforms.solana,
        decimals: 9 // Common for Solana SPL tokens
      };
    });
    
    // Combine with existing tokens
    const combinedTokens = [...solanaTokens, ...newTokens];
    console.log(`New combined Solana list has ${combinedTokens.length} tokens`);
    
    // Write the combined list to file
    fs.writeFileSync('./updated_solana_tokens.json', JSON.stringify(combinedTokens, null, 2));
    console.log('Updated Solana token list written to updated_solana_tokens.json');
    
    return newTokens;
  } catch (error) {
    console.error('Error processing Solana tokens:', error);
    return [];
  }
}

// Main function
async function addMissingTokens() {
  try {
    console.log('Starting to process tokens...');
    
    // Process Ethereum tokens
    const newEthereumTokens = await processEthereumTokens();
    
    // Process Solana tokens
    const newSolanaTokens = await processSolanaTokens();
    
    // Summary
    console.log('\n=== Summary ===');
    console.log(`Added ${newEthereumTokens.length} new tokens to Ethereum list`);
    console.log(`Added ${newSolanaTokens.length} new tokens to Solana list`);
    
  } catch (error) {
    console.error('Error adding missing tokens:', error);
  }
}

// Run the function
addMissingTokens();