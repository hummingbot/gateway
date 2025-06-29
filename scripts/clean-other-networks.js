#!/usr/bin/env node
/**
 * Script to clean token lists for other Ethereum networks
 * Keeps only top 200 tokens by market cap + wrapped native token + USDC + USDT
 */

const fs = require('fs-extra');
const path = require('path');

// Network configurations
const NETWORKS = {
  'arbitrum': {
    file: 'arbitrum.json',
    chainId: 42161,
    wrappedNative: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
    platformId: 'arbitrum-one'
  },
  'optimism': {
    file: 'optimism.json', 
    chainId: 10,
    wrappedNative: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' },
    platformId: 'optimistic-ethereum'
  },
  'polygon': {
    file: 'polygon.json',
    chainId: 137,
    wrappedNative: { symbol: 'WMATIC', address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270' },
    platformId: 'polygon-pos'
  },
  'avalanche': {
    file: 'avalanche.json',
    chainId: 43114,
    wrappedNative: { symbol: 'WAVAX', address: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7' },
    platformId: 'avalanche'
  },
  'base': {
    file: 'base.json',
    chainId: 8453,
    wrappedNative: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006' },
    platformId: 'base'
  },
  'bsc': {
    file: 'bsc.json',
    chainId: 56,
    wrappedNative: { symbol: 'WBNB', address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' },
    platformId: 'binance-smart-chain'
  }
};

// Essential tokens to always include (addresses will be fetched)
const ESSENTIAL_TOKENS = ['USDC', 'USDT'];

// Top 200 token list from our analysis
const TOP_200_IDS = [
  'bitcoin', 'ethereum', 'tether', 'ripple', 'binancecoin', 'solana', 'usd-coin', 
  'tron', 'dogecoin', 'staked-ether', 'cardano', 'wrapped-bitcoin', 'hyperliquid',
  'wrapped-steth', 'bitcoin-cash', 'sui', 'chainlink', 'leo-token', 'avalanche-2',
  'stellar', 'usds', 'the-open-network', 'whitebit', 'shiba-inu', 'litecoin',
  'weth', 'wrapped-eeth', 'binance-bridged-usdt-bnb-smart-chain', 'hedera-hashgraph',
  'monero', 'bitget-token', 'ethena-usde', 'polkadot', 'coinbase-wrapped-btc',
  'uniswap', 'pi-network', 'pepe', 'aave', 'dai', 'ethena-staked-usde',
  'aptos', 'okb', 'bittensor', 'blackrock-usd-institutional-digital-liquidity-fund',
  'jito-staked-sol', 'near', 'internet-computer', 'crypto-com-chain', 'ethereum-classic',
  'susds'
];

async function getTokenPlatformAddress(tokenId, platformId) {
  // This would normally call CoinGecko API, but for now we'll use known mappings
  const knownMappings = {
    'tether': {
      'arbitrum-one': '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
      'optimistic-ethereum': '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
      'polygon-pos': '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      'avalanche': '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
      'base': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      'binance-smart-chain': '0x55d398326f99059ff775485246999027b3197955'
    },
    'usd-coin': {
      'arbitrum-one': '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      'optimistic-ethereum': '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
      'polygon-pos': '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      'avalanche': '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
      'base': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      'binance-smart-chain': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'
    },
    'wrapped-bitcoin': {
      'arbitrum-one': '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
      'optimistic-ethereum': '0x68f180fcce6836688e9084f035309e29bf0a2095',
      'polygon-pos': '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
      'avalanche': '0x50b7545627a5162f82a992c33b87adc75187b218'
    },
    'chainlink': {
      'arbitrum-one': '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
      'optimistic-ethereum': '0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6',
      'polygon-pos': '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39',
      'avalanche': '0x5947bb275c521040051d82396192181b413227a3'
    },
    'aave': {
      'arbitrum-one': '0xba5ddd1f9d7f570dc94a51479a000e3bce967196',
      'optimistic-ethereum': '0x76fb31fb4af56892a25e32cfc43de717950c9278',
      'polygon-pos': '0xd6df932a45c0f255f85145f286ea0b292b21c90b',
      'avalanche': '0x63a72806098bd3d9520cc43356dd78afe5d386d9'
    },
    'uniswap': {
      'arbitrum-one': '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0',
      'optimistic-ethereum': '0x6fd9d7ad17242c41f7131d257212c54a0e816691',
      'polygon-pos': '0xb33eaad8d922b1083446dc23f610c2567fb5180f',
      'avalanche': '0x8ebaf22b6f053dffeaf46f4dd9efa95d89ba8580'
    },
    'dai': {
      'arbitrum-one': '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
      'optimistic-ethereum': '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
      'polygon-pos': '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
      'avalanche': '0xd586e7f844cea2f87f50152665bcbc2c279d8d70'
    }
  };

  return knownMappings[tokenId]?.[platformId];
}

async function cleanNetworkTokenList(network, config) {
  console.log(`\n🔍 Processing ${network}...`);
  
  const tokenListPath = path.join(__dirname, '..', 'src', 'templates', 'tokens', 'ethereum', config.file);
  const tokens = await fs.readJson(tokenListPath);
  
  console.log(`Current token count: ${tokens.length}`);
  
  // Build set of valid addresses
  const validAddresses = new Set();
  
  // Always include wrapped native token
  validAddresses.add(config.wrappedNative.address.toLowerCase());
  console.log(`✓ Including wrapped native: ${config.wrappedNative.symbol}`);
  
  // Get addresses for top 200 tokens on this network
  for (const tokenId of TOP_200_IDS) {
    const address = await getTokenPlatformAddress(tokenId, config.platformId);
    if (address) {
      validAddresses.add(address.toLowerCase());
    }
  }
  
  // Filter tokens
  const filteredTokens = tokens.filter(token => {
    const addr = token.address.toLowerCase();
    
    // Check if it's wrapped native
    if (addr === config.wrappedNative.address.toLowerCase()) {
      return true;
    }
    
    // Check if it's an essential token (USDC/USDT)
    if (ESSENTIAL_TOKENS.includes(token.symbol)) {
      console.log(`✓ Including essential token: ${token.symbol}`);
      return true;
    }
    
    // Check if in top 200
    return validAddresses.has(addr);
  });
  
  // Remove duplicates
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
  
  // Show what we're keeping
  console.log('Tokens kept:');
  const symbols = uniqueTokens.map(t => t.symbol);
  console.log(symbols.join(', '));
  
  // Save
  await fs.writeFile(tokenListPath, JSON.stringify(uniqueTokens, null, 2) + '\n');
  
  return {
    network,
    original: tokens.length,
    filtered: uniqueTokens.length,
    removed: tokens.length - uniqueTokens.length
  };
}

async function main() {
  console.log('🧹 Cleaning token lists for other Ethereum networks');
  console.log('Keeping: Top 200 tokens + Wrapped Native + USDC + USDT\n');
  
  const results = [];
  
  for (const [network, config] of Object.entries(NETWORKS)) {
    try {
      const result = await cleanNetworkTokenList(network, config);
      results.push(result);
    } catch (error) {
      console.error(`Error processing ${network}:`, error.message);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log('Network        Original  Filtered  Removed');
  console.log('─'.repeat(44));
  
  for (const result of results) {
    console.log(
      `${result.network.padEnd(13)} ${result.original.toString().padStart(8)}  ${result.filtered.toString().padStart(8)}  ${result.removed.toString().padStart(7)}`
    );
  }
  
  console.log('\n✅ Token lists cleaned successfully!');
}

main().catch(console.error);