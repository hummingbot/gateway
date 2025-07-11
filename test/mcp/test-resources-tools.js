#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('Testing Gateway MCP server with resources and tools...\n');

const mcpPath = path.join(__dirname, '../../src/mcp/index.ts');

// Test 1: List resources
console.log('Test 1: Listing available resources');
const listResources = spawn('npx', ['tsx', mcpPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

listResources.stdin.write(
  JSON.stringify({
    jsonrpc: '2.0',
    method: 'resources/list',
    id: 1,
  }) + '\n',
);

let resourceOutput = '';
listResources.stdout.on('data', (data) => {
  resourceOutput += data.toString();
  try {
    const lines = resourceOutput.split('\n').filter((line) => line.trim());
    lines.forEach((line) => {
      if (line.includes('"jsonrpc"')) {
        const response = JSON.parse(line);
        if (response.result && response.result.resources) {
          console.log(`\nFound ${response.result.resources.length} resources:`);
          response.result.resources.forEach((resource) => {
            console.log(`- ${resource.uri}: ${resource.description}`);
          });

          // Test 2: List tools
          testTools();
        }
      }
    });
  } catch (e) {
    // Wait for more data
  }
});

listResources.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('Gateway MCP server')) {
    console.error('Error:', msg);
  }
});

function testTools() {
  console.log('\n\nTest 2: Listing available tools');
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

  let toolOutput = '';
  listTools.stdout.on('data', (data) => {
    toolOutput += data.toString();
    try {
      const lines = toolOutput.split('\n').filter((line) => line.trim());
      lines.forEach((line) => {
        if (line.includes('"jsonrpc"')) {
          const response = JSON.parse(line);
          if (response.result && response.result.tools) {
            console.log(`\nFound ${response.result.tools.length} tools:`);
            response.result.tools.forEach((tool) => {
              console.log(`- ${tool.name}: ${tool.description}`);
            });

            console.log('\n✓ Resources and tools test passed!');
            console.log('\nArchitecture:');
            console.log('- Resources handle all READ operations (configs, tokens, wallets)');
            console.log('- Tools handle all WRITE operations (updates)');
            console.log('- Clean separation of concerns with minimal permissions needed');
            process.exit(0);
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
}

setTimeout(() => {
  console.error('\nTest timeout - no response received');
  process.exit(1);
}, 5000);
