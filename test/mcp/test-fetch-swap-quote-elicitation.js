#!/usr/bin/env node

// Test script to demonstrate elicitation behavior in fetch-swap-quote prompt
const { spawn } = require('child_process');

async function testPrompt(args = {}) {
  const mcp = spawn('node', ['dist/mcp/index.js', '--with-coingecko'], {
    env: {
      ...process.env,
      GATEWAY_URL: 'http://localhost:15888',
      COINGECKO_DEMO_API_KEY: process.env.COINGECKO_DEMO_API_KEY || 'demo-key',
    },
  });

  return new Promise((resolve) => {
    let buffer = '';
    
    mcp.stdout.on('data', (data) => {
      buffer += data.toString();
      
      const lines = buffer.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const msg = JSON.parse(line);
            if (msg.result && msg.result.messages) {
              resolve(msg.result);
              mcp.kill();
              return;
            }
          } catch (e) {
            // Not valid JSON yet
          }
        }
      }
      buffer = lines[lines.length - 1];
    });
    
    // Send the get prompt request
    setTimeout(() => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'prompts/get',
        params: {
          name: 'fetch-swap-quote',
          arguments: args
        }
      };
      mcp.stdin.write(JSON.stringify(request) + '\n');
    }, 1000);
    
    // Timeout
    setTimeout(() => {
      mcp.kill();
      resolve(null);
    }, 5000);
  });
}

async function runTests() {
  console.log('Testing fetch-swap-quote elicitation behavior\n');
  
  // Test 1: No arguments (full elicitation)
  console.log('Test 1: No arguments provided');
  console.log('Expected: Assistant asks for all 5 pieces of information\n');
  const result1 = await testPrompt({});
  if (result1 && result1.messages[0]) {
    console.log('Role:', result1.messages[0].role);
    console.log('Content:', result1.messages[0].content.text);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test 2: Partial arguments (partial elicitation)
  console.log('Test 2: Partial arguments (chain, inputToken, amount)');
  console.log('Expected: Assistant asks for outputToken and wallet\n');
  const result2 = await testPrompt({
    chain: 'ethereum',
    inputToken: 'USDC',
    amount: '1000'
  });
  if (result2 && result2.messages[0]) {
    console.log('Role:', result2.messages[0].role);
    console.log('Content:', result2.messages[0].content.text.substring(0, 500) + '...');
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  // Test 3: All arguments (no elicitation, proceed with workflow)
  console.log('Test 3: All arguments provided');
  console.log('Expected: User message with full workflow instructions\n');
  const result3 = await testPrompt({
    chain: 'ethereum',
    inputToken: 'USDC',
    outputToken: 'DAI',
    amount: '1000',
    wallet: '0x1234567890123456789012345678901234567890'
  });
  if (result3 && result3.messages[0]) {
    console.log('Role:', result3.messages[0].role);
    console.log('First 500 chars:', result3.messages[0].content.text.substring(0, 500) + '...');
  }
  
  console.log('\nElicitation test complete!');
  process.exit(0);
}

runTests();