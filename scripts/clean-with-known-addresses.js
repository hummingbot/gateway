#!/usr/bin/env node
/**
 * Clean token lists using known top token addresses
 */

const fs = require('fs-extra');
const path = require('path');

async function cleanTokenLists() {
  // Load known top token addresses
  const knownAddresses = await fs.readJson(path.join(__dirname, 'top200-addresses.json'));
  
  // Convert to Sets for fast lookup
  const validEthAddresses = new Set(Object.keys(knownAddresses.ethereum).map(a => a.toLowerCase()));
  const validSolAddresses = new Set(Object.keys(knownAddresses.solana));
  
  console.log(`Loaded ${validEthAddresses.size} Ethereum addresses`);
  console.log(`Loaded ${validSolAddresses.size} Solana addresses`);
  
  // Load current token lists
  const ethPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', 'mainnet.json');
  const solPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'solana', 'mainnet-beta.json');
  
  const ethTokens = await fs.readJson(ethPath);
  const solTokens = await fs.readJson(solPath);
  
  console.log(`\nCurrent Ethereum tokens: ${ethTokens.length}`);
  console.log(`Current Solana tokens: ${solTokens.length}`);
  
  // Filter tokens by address
  const filteredEth = ethTokens.filter(token => 
    validEthAddresses.has(token.address.toLowerCase())
  );
  
  const filteredSol = solTokens.filter(token => 
    validSolAddresses.has(token.address)
  );
  
  // Remove duplicates by creating a map by address
  const ethByAddress = new Map();
  filteredEth.forEach(token => {
    const addr = token.address.toLowerCase();
    if (!ethByAddress.has(addr)) {
      ethByAddress.set(addr, token);
    }
  });
  
  const solByAddress = new Map();
  filteredSol.forEach(token => {
    if (!solByAddress.has(token.address)) {
      solByAddress.set(token.address, token);
    }
  });
  
  // Convert back to arrays and sort
  const finalEth = Array.from(ethByAddress.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const finalSol = Array.from(solByAddress.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  console.log(`\nFiltered Ethereum tokens: ${finalEth.length} (removed ${ethTokens.length - finalEth.length})`);
  console.log(`Filtered Solana tokens: ${finalSol.length} (removed ${solTokens.length - finalSol.length})`);
  
  // Show what we're keeping
  console.log('\nEthereum tokens being kept:');
  finalEth.forEach(t => console.log(`  ${t.symbol} - ${t.address}`));
  
  console.log('\nSolana tokens being kept:');
  finalSol.forEach(t => console.log(`  ${t.symbol} - ${t.address}`));
  
  // Verify HBOT
  const hbot = finalEth.find(t => t.symbol === 'HBOT');
  console.log(`\nHBOT included: ${hbot ? '✅' : '❌'}`);
  
  // Save
  await fs.writeFile(ethPath, JSON.stringify(finalEth, null, 2) + '\n');
  await fs.writeFile(solPath, JSON.stringify(finalSol, null, 2) + '\n');
  
  console.log('\n✅ Token lists cleaned successfully!');
}

cleanTokenLists().catch(console.error);