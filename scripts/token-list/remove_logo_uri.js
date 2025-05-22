const fs = require('fs');

// Path to the mainnet token list
const mainnetPath = './src/templates/lists/mainnet.json';

// Read the token list
console.log(`Reading token list from ${mainnetPath}...`);
const tokens = JSON.parse(fs.readFileSync(mainnetPath, 'utf8'));
console.log(`Read ${tokens.length} tokens from mainnet.json`);

// Count tokens with logoURI
const tokensWithLogo = tokens.filter(token => 'logoURI' in token);
console.log(`Found ${tokensWithLogo.length} tokens with logoURI field`);

// Remove logoURI field from all tokens
const cleanedTokens = tokens.map(token => {
  const { logoURI, ...rest } = token;
  return rest;
});

// Write cleaned tokens back to the file
fs.writeFileSync(mainnetPath, JSON.stringify(cleanedTokens, null, 2));
console.log(`Removed logoURI field from all tokens and saved to ${mainnetPath}`);