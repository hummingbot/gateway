const { spawn } = require('child_process');
const axios = require('axios');

// Test MCP tool
async function testMCPTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/mcp/index.js']);
    let response = '';

    child.stdout.on('data', (data) => {
      response += data.toString();
    });

    child.on('close', () => {
      if (response) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.result && parsed.result.content) {
            const data = JSON.parse(parsed.result.content[0].text);
            resolve(data);
          } else {
            reject(new Error('Invalid MCP response format'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse MCP response: ${e.message}`));
        }
      } else {
        reject(new Error('No response from MCP server'));
      }
    });

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: 1
    };

    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}

// Test Gateway API
async function testGatewayAPI(endpoint) {
  try {
    const response = await axios.get(`http://localhost:15888${endpoint}`);
    return response.data;
  } catch (error) {
    throw new Error(`Gateway API error: ${error.message}`);
  }
}

// Compare results
function compareResults(mcpData, gatewayData, dataType) {
  const mcpJson = JSON.stringify(mcpData, null, 2);
  const gatewayJson = JSON.stringify(gatewayData, null, 2);
  
  console.log(`\n${dataType} Comparison:`);
  console.log('=' .repeat(50));
  
  if (mcpJson === gatewayJson) {
    console.log('✅ MCP and Gateway responses match exactly!');
  } else {
    console.log('❌ Responses differ:');
    console.log('\nMCP Response:');
    console.log(mcpJson);
    console.log('\nGateway Response:');
    console.log(gatewayJson);
  }
}

async function main() {
  console.log('Validating MCP Tools against Gateway API\n');

  try {
    // Test 1: Chains
    console.log('1. Testing chains endpoint...');
    const mcpChains = await testMCPTool('get_chains');
    const gatewayChains = await testGatewayAPI('/chains/');
    compareResults(mcpChains, gatewayChains, 'Chains');

    // Test 2: All Connectors
    console.log('\n2. Testing connectors endpoint (all)...');
    const mcpConnectors = await testMCPTool('get_connectors');
    const gatewayConnectors = await testGatewayAPI('/connectors/');
    compareResults(mcpConnectors, gatewayConnectors, 'Connectors');

    // Test 3: Filtered Connectors
    console.log('\n3. Testing connectors endpoint (filtered by solana)...');
    const mcpSolanaConnectors = await testMCPTool('get_connectors', { chain: 'solana' });
    const allConnectors = await testGatewayAPI('/connectors/');
    const filteredGatewayConnectors = {
      connectors: allConnectors.connectors.filter(c => c.chain === 'solana')
    };
    compareResults(mcpSolanaConnectors, filteredGatewayConnectors, 'Solana Connectors');

    console.log('\n✅ Validation complete!');
  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Check prerequisites
const fs = require('fs');

console.log('Checking prerequisites...');
if (!fs.existsSync('dist/mcp/index.js')) {
  console.error('❌ MCP server not built. Run "pnpm mcp:build" first.');
  process.exit(1);
}

// Check if Gateway is running
axios.get('http://localhost:15888/chains/')
  .then(() => {
    console.log('✅ Gateway server is running\n');
    main();
  })
  .catch(() => {
    console.error('❌ Gateway server is not running. Start it with "pnpm start"');
    process.exit(1);
  });