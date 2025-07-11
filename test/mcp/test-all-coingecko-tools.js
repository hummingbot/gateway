#!/usr/bin/env node

// Test script to fetch all CoinGecko tools in all tools mode
const { spawn } = require('child_process');

// Spawn the MCP server in all tools mode with CoinGecko
const mcp = spawn('node', ['dist/mcp/index.js', '--with-coingecko'], {
  env: {
    ...process.env,
    GATEWAY_URL: 'http://localhost:15888',
    COINGECKO_DEMO_API_KEY: process.env.COINGECKO_DEMO_API_KEY || 'CG-SDa3K5EePjwFqJcHph3KQnzh',
  },
});

let buffer = '';
let allTools = [];

mcp.stdout.on('data', (data) => {
  buffer += data.toString();

  // Try to parse complete JSON messages
  const lines = buffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const msg = JSON.parse(line);

        // Handle tool listing response
        if (msg.id === 1 && msg.result && msg.result.tools) {
          allTools = msg.result.tools;
          const coingeckoTools = allTools.filter((t) => t.name.startsWith('coingecko_'));
          const gatewayTools = allTools.filter((t) => !t.name.startsWith('coingecko_'));

          console.log(`Total tools: ${allTools.length}`);
          console.log(`Gateway tools: ${gatewayTools.length}`);
          console.log(`CoinGecko tools: ${coingeckoTools.length}`);

          // Write all CoinGecko tools to a JSON file
          require('fs').writeFileSync('coingecko-tools-full.json', JSON.stringify(coingeckoTools, null, 2));

          console.log('\nSaved all CoinGecko tools to coingecko-tools-full.json');
          process.exit(0);
        }

        if (msg.error) {
          console.error('Error:', msg.error.message);
          process.exit(1);
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
  // Log status messages to track progress
  if (message.includes('CoinGecko') || message.includes('tools')) {
    console.log('Status:', message.trim());
  }
});

// Send tool list command after server is ready
setTimeout(() => {
  console.log('Requesting tool list...');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
}, 5000); // Wait 5 seconds for server to fully initialize

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\nTest timed out');
  process.exit(1);
}, 30000);
