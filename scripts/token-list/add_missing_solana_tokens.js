const https = require('https');
const fs = require('fs');

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
async function fetchSolanaTokens() {
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
          fetchSolanaTokens().then(resolve).catch(reject);
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
          
          // Filter tokens that exist on Solana
          const solanaTokens = jsonData.filter(token => 
            token.platforms && token.platforms.solana
          );
          
          resolve(solanaTokens);
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

// Main function to fetch top tokens
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

// Main function to process Solana tokens
async function processSolanaTokens() {
  try {
    console.log('Fetching top 1000 tokens...');
    const topTokens = await fetchTopTokens();
    console.log(`Fetched ${topTokens.length} top tokens`);
    
    // Create a set of top token symbols for faster lookup
    const topTokenSymbols = new Set(topTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Found ${topTokenSymbols.size} unique symbols in top tokens`);
    
    // Create a map for easy access to token details
    const topTokensMap = {};
    topTokens.forEach(token => {
      topTokensMap[token.symbol.toUpperCase()] = token;
    });
    
    console.log('Fetching all Solana tokens...');
    const allSolanaTokens = await fetchSolanaTokens();
    console.log(`Found ${allSolanaTokens.length} tokens on Solana blockchain`);
    
    // Filter to only include tokens in top 1000
    const topSolanaTokens = allSolanaTokens.filter(token => 
      topTokenSymbols.has(token.symbol.toUpperCase())
    );
    console.log(`Found ${topSolanaTokens.length} top tokens on Solana blockchain`);
    
    // Read current Solana token list
    const solanaPath = './src/templates/lists/solana.json';
    const solanaTokens = JSON.parse(fs.readFileSync(solanaPath, 'utf8'));
    console.log(`Current Solana list has ${solanaTokens.length} tokens`);
    
    // Create a set of existing token symbols
    const existingSymbols = new Set(solanaTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Current list has ${existingSymbols.size} unique symbols`);
    
    // Find missing tokens
    const missingTokens = topSolanaTokens.filter(token => 
      !existingSymbols.has(token.symbol.toUpperCase())
    );
    console.log(`Found ${missingTokens.length} top Solana tokens missing from our list`);
    
    // Create new token entries
    const newTokens = missingTokens.map(token => {
      const topToken = topTokensMap[token.symbol.toUpperCase()];
      
      return {
        chainId: 101, // Solana mainnet
        name: token.name || topToken.name,
        symbol: token.symbol,
        address: token.platforms.solana,
        decimals: 9 // Common for Solana SPL tokens
      };
    });
    
    // Combine with existing tokens
    const combinedTokens = [...solanaTokens, ...newTokens];
    console.log(`New combined Solana list has ${combinedTokens.length} tokens`);
    
    // Write to file
    fs.writeFileSync('./updated_solana_tokens.json', JSON.stringify(combinedTokens, null, 2));
    console.log('Updated Solana token list written to updated_solana_tokens.json');
    
    return newTokens.length;
  } catch (error) {
    console.error('Error processing Solana tokens:', error);
    return 0;
  }
}

// Run the function
processSolanaTokens().then(count => {
  console.log(`Added ${count} new tokens to Solana list`);
});