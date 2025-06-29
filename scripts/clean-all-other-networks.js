#!/usr/bin/env node
/**
 * Script to clean token lists for all other Ethereum networks
 * Keeps only tokens that are in top 200 by market cap
 * Always includes: wrapped native token, USDC, USDT
 */

const fs = require('fs-extra');
const path = require('path');

// Top 200 tokens we identified
const TOP_200_SYMBOLS = new Set([
  'BTC', 'ETH', 'USDT', 'XRP', 'BNB', 'SOL', 'USDC', 'TRX', 'DOGE', 'STETH',
  'ADA', 'WBTC', 'HYPE', 'WSTETH', 'BCH', 'SUI', 'LINK', 'LEO', 'AVAX', 'XLM',
  'USDS', 'TON', 'WBT', 'SHIB', 'LTC', 'WETH', 'WEETH', 'BSC-USD', 'HBAR', 'XMR',
  'BGB', 'USDE', 'DOT', 'CBBTC', 'UNI', 'PI', 'PEPE', 'AAVE', 'DAI', 'SUSDE',
  'APT', 'OKB', 'TAO', 'BUIDL', 'JITOSOL', 'NEAR', 'ICP', 'CRO', 'ETC', 'SUSDS',
  'ARB', 'FIL', 'VEN', 'OP', 'IMX', 'INJ', 'WLD', 'BGT', 'KASPA', 'PYUSD',
  'RUNE', 'ATOM', 'FET', 'MNT', 'VIRTUAL', 'FTM', 'ONDO', 'SEI', 'RENDER', 'GRT',
  'KAS', 'AKT', 'TIA', 'FLOKI', 'BONK', 'HBAR', 'TAO', 'JASMY', 'ENS', 'FDUSD',
  'QNT', 'ENA', 'STX', 'BEAM', 'MKR', 'SAND', 'MANA', 'APE', 'AXS', 'ALGO',
  'GALA', 'FLOW', 'EOS', 'BSV', 'BTT', 'CFX', 'ZEC', 'XTZ', 'ASTR', 'CHZ',
  'EGLD', 'NEO', 'TFUEL', 'KAVA', 'MINA', 'HNT', 'IOTA', 'XDC', 'LDO', 'CRV',
  'SNX', 'COMP', 'SUSHI', 'BAL', 'YFI', '1INCH', 'ENJ', 'ZRX', 'BAT', 'MATIC'
]);

// Essential tokens to always include
const ESSENTIAL_TOKENS = new Set(['USDC', 'USDT']);

// Network configurations
const NETWORKS = {
  'arbitrum': {
    file: 'arbitrum.json',
    wrappedNative: 'WETH',
    nativeSymbol: 'ETH'
  },
  'optimism': {
    file: 'optimism.json',
    wrappedNative: 'WETH',
    nativeSymbol: 'ETH'
  },
  'polygon': {
    file: 'polygon.json',
    wrappedNative: 'WMATIC',
    nativeSymbol: 'MATIC'
  },
  'avalanche': {
    file: 'avalanche.json',
    wrappedNative: 'WAVAX',
    nativeSymbol: 'AVAX'
  },
  'base': {
    file: 'base.json',
    wrappedNative: 'WETH',
    nativeSymbol: 'ETH'
  },
  'bsc': {
    file: 'bsc.json',
    wrappedNative: 'WBNB',
    nativeSymbol: 'BNB'
  },
  'celo': {
    file: 'celo.json',
    wrappedNative: 'WCELO',
    nativeSymbol: 'CELO'
  }
};

async function cleanNetworkTokens(network, config) {
  console.log(`\n🔍 Processing ${network}...`);
  
  const tokenListPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', config.file);
  const tokens = await fs.readJson(tokenListPath);
  
  console.log(`Current token count: ${tokens.length}`);
  
  // Filter tokens
  const filteredTokens = tokens.filter(token => {
    const symbol = token.symbol.toUpperCase();
    
    // Always include wrapped native token
    if (symbol === config.wrappedNative.toUpperCase()) {
      return true;
    }
    
    // Always include essential tokens (USDC, USDT)
    if (ESSENTIAL_TOKENS.has(symbol)) {
      return true;
    }
    
    // Include if in top 200
    if (TOP_200_SYMBOLS.has(symbol)) {
      return true;
    }
    
    // Special case: include native token representations
    if (symbol === config.nativeSymbol.toUpperCase()) {
      return true;
    }
    
    return false;
  });
  
  // Remove duplicates by address
  const uniqueTokens = [];
  const seenAddresses = new Set();
  
  for (const token of filteredTokens) {
    const addr = token.address.toLowerCase();
    if (!seenAddresses.has(addr)) {
      seenAddresses.add(addr);
      uniqueTokens.push(token);
    }
  }
  
  // Sort by symbol
  uniqueTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
  
  console.log(`Filtered to ${uniqueTokens.length} tokens (removed ${tokens.length - uniqueTokens.length})`);
  
  // Ensure we have wrapped native, USDC, and USDT
  const hasWrappedNative = uniqueTokens.some(t => t.symbol.toUpperCase() === config.wrappedNative.toUpperCase());
  const hasUSDC = uniqueTokens.some(t => t.symbol === 'USDC');
  const hasUSDT = uniqueTokens.some(t => t.symbol === 'USDT');
  
  console.log(`✓ Wrapped native (${config.wrappedNative}): ${hasWrappedNative ? 'Yes' : 'No'}`);
  console.log(`✓ USDC: ${hasUSDC ? 'Yes' : 'No'}`);
  console.log(`✓ USDT: ${hasUSDT ? 'Yes' : 'No'}`);
  
  // Show tokens kept
  const symbols = uniqueTokens.map(t => t.symbol);
  console.log(`Tokens kept (${symbols.length}): ${symbols.slice(0, 20).join(', ')}${symbols.length > 20 ? '...' : ''}`);
  
  // Save
  await fs.writeFile(tokenListPath, JSON.stringify(uniqueTokens, null, 2) + '\n');
  
  return {
    network,
    original: tokens.length,
    filtered: uniqueTokens.length,
    removed: tokens.length - uniqueTokens.length,
    hasEssentials: hasWrappedNative && hasUSDC && hasUSDT
  };
}

async function main() {
  console.log('🧹 Cleaning token lists for other Ethereum networks');
  console.log('Keeping: Top 200 tokens by market cap + Wrapped Native + USDC + USDT\n');
  
  const results = [];
  
  for (const [network, config] of Object.entries(NETWORKS)) {
    try {
      const result = await cleanNetworkTokens(network, config);
      results.push(result);
    } catch (error) {
      console.error(`Error processing ${network}:`, error.message);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log('Network        Original  Filtered  Removed  Essentials');
  console.log('─'.repeat(56));
  
  for (const result of results) {
    console.log(
      `${result.network.padEnd(13)} ${result.original.toString().padStart(8)}  ${result.filtered.toString().padStart(8)}  ${result.removed.toString().padStart(7)}  ${result.hasEssentials ? '✓' : '✗'}`
    );
  }
  
  console.log('\n✅ Token lists cleaned successfully!');
}

main().catch(console.error);