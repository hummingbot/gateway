#!/usr/bin/env node

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testApiResources() {
  console.log('Testing Gateway MCP API Resources...\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./dist/mcp/index.js', '--tools=dynamic'],
    env: {
      ...process.env,
      GATEWAY_URL: 'http://localhost:15888',
    },
  });

  const client = new Client(
    {
      name: 'api-resources-test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport);
    console.log('✓ Connected to Gateway MCP server\n');

    // List all resources
    console.log('=== Listing All Resources ===');
    const resources = await client.listResources();

    // Find API endpoint resources
    const gatewayEndpoints = resources.resources.find((r) => r.uri === 'gateway://api-endpoints');
    const coinGeckoEndpoints = resources.resources.find((r) => r.uri === 'coingecko://api-endpoints');

    console.log('\nAPI Endpoint Resources:');
    if (gatewayEndpoints) {
      console.log(`  ✓ ${gatewayEndpoints.name}`);
    }
    if (coinGeckoEndpoints) {
      console.log(`  ✓ ${coinGeckoEndpoints.name}`);
    }

    // Test reading a Gateway endpoint resource
    if (gatewayEndpoints) {
      console.log('\n=== Reading Gateway API Endpoints ===');
      const allGatewayEndpoints = await client.readResource('gateway://api-endpoints');

      const data = JSON.parse(allGatewayEndpoints.contents[0].text);
      const categories = Object.keys(data);
      let totalEndpoints = 0;
      categories.forEach((cat) => (totalEndpoints += data[cat].endpoints.length));

      console.log(`Categories: ${categories.length}`);
      console.log(`Total endpoints: ${totalEndpoints}`);
      console.log('Sample endpoints by category:');
      categories.slice(0, 3).forEach((cat) => {
        console.log(`  ${cat}: ${data[cat].endpoints.length} endpoints`);
        if (data[cat].endpoints[0]) {
          const ep = data[cat].endpoints[0];
          console.log(`    - ${ep.method} ${ep.path}: ${ep.description}`);
        }
      });
    }

    // Test reading a CoinGecko endpoint resource
    if (coinGeckoEndpoints) {
      console.log('\n=== Reading CoinGecko API Endpoints ===');
      const coinsEndpoints = await client.readResource('coingecko://api-endpoints');

      const data = JSON.parse(coinsEndpoints.contents[0].text);
      const categories = Object.keys(data);
      let totalEndpoints = 0;
      categories.forEach((cat) => (totalEndpoints += data[cat].endpoints.length));

      console.log(`Categories: ${categories.length}`);
      console.log(`Total endpoints: ${totalEndpoints}`);
      console.log('Sample endpoints by category:');
      categories.slice(0, 3).forEach((cat) => {
        console.log(`  ${cat}: ${data[cat].endpoints.length} endpoints`);
        if (data[cat].endpoints[0]) {
          const ep = data[cat].endpoints[0];
          console.log(`    - ${ep.name}: ${ep.description}`);
        }
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await transport.close();
    console.log('\n✓ Test completed');
  }
}

// Run the test
testApiResources().catch(console.error);
