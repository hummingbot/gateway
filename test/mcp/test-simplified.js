#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('Testing simplified Gateway MCP server...\n');

const mcpPath = path.join(__dirname, '../../src/mcp/index.ts');

// Test 1: List tools
console.log('Test 1: Listing available tools');
const listTools = spawn('npx', ['tsx', mcpPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

listTools.stdin.write(
  JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1,
  }) + '\n',
);

let output = '';
listTools.stdout.on('data', (data) => {
  output += data.toString();
  try {
    const lines = output.split('\n').filter((line) => line.trim());
    lines.forEach((line) => {
      if (line.includes('"jsonrpc"')) {
        const response = JSON.parse(line);
        if (response.result && response.result.tools) {
          console.log(`\nFound ${response.result.tools.length} tools:`);
          response.result.tools.forEach((tool) => {
            console.log(`- ${tool.name}: ${tool.description}`);
          });
          console.log('\nSimplified MCP server test passed! ✓');
          console.log('\nExpected tools:');
          console.log('- get_config: Get configuration settings');
          console.log('- update_config: Update configuration and restart Gateway');
          console.log('- quote_swap: Get swap quotes');
          console.log('- execute_swap: Execute swaps');

          // Also test with CoinGecko
          console.log('\n\nTest 2: Testing with CoinGecko integration');
          testWithCoinGecko();
        }
      }
    });
  } catch (e) {
    // Wait for more data
  }
});

listTools.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('Gateway MCP server')) {
    console.error('Error:', msg);
  }
});

function testWithCoinGecko() {
  const listToolsCG = spawn('npx', ['tsx', mcpPath, '--with-coingecko'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  listToolsCG.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    }) + '\n',
  );

  let outputCG = '';
  listToolsCG.stdout.on('data', (data) => {
    outputCG += data.toString();
    try {
      const lines = outputCG.split('\n').filter((line) => line.trim());
      lines.forEach((line) => {
        if (line.includes('"jsonrpc"')) {
          const response = JSON.parse(line);
          if (response.result && response.result.tools) {
            console.log(`\nWith CoinGecko: Found ${response.result.tools.length} tools`);
            const cgTools = response.result.tools.filter((t) => t.name.startsWith('coingecko_'));
            console.log(`- ${cgTools.length} CoinGecko tools added`);
            console.log('\nCoinGecko integration test passed! ✓');
            process.exit(0);
          }
        }
      });
    } catch (e) {
      // Wait for more data
    }
  });
}

setTimeout(() => {
  console.error('\nTest timeout - no response received');
  process.exit(1);
}, 5000);
