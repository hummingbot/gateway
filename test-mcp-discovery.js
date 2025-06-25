const { spawn } = require('child_process');

// Function to test a single MCP tool
async function testTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['dist/mcp/index.js']);
    let response = '';
    let error = '';

    child.stdout.on('data', (data) => {
      response += data.toString();
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      if (response) {
        try {
          const parsed = JSON.parse(response);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${response}`));
        }
      } else {
        reject(new Error(`No response received. Exit code: ${code}, stderr: ${error}`));
      }
    });

    // Send JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      },
      id: 1
    };

    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}

async function main() {
  console.log('Testing MCP Discovery Tools\n');
  console.log('==============================\n');

  try {
    // Test get_chains
    console.log('1. Testing get_chains tool:');
    const chainsResult = await testTool('get_chains');
    console.log('Response:', JSON.stringify(chainsResult, null, 2));
    
    if (chainsResult.result && chainsResult.result.content) {
      const chainsData = JSON.parse(chainsResult.result.content[0].text);
      console.log('\nExtracted chains data:');
      console.log(`- Total chains: ${chainsData.count}`);
      console.log(`- Chains: ${chainsData.chains.map(c => c.name).join(', ')}`);
    }

    console.log('\n---\n');

    // Test get_connectors
    console.log('2. Testing get_connectors tool (all):');
    const connectorsResult = await testTool('get_connectors');
    console.log('Response:', JSON.stringify(connectorsResult, null, 2));
    
    if (connectorsResult.result && connectorsResult.result.content) {
      const connectorsData = JSON.parse(connectorsResult.result.content[0].text);
      console.log('\nExtracted connectors data:');
      console.log(`- Total connectors: ${connectorsData.count}`);
      console.log(`- Connectors: ${connectorsData.connectors.map(c => c.name).join(', ')}`);
    }

    console.log('\n---\n');

    // Test get_connectors with filter
    console.log('3. Testing get_connectors tool (filtered by solana):');
    const solanaConnectorsResult = await testTool('get_connectors', { chain: 'solana' });
    console.log('Response:', JSON.stringify(solanaConnectorsResult, null, 2));

    console.log('\n---\n');

    // Generate expected test data
    console.log('4. Expected test data for GATEWAY-MCP.md:');
    
    if (chainsResult.result && chainsResult.result.content) {
      const chainsData = JSON.parse(chainsResult.result.content[0].text);
      const expectedChains = {
        expected_chains: chainsData.chains.map(c => c.name),
        expected_chain_details: chainsData.chains.reduce((acc, chain) => {
          acc[chain.name] = {
            networks: chain.networks,
            nativeCurrency: chain.nativeCurrency,
            type: chain.type
          };
          return acc;
        }, {})
      };
      
      console.log('\nExpected chains test data:');
      console.log(JSON.stringify(expectedChains, null, 2));
    }

    if (connectorsResult.result && connectorsResult.result.content) {
      const connectorsData = JSON.parse(connectorsResult.result.content[0].text);
      const expectedConnectors = {
        expected_connectors: connectorsData.connectors.map(c => c.name),
        connector_details: connectorsData.connectors.reduce((acc, conn) => {
          acc[conn.name] = {
            supportedChains: conn.supportedChains,
            type: conn.type
          };
          return acc;
        }, {})
      };
      
      console.log('\nExpected connectors test data:');
      console.log(JSON.stringify(expectedConnectors, null, 2));
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Check if MCP server is built
const fs = require('fs');
if (!fs.existsSync('dist/mcp/index.js')) {
  console.error('MCP server not built. Run "pnpm mcp:build" first.');
  process.exit(1);
}

// Check if conf directory exists
if (!fs.existsSync('conf')) {
  console.log('Note: conf directory does not exist. The tools will return fallback data.');
  console.log('Run "pnpm setup" to create the conf directory with actual configs.\n');
}

main();