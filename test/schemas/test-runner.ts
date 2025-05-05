import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { generateTestData } from './utils/test-generator';

// Constants
const TEST_COMMAND = 'npm run test:schemas';
const ALL_CONNECTORS = ['ethereum', 'solana', 'uniswap', 'jupiter', 'raydium', 'meteora'];

// Helper function to check if test data exists for a connector
function hasTestData(connector: string): boolean {
  const testParamsDir = path.join(__dirname, 'test-params', connector);
  const mockResponsesDir = path.join(__dirname, 'mock-responses', connector);
  
  return (
    fs.existsSync(testParamsDir) && 
    fs.existsSync(mockResponsesDir) &&
    fs.readdirSync(testParamsDir).length > 0 &&
    fs.readdirSync(mockResponsesDir).length > 0
  );
}

// Check which connectors need test data
const connectorsMissingData = ALL_CONNECTORS.filter(connector => !hasTestData(connector));

// Generate missing test data if needed
if (connectorsMissingData.length > 0) {
  console.log(`Generating test data for connectors: ${connectorsMissingData.join(', ')}`);
  generateTestData.all();
}

// Run the tests
console.log('Running schema validation tests...');
try {
  execSync(TEST_COMMAND, { stdio: 'inherit' });
  console.log('All tests passed successfully!');
} catch (error) {
  console.error('Test execution failed:', error);
  process.exit(1);
}