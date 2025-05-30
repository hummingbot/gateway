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

// Function to fetch list of tokens by platform
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

// Function to process Base tokens
async function processBaseTokens() {
  try {
    console.log('Processing Base tokens...');
    
    // Fetch top 1000 tokens
    console.log('Fetching top 1000 tokens from CoinGecko...');
    const topTokens = await fetchTopTokens();
    console.log(`Fetched ${topTokens.length} top tokens from CoinGecko`);
    
    // Create a set of symbols for faster lookup
    const topTokenSymbols = new Set(topTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Created set of ${topTokenSymbols.size} unique top token symbols`);
    
    // Write top symbols to file for reference
    fs.writeFileSync('./scripts/token-list/data/base_top_symbols.txt', Array.from(topTokenSymbols).join('\n'));
    
    // Get all Base tokens from CoinGecko
    console.log('Fetching all Base chain tokens from CoinGecko...');
    const allBaseTokens = await fetchTokensByPlatform('base');
    console.log(`Found ${allBaseTokens.length} tokens on Base blockchain`);
    
    // Filter to only get tokens that are in the top 1000
    const topBaseTokens = allBaseTokens.filter(token => 
      topTokenSymbols.has(token.symbol.toUpperCase())
    );
    
    console.log(`Found ${topBaseTokens.length} top tokens on Base blockchain`);
    
    // Read the current Base token list
    const basePath = './src/templates/lists/base.json';
    const baseTokens = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    console.log(`Read ${baseTokens.length} tokens from current base.json`);
    
    // Create a set of existing token contract addresses for faster lookup (case-insensitive)
    const existingAddresses = new Set(baseTokens.map(token => 
      token.address.toLowerCase()
    ));
    console.log(`Current list has ${existingAddresses.size} unique addresses`);
    
    // Create a mapping from address to token for faster lookup
    const addressToToken = {};
    baseTokens.forEach(token => {
      addressToToken[token.address.toLowerCase()] = token;
    });

    // Find tokens from CoinGecko that are not in our list
    const tokensToAdd = [];
    const updatedTokens = [];
    let matchCount = 0;
    
    for (const token of topBaseTokens) {
      const baseAddress = token.platforms['base'].toLowerCase();
      
      // Check if address already exists in our list
      if (existingAddresses.has(baseAddress)) {
        matchCount++;
        // Use the one from our list as it has proper formatting
        updatedTokens.push(addressToToken[baseAddress]);
      } else {
        // This is a new token to add
        tokensToAdd.push({
          chainId: 8453, // Base mainnet
          name: token.name,
          symbol: token.symbol,
          address: token.platforms['base'],
          decimals: 18, // Default for most ERC20 tokens, we may need to adjust this
        });
      }
    }
    
    console.log(`Found ${matchCount} tokens that match existing tokens`);
    console.log(`Found ${tokensToAdd.length} new tokens to add`);
    
    // Combine existing tokens with new ones
    const combinedTokens = [...updatedTokens, ...tokensToAdd];
    console.log(`New combined Base list has ${combinedTokens.length} tokens`);
    
    // Create a backup of the original file
    const backupPath = './src/templates/lists/base.json.bak';
    fs.copyFileSync(basePath, backupPath);
    console.log(`Backup created at ${backupPath}`);
    
    // Write the combined tokens to a new file
    fs.writeFileSync('./scripts/token-list/data/updated_base_tokens.json', JSON.stringify(combinedTokens, null, 2));
    console.log('Updated Base token list written to updated_base_tokens.json');
    
    return combinedTokens;
  } catch (error) {
    console.error('Error processing Base tokens:', error);
    return [];
  }
}

// Run the function
processBaseTokens();