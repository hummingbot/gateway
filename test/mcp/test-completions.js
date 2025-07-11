#!/usr/bin/env node

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testCompletions() {
  console.log('Testing Gateway MCP Completions...\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./dist/mcp/index.js'],
    env: {
      ...process.env,
      GATEWAY_URL: 'http://localhost:15888',
    },
  });

  const client = new Client(
    {
      name: 'completions-test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport);
    console.log('✓ Connected to Gateway MCP server\n');

    // Test chain completions for gas_optimizer
    console.log('=== Testing Chain Completions ===');
    const chainCompletions = await client.complete({
      ref: {
        type: 'ref/prompt',
        name: 'gas_optimizer',
      },
      argument: {
        name: 'chain',
        value: 'eth', // Partial value
      },
    });

    console.log("Input: 'eth'");
    console.log('Completions:', chainCompletions.completion.values);
    console.log();

    // Test network completions
    console.log('=== Testing Network Completions ===');
    const networkCompletions = await client.complete({
      ref: {
        type: 'ref/prompt',
        name: 'gas_optimizer',
      },
      argument: {
        name: 'network',
        value: 'main', // Partial value
      },
    });

    console.log("Input: 'main'");
    console.log('Completions:', networkCompletions.completion.values);
    console.log();

    // Test transaction type completions
    console.log('=== Testing Transaction Type Completions ===');
    const txTypeCompletions = await client.complete({
      ref: {
        type: 'ref/prompt',
        name: 'gas_optimizer',
      },
      argument: {
        name: 'transactionType',
        value: 'sw', // Partial value
      },
    });

    console.log("Input: 'sw'");
    console.log('Completions:', txTypeCompletions.completion.values);
    console.log();

    // Test chains completions for portfolio_analyzer (comma-separated)
    console.log('=== Testing Comma-Separated Chains Completions ===');
    const chainsCompletions = await client.complete({
      ref: {
        type: 'ref/prompt',
        name: 'portfolio_analyzer',
      },
      argument: {
        name: 'chains',
        value: 'ethereum, sol', // Partial value with comma
      },
    });

    console.log("Input: 'ethereum, sol'");
    console.log('Completions:', chainsCompletions.completion.values);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await transport.close();
    console.log('\n✓ Test completed');
  }
}

// Run the test
testCompletions().catch(console.error);
