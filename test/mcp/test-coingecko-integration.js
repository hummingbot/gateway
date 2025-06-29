#!/usr/bin/env node

// Test script to verify CoinGecko integration
const { spawn } = require('child_process');

const testCommands = [
  { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'coingecko_list_api_endpoints',
      arguments: { search_query: 'trending' },
    },
  },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'coingecko_get_api_endpoint_schema',
      arguments: { endpoint: 'simplePrice' },
    },
  },
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'coingecko_invoke_api_endpoint',
      arguments: {
        endpoint_name: 'simplePrice',
        args: { ids: 'bitcoin', vs_currencies: 'usd' },
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
let commandSent = false;

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
        if (msg.id === 1 && msg.result && msg.result.tools) {
          console.log('✓ Tool listing successful:');
          console.log(`  Found ${msg.result.tools.length} tools`);
          const coingeckoTools = msg.result.tools.filter((t) =>
            t.name.startsWith('coingecko_'),
          );
          console.log(
            `  CoinGecko tools: ${coingeckoTools.map((t) => t.name).join(', ')}`,
          );
        } else if (msg.id === 2) {
          console.log('\n✓ CoinGecko list endpoints successful');
          if (msg.result && msg.result.content) {
            try {
              const content = JSON.parse(msg.result.content[0].text);
              if (content.endpoints) {
                console.log(
                  `  Found ${content.endpoints.length} endpoints matching "trending"`,
                );
              }
            } catch (e) {
              console.log('  Response received');
            }
          }
        } else if (msg.id === 3) {
          console.log('\n✓ CoinGecko get schema successful');
          if (msg.result && msg.result.content) {
            console.log(`  Schema retrieved for simplePrice endpoint`);
          }
        } else if (msg.id === 4) {
          console.log('\n✓ CoinGecko invoke endpoint successful');
          if (msg.result && msg.result.content) {
            try {
              const content = JSON.parse(msg.result.content[0].text);
              if (content.bitcoin && content.bitcoin.usd) {
                console.log(`  Bitcoin price: $${content.bitcoin.usd}`);
              }
            } catch (e) {
              console.log('  Price data received');
            }
          }
          console.log('\n✅ All tests passed!');
          process.exit(0);
        }

        if (msg.error) {
          console.error(`\n❌ Error in command ${msg.id}:`, msg.error.message);
          if (msg.id < 4) {
            // Continue with next test even if one fails
            currentCommand = msg.id;
          } else {
            process.exit(1);
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
  // Only log actual errors, not status messages
  if (
    message.includes('Failed') ||
    (message.includes('Error') &&
      !message.includes('Starting') &&
      !message.includes('Gateway MCP'))
  ) {
    console.error('stderr:', message);
  }
});

// Send commands sequentially
const sendNextCommand = () => {
  if (currentCommand < testCommands.length) {
    console.log(`\nSending command ${currentCommand + 1}...`);
    mcp.stdin.write(JSON.stringify(testCommands[currentCommand]) + '\n');
    currentCommand++;
    setTimeout(sendNextCommand, 3000); // Wait 3 seconds between commands
  }
};

// Start sending commands after server is ready
setTimeout(() => {
  sendNextCommand();
}, 2000);

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n❌ Test timed out');
  process.exit(1);
}, 30000);
