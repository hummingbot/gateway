#!/usr/bin/env node

// Test script to verify dynamic tools
const { spawn } = require('child_process');

const testCommands = [
  { jsonrpc: "2.0", id: 1, method: "tools/list" },
];

// Check if --with-coingecko flag is passed
const withCoinGecko = process.argv.includes('--with-coingecko');
const args = ['dist/mcp/index.js', '--tools=dynamic'];
if (withCoinGecko) {
  args.push('--with-coingecko');
}

// Spawn the MCP server
const mcp = spawn('node', args, {
  env: {
    ...process.env,
    GATEWAY_URL: 'http://localhost:15888',
    COINGECKO_DEMO_API_KEY: process.env.COINGECKO_DEMO_API_KEY || 'demo-key'
  }
});

let buffer = '';

mcp.stdout.on('data', (data) => {
  buffer += data.toString();
  
  // Try to parse complete JSON messages
  const lines = buffer.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const msg = JSON.parse(line);
        if (msg.result && msg.result.tools) {
          console.log('\nAvailable tools:');
          msg.result.tools.forEach(tool => {
            console.log(`- ${tool.name}`);
          });
          console.log(`\nTotal: ${msg.result.tools.length} tools`);
          
          const gatewayTools = msg.result.tools.filter(t => t.name.startsWith('gateway_'));
          const coingeckoTools = msg.result.tools.filter(t => t.name.startsWith('coingecko_'));
          
          console.log(`Gateway tools: ${gatewayTools.length}`);
          console.log(`CoinGecko tools: ${coingeckoTools.length}`);
          
          const expectedTools = withCoinGecko ? 6 : 3;
          if (msg.result.tools.length === expectedTools) {
            console.log(`\n✅ Dynamic mode working correctly! (${expectedTools} tools as expected)`);
          } else {
            console.log(`\n❌ Unexpected number of tools (expected ${expectedTools})`);
          }
          
          process.exit(0);
        }
      } catch (e) {
        // Not valid JSON yet, continue
      }
    }
  }
  buffer = lines[lines.length - 1];
});

mcp.stderr.on('data', (data) => {
  // Log stderr but don't exit on it
  const message = data.toString();
  if (message.includes('error') || message.includes('Error')) {
    console.error('stderr:', message);
  }
});

// Send the test command
setTimeout(() => {
  mcp.stdin.write(JSON.stringify(testCommands[0]) + '\n');
}, 1000);

// Timeout after 5 seconds
setTimeout(() => {
  console.log('Test timed out');
  process.exit(1);
}, 5000);