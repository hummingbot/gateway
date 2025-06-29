#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('Testing fetch-swap-quote prompt...\n');

const mcpPath = path.join(__dirname, '../../src/mcp/index.ts');

// Test: List prompts
console.log('Test: Listing available prompts');
const listPrompts = spawn('npx', ['tsx', mcpPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

listPrompts.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  method: 'prompts/list',
  id: 1
}) + '\n');

let output = '';
listPrompts.stdout.on('data', (data) => {
  output += data.toString();
  try {
    const lines = output.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      if (line.includes('"jsonrpc"')) {
        const response = JSON.parse(line);
        if (response.result && response.result.prompts) {
          console.log(`\nFound ${response.result.prompts.length} prompts:`);
          response.result.prompts.forEach(prompt => {
            console.log(`- ${prompt.name}: ${prompt.description}`);
            console.log('  Arguments:');
            prompt.arguments.forEach(arg => {
              console.log(`    - ${arg.name}: ${arg.description} ${arg.required ? '(required)' : '(optional)'}`);
            });
          });
          
          // Test getting the prompt
          testGetPrompt();
        }
      }
    });
  } catch (e) {
    // Wait for more data
  }
});

listPrompts.stderr.on('data', (data) => {
  const msg = data.toString();
  if (!msg.includes('Gateway MCP server')) {
    console.error('Error:', msg);
  }
});

function testGetPrompt() {
  console.log('\n\nTest: Getting fetch-swap-quote prompt with partial arguments');
  const getPrompt = spawn('npx', ['tsx', mcpPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  getPrompt.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'prompts/get',
    params: {
      name: 'fetch-swap-quote',
      arguments: {
        chain: 'ethereum',
        inputToken: 'USDC',
        amount: '1000'
      }
    },
    id: 2
  }) + '\n');

  let promptOutput = '';
  getPrompt.stdout.on('data', (data) => {
    promptOutput += data.toString();
    try {
      const lines = promptOutput.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        if (line.includes('"jsonrpc"')) {
          const response = JSON.parse(line);
          if (response.result && response.result.messages) {
            console.log('\nPrompt retrieved successfully!');
            console.log('First 500 chars of prompt content:');
            const content = response.result.messages[0].content.text;
            console.log(content.substring(0, 500) + '...\n');
            
            console.log('✓ Prompt test passed!');
            console.log('\nThe fetch-swap-quote prompt:');
            console.log('- Uses elicitation to gather missing information');
            console.log('- Searches CoinGecko for token data');
            console.log('- Finds highest volume pools');
            console.log('- Gets swap quotes from the best pool');
            console.log('\nNote: Requires --with-coingecko flag to access CoinGecko tools');
            process.exit(0);
          }
        }
      });
    } catch (e) {
      // Wait for more data
    }
  });

  getPrompt.stderr.on('data', (data) => {
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