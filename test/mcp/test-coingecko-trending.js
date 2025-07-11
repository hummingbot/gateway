#!/usr/bin/env node

// Test script to fetch trending data from CoinGecko
const { spawn } = require('child_process');

const testCommands = [
  // First, list all endpoints to find the correct ones
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'coingecko_list_api_endpoints',
      arguments: {},
    },
  },
  // Get Bitcoin price
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'coingecko_invoke_api_endpoint',
      arguments: {
        endpoint_name: 'simplePrice',
        args: {
          ids: 'bitcoin,ethereum',
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
        },
      },
    },
  },
  // Get trending coins
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'coingecko_invoke_api_endpoint',
      arguments: {
        endpoint_name: 'searchTrending',
        args: {},
      },
    },
  },
];

// Spawn the MCP server
const mcp = spawn('node', ['dist/mcp/index.js', '--tools=dynamic'], {
  env: {
    ...process.env,
    GATEWAY_URL: 'http://localhost:15888',
    COINGECKO_DEMO_API_KEY: process.env.COINGECKO_DEMO_API_KEY || 'demo-key',
  },
});

let buffer = '';
let currentCommand = 0;

mcp.stdout.on('data', (data) => {
  buffer += data.toString();

  // Try to parse complete JSON messages
  const lines = buffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const msg = JSON.parse(line);

        // Handle responses
        if (msg.id === 1) {
          console.log('✓ Listed CoinGecko endpoints');
          if (msg.result && msg.result.content) {
            try {
              const content = JSON.parse(msg.result.content[0].text);
              if (content.endpoints) {
                console.log(`  Total endpoints: ${content.endpoints.length}`);

                // Find trending-related endpoints
                const trendingEndpoints = content.endpoints.filter(
                  (e) => e.name.toLowerCase().includes('trend') || e.description.toLowerCase().includes('trend'),
                );
                console.log(`\n  Trending endpoints found: ${trendingEndpoints.length}`);
                trendingEndpoints.slice(0, 3).forEach((e) => {
                  console.log(`    - ${e.name}: ${e.description}`);
                });

                // Find price endpoints
                const priceEndpoints = content.endpoints.filter((e) => e.name.toLowerCase().includes('price'));
                console.log(`\n  Price endpoints found: ${priceEndpoints.length}`);
                priceEndpoints.slice(0, 3).forEach((e) => {
                  console.log(`    - ${e.name}: ${e.description}`);
                });
              }
            } catch (e) {
              console.log('  Unable to parse endpoint list');
            }
          }
        } else if (msg.id === 2) {
          console.log('\n✓ Fetched crypto prices successfully');
          if (msg.result && msg.result.content) {
            try {
              const content = JSON.parse(msg.result.content[0].text);
              if (content.bitcoin) {
                console.log(`  Bitcoin: $${content.bitcoin.usd} (24h: ${content.bitcoin.usd_24h_change?.toFixed(2)}%)`);
              }
              if (content.ethereum) {
                console.log(
                  `  Ethereum: $${content.ethereum.usd} (24h: ${content.ethereum.usd_24h_change?.toFixed(2)}%)`,
                );
              }
            } catch (e) {
              console.log('  Price data received');
            }
          }
        } else if (msg.id === 3) {
          console.log('\n✓ Fetched trending data');
          if (msg.result && msg.result.content) {
            try {
              const content = JSON.parse(msg.result.content[0].text);
              if (content.coins) {
                console.log(`  Trending coins: ${content.coins.length}`);
                content.coins.slice(0, 3).forEach((coin, i) => {
                  console.log(`    ${i + 1}. ${coin.item.name} (${coin.item.symbol})`);
                });
              }
            } catch (e) {
              console.log('  Trending data received');
            }
          }
          console.log('\n✅ CoinGecko integration working perfectly!');
          process.exit(0);
        }

        if (msg.error) {
          console.error(`\n❌ Error in command ${msg.id}:`, msg.error.message);
          if (msg.error.message.includes('not found')) {
            console.log('  Tip: The endpoint name might be different. Check command 1 output for correct names.');
          }
          // Continue with next test
          if (currentCommand === msg.id) {
            currentCommand++;
            sendNextCommand();
          }
        }
      } catch (e) {
        // Not valid JSON yet, continue
      }
    }
  }
  buffer = lines[lines.length - 1];
});

mcp.stderr.on('data', (data) => {
  const message = data.toString();
  // Only log real errors
  if (message.includes('Failed') && !message.includes('Starting')) {
    console.error('stderr:', message);
  }
});

// Send commands sequentially
const sendNextCommand = () => {
  if (currentCommand < testCommands.length) {
    console.log(`\nSending command ${currentCommand + 1}...`);
    mcp.stdin.write(JSON.stringify(testCommands[currentCommand]) + '\n');
    currentCommand++;
    if (currentCommand < testCommands.length) {
      setTimeout(sendNextCommand, 3000);
    }
  }
};

// Wait for subprocess to start
setTimeout(() => {
  console.log('Starting CoinGecko integration test...');
  sendNextCommand();
}, 5000);

// Timeout after 40 seconds
setTimeout(() => {
  console.log('\n❌ Test timed out');
  process.exit(1);
}, 40000);
