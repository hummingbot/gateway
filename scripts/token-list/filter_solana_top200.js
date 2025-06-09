const https = require('https');
const fs = require('fs');

// Function to fetch data from CoinGecko API with proper rate limiting
async function fetchCoinGeckoData() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.coingecko.com',
      path: '/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 429) {
        console.log('Rate limit reached, waiting to retry...');
        setTimeout(() => {
          fetchCoinGeckoData().then(resolve).catch(reject);
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

// Main function to filter Solana tokens
async function filterTop200Tokens() {
  try {
    console.log('Fetching top 200 tokens from CoinGecko...');
    const topTokens = await fetchCoinGeckoData();
    console.log(`Fetched ${topTokens.length} tokens from CoinGecko`);
    
    // Create a set of symbols for faster lookup
    const topSymbols = new Set(topTokens.map(token => token.symbol.toUpperCase()));
    console.log(`Unique symbols in top tokens: ${topSymbols.size}`);
    
    // Log the top symbols for debugging
    fs.writeFileSync('./scripts/token-list/data/top200_solana_symbols.txt', Array.from(topSymbols).join('\n'));
    console.log('Wrote top symbols to top200_solana_symbols.txt');
    
    // Read the Solana token list
    const solanaPath = './src/templates/lists/solana.json';
    const solanaTokens = JSON.parse(fs.readFileSync(solanaPath, 'utf8'));
    console.log(`Read ${solanaTokens.length} tokens from solana.json`);
    
    // Filter tokens based on symbols in the top tokens list
    const filteredTokens = solanaTokens.filter(token => {
      // Always keep SOL token
      if (token.symbol === 'SOL') return true;
      
      // Always keep tokens with empty symbols
      if (!token.symbol) return true;
      
      // Check if the token symbol is in the top tokens list (case-insensitive)
      return topSymbols.has(token.symbol.toUpperCase());
    });
    
    console.log(`Filtered down to ${filteredTokens.length} tokens`);
    
    // Create a backup of the original file
    const backupPath = './src/templates/lists/solana.json.bak';
    fs.copyFileSync(solanaPath, backupPath);
    console.log(`Backup created at ${backupPath}`);
    
    // Write the filtered tokens to the output file
    fs.writeFileSync('./scripts/token-list/data/filtered_top200_solana.json', JSON.stringify(filteredTokens, null, 2));
    console.log('Filtered token list written to filtered_top200_solana.json');
    
    // Output some stats
    console.log(`\nOriginal tokens: ${solanaTokens.length}`);
    console.log(`Filtered tokens: ${filteredTokens.length}`);
    console.log(`Removed tokens: ${solanaTokens.length - filteredTokens.length}`);
    
  } catch (error) {
    console.error('Error filtering tokens:', error);
  }
}

// Run the function
filterTop200Tokens();