const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class MCPTestRunner {
  constructor(serverPath) {
    this.serverPath = serverPath;
    this.results = [];
  }

  async runTest(testName, request) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [this.serverPath]);
      let response = '';
      let error = '';

      child.stdout.on('data', (data) => {
        response += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        this.results.push({
          testName,
          request,
          response: response.trim(),
          error: error.trim(),
          exitCode: code,
          success: code === 0 && response.length > 0,
          timestamp: new Date().toISOString()
        });
        resolve();
      });

      // Send request
      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();
    });
  }

  async runAllTests() {
    console.log('🚀 Starting MCP Gateway Tests...\n');
    
    const tests = [
      {
        name: 'list_tools',
        request: {
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: 1
        }
      },
      {
        name: 'get_chains',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'get_chains', arguments: {} },
          id: 2
        }
      },
      {
        name: 'get_connectors_all',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'get_connectors', arguments: {} },
          id: 3
        }
      },
      {
        name: 'get_connectors_filtered',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'get_connectors', arguments: { chain: 'solana' } },
          id: 4
        }
      },
      {
        name: 'wallet_list_all',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'wallet_list', arguments: {} },
          id: 5
        }
      },
      {
        name: 'wallet_list_filtered',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'wallet_list', arguments: { chain: 'ethereum' } },
          id: 6
        }
      },
      {
        name: 'get_balance_stub',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { 
            name: 'get_balance_stub', 
            arguments: {
              chain: 'ethereum',
              network: 'mainnet',
              address: '0x1234567890abcdef'
            }
          },
          id: 7
        }
      },
      {
        name: 'invalid_tool',
        request: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: 'invalid_tool_name', arguments: {} },
          id: 8
        }
      }
    ];

    for (const test of tests) {
      console.log(`Running test: ${test.name}`);
      await this.runTest(test.name, test.request);
    }

    // Save results
    await this.saveResults();
  }

  parseResponse(responseStr) {
    try {
      return JSON.parse(responseStr);
    } catch (e) {
      return null;
    }
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = 'mcp-test-results';
    const resultsPath = path.join(resultsDir, `test-run-${timestamp}.json`);
    
    await fs.mkdir(resultsDir, { recursive: true });
    
    // Add parsed responses
    const resultsWithParsed = this.results.map(r => ({
      ...r,
      parsedResponse: this.parseResponse(r.response)
    }));
    
    await fs.writeFile(resultsPath, JSON.stringify(resultsWithParsed, null, 2));
    
    // Generate summary
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    
    console.log(`\n📊 Test Results Summary:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📄 Full results: ${resultsPath}`);
    
    // Show individual test results
    console.log(`\n📋 Individual Test Results:`);
    this.results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      console.log(`${status} ${r.testName}`);
      if (!r.success && r.error) {
        console.log(`   Error: ${r.error.split('\n')[0]}`);
      }
    });
    
    // Save summary
    const summaryPath = path.join(resultsDir, `test-summary-${timestamp}.txt`);
    const summary = `MCP Gateway Test Summary
========================
Date: ${new Date().toISOString()}
Total Tests: ${this.results.length}
Passed: ${passed}
Failed: ${failed}
Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%

Individual Results:
${this.results.map(r => `${r.success ? '✅' : '❌'} ${r.testName}`).join('\n')}
`;
    
    await fs.writeFile(summaryPath, summary);
    console.log(`\n📝 Summary saved to: ${summaryPath}`);
  }
}

// Check if server exists
async function checkServerExists() {
  const serverPath = './dist/mcp/index.js';
  try {
    await fs.access(serverPath);
    return true;
  } catch {
    console.error('❌ MCP server not found at:', serverPath);
    console.log('💡 Run "pnpm mcp:build" first to build the server');
    return false;
  }
}

// Main execution
async function main() {
  if (!await checkServerExists()) {
    process.exit(1);
  }
  
  const runner = new MCPTestRunner('./dist/mcp/index.js');
  await runner.runAllTests();
}

main().catch(console.error);