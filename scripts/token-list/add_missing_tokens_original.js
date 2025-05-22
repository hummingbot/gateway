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

// Function to fetch additional token details
async function fetchTokenDetails(coinId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.coingecko.com',
      path: `/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 429) {
        console.log('Rate limit reached, waiting to retry...');
        setTimeout(() => {
          fetchTokenDetails(coinId).then(resolve).catch(reject);
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

// Main function to fetch all pages
async function fetchAllPages() {
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
async function processEthereumTokens(topTokens) {
  try {
    // Read the Ethereum token list
    const ethereumPath = './src/templates/lists/mainnet.json';
    const ethereumTokens = JSON.parse(fs.readFileSync(ethereumPath, 'utf8'));
    console.log(`Read ${ethereumTokens.length} tokens from mainnet.json`);
    
    // Create a set of existing token symbols for faster lookup (case-insensitive)
    const existingSymbols = new Set(ethereumTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Unique symbols in Ethereum list: ${existingSymbols.size}`);
    
    // Find missing tokens
    const missingTokens = topTokens.filter(token => {
      // Only consider Ethereum tokens (platform: "ethereum")
      if (!token.symbol) return false;
      
      return !existingSymbols.has(token.symbol.toUpperCase());
    });
    
    console.log(`Found ${missingTokens.length} top tokens missing from Ethereum list`);
    
    // We'll need to get detailed information for each missing token
    const newEthereumTokens = [];
    let count = 0;
    
    for (const token of missingTokens) {
      try {
        console.log(`Fetching details for ${token.symbol} (${token.id})...`);
        const details = await fetchTokenDetails(token.id);
        
        // Check if it has Ethereum contract info
        if (details.platforms && details.platforms.ethereum) {
          const contractAddress = details.platforms.ethereum;
          
          // Create a new token entry
          const newToken = {
            chainId: 1, // Ethereum mainnet
            name: token.name,
            symbol: token.symbol,
            address: contractAddress,
            decimals: 18, // Default for most ERC20 tokens
            logoURI: token.image
          };
          
          newEthereumTokens.push(newToken);
          console.log(`Added ${token.symbol} to new Ethereum tokens list`);
          count++;
        } else {
          console.log(`Skipping ${token.symbol}: No Ethereum contract address found`);
        }
        
        // Add a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 6000));
      } catch (error) {
        console.error(`Error fetching details for ${token.symbol}:`, error);
      }
    }
    
    console.log(`Successfully gathered details for ${count} new Ethereum tokens`);
    
    // Combine with existing tokens
    const combinedEthereumTokens = [...ethereumTokens, ...newEthereumTokens];
    console.log(`New combined Ethereum list has ${combinedEthereumTokens.length} tokens`);
    
    // Write the combined list to file
    fs.writeFileSync('./updated_ethereum_tokens.json', JSON.stringify(combinedEthereumTokens, null, 2));
    console.log('Updated Ethereum token list written to updated_ethereum_tokens.json');
    
    return newEthereumTokens;
  } catch (error) {
    console.error('Error processing Ethereum tokens:', error);
    return [];
  }
}

// Function to process Solana tokens
async function processSolanaTokens(topTokens) {
  try {
    // Read the Solana token list
    const solanaPath = './src/templates/lists/solana.json';
    const solanaTokens = JSON.parse(fs.readFileSync(solanaPath, 'utf8'));
    console.log(`Read ${solanaTokens.length} tokens from solana.json`);
    
    // Create a set of existing token symbols for faster lookup (case-insensitive)
    const existingSymbols = new Set(solanaTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Unique symbols in Solana list: ${existingSymbols.size}`);
    
    // Find missing tokens
    const missingTokens = topTokens.filter(token => {
      if (!token.symbol) return false;
      
      return !existingSymbols.has(token.symbol.toUpperCase());
    });
    
    console.log(`Found ${missingTokens.length} top tokens missing from Solana list`);
    
    // We'll need to get detailed information for each missing token
    const newSolanaTokens = [];
    let count = 0;
    
    for (const token of missingTokens) {
      try {
        console.log(`Fetching details for ${token.symbol} (${token.id})...`);
        const details = await fetchTokenDetails(token.id);
        
        // Check if it has Solana contract info
        if (details.platforms && details.platforms.solana) {
          const contractAddress = details.platforms.solana;
          
          // Create a new token entry
          const newToken = {
            chainId: 101, // Solana mainnet
            name: token.name,
            symbol: token.symbol,
            address: contractAddress,
            decimals: 9 // Common for Solana SPL tokens
          };
          
          newSolanaTokens.push(newToken);
          console.log(`Added ${token.symbol} to new Solana tokens list`);
          count++;
        } else {
          console.log(`Skipping ${token.symbol}: No Solana contract address found`);
        }
        
        // Add a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 6000));
      } catch (error) {
        console.error(`Error fetching details for ${token.symbol}:`, error);
      }
    }
    
    console.log(`Successfully gathered details for ${count} new Solana tokens`);
    
    // Combine with existing tokens
    const combinedSolanaTokens = [...solanaTokens, ...newSolanaTokens];
    console.log(`New combined Solana list has ${combinedSolanaTokens.length} tokens`);
    
    // Write the combined list to file
    fs.writeFileSync('./updated_solana_tokens.json', JSON.stringify(combinedSolanaTokens, null, 2));
    console.log('Updated Solana token list written to updated_solana_tokens.json');
    
    return newSolanaTokens;
  } catch (error) {
    console.error('Error processing Solana tokens:', error);
    return [];
  }
}

// Main function
async function addMissingTokens() {
  try {
    console.log('Fetching top 1000 tokens from CoinGecko...');
    const topTokens = await fetchAllPages();
    console.log(`Fetched ${topTokens.length} tokens from CoinGecko`);
    
    // Process Ethereum tokens
    console.log('\n=== Processing Ethereum Tokens ===');
    const newEthereumTokens = await processEthereumTokens(topTokens);
    
    // Process Solana tokens
    console.log('\n=== Processing Solana Tokens ===');
    const newSolanaTokens = await processSolanaTokens(topTokens);
    
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