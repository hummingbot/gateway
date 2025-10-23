/**
 * Example: Using Raydium SDK to Add Liquidity
 *
 * This example demonstrates how to use the Protocol SDK directly
 * (without going through the REST API).
 *
 * This is "SDK Mode" - programmatic access to protocol operations.
 */

import { RaydiumConnector } from '../../packages/sdk/src/solana/raydium';

/**
 * Example: Add Liquidity to Raydium Pool
 */
async function exampleAddLiquidity() {
  console.log('=== Raydium SDK Example: Add Liquidity ===\n');

  // Step 1: Get SDK instance
  console.log('Step 1: Initialize Raydium SDK...');
  const raydium = await RaydiumConnector.getInstance('devnet');
  console.log('✓ Raydium SDK initialized\n');

  // Step 2: Define parameters
  const params = {
    poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    walletAddress: 'YourWalletAddressHere',
    baseTokenAmount: 0.01, // 0.01 SOL
    quoteTokenAmount: 2.0, // 2 USDC
    slippagePct: 1.0, // 1% slippage
  };

  console.log('Step 2: Define parameters:');
  console.log(JSON.stringify(params, null, 2));
  console.log('');

  // Step 3: Validate parameters
  console.log('Step 3: Validate parameters...');
  const validation = await raydium.operations.addLiquidity.validate(params);

  if (!validation.valid) {
    console.error('✗ Validation failed:');
    validation.errors?.forEach((error) => console.error(`  - ${error}`));
    return;
  }
  console.log('✓ Parameters valid\n');

  // Step 4: Simulate transaction
  console.log('Step 4: Simulate transaction...');
  const simulation = await raydium.operations.addLiquidity.simulate(params);

  if (!simulation.success) {
    console.error('✗ Simulation failed:', simulation.error);
    return;
  }

  console.log('✓ Simulation successful');
  console.log('Expected changes:');
  simulation.changes?.balanceChanges?.forEach((change) => {
    console.log(`  ${change.direction === 'out' ? '→' : '←'} ${change.amount} ${change.token}`);
  });
  console.log(`  Estimated fee: ${simulation.estimatedFee?.amount} ${simulation.estimatedFee?.token}`);
  console.log('');

  // Step 5: Build transaction
  console.log('Step 5: Build unsigned transaction...');
  const tx = await raydium.operations.addLiquidity.build(params);

  console.log('✓ Transaction built');
  console.log(`  Description: ${tx.description}`);
  console.log(`  Estimated fee: ${tx.estimatedFee?.amount} ${tx.estimatedFee?.token}`);
  console.log('');

  // Step 6: Sign and submit (optional - user can do this manually)
  console.log('Step 6: Transaction ready');
  console.log('You can now:');
  console.log('  a) Sign the transaction with your wallet');
  console.log('  b) Submit to the network');
  console.log('  c) Or use execute() to do both automatically');
  console.log('');

  // Optional: Execute (sign + submit)
  // const result = await raydium.operations.addLiquidity.execute(params);
  // console.log('Transaction executed:', result.signature);

  console.log('=== Example Complete ===\n');
}

/**
 * Example: Compare SDK Mode vs API Mode
 */
function compareSDKvsAPI() {
  console.log('=== SDK Mode vs API Mode ===\n');

  console.log('SDK Mode (Direct programmatic access):');
  console.log('```typescript');
  console.log('const raydium = await RaydiumConnector.getInstance("mainnet");');
  console.log('const tx = await raydium.operations.addLiquidity.build(params);');
  console.log('// Use tx.raw to sign and submit');
  console.log('```\n');

  console.log('API Mode (HTTP REST endpoint):');
  console.log('```bash');
  console.log('curl -X POST http://localhost:15888/connectors/raydium/amm/add-liquidity-sdk \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{');
  console.log('    "network": "mainnet-beta",');
  console.log('    "walletAddress": "...",');
  console.log('    "poolAddress": "...",');
  console.log('    "baseTokenAmount": 0.01,');
  console.log('    "quoteTokenAmount": 2.0');
  console.log('  }\'');
  console.log('```\n');

  console.log('Both modes use the SAME business logic!');
  console.log('The API is just a thin HTTP wrapper around the SDK.\n');
}

/**
 * Example: Progressive Enhancement
 */
async function exampleProgressiveEnhancement() {
  console.log('=== Progressive Enhancement ===\n');

  const raydium = await RaydiumConnector.getInstance('devnet');

  const params = {
    poolAddress: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    walletAddress: 'YourWalletAddressHere',
    baseTokenAmount: 0.01,
    quoteTokenAmount: 2.0,
  };

  console.log('Level 1: Just build the transaction');
  const tx = await raydium.operations.addLiquidity.build(params);
  console.log('✓ Transaction built\n');

  console.log('Level 2: Validate before building');
  const validation = await raydium.operations.addLiquidity.validate(params);
  if (validation.valid) {
    const tx = await raydium.operations.addLiquidity.build(params);
    console.log('✓ Validated and built\n');
  }

  console.log('Level 3: Simulate before building');
  const simulation = await raydium.operations.addLiquidity.simulate(params);
  if (simulation.success) {
    const tx = await raydium.operations.addLiquidity.build(params);
    console.log('✓ Simulated and built\n');
  }

  console.log('Level 4: Let SDK handle everything');
  const result = await raydium.operations.addLiquidity.execute(params);
  console.log('✓ Executed automatically\n');

  console.log('You choose the level of control you need!');
}

/**
 * Run examples
 */
if (require.main === module) {
  (async () => {
    try {
      await exampleAddLiquidity();
      compareSDKvsAPI();
      await exampleProgressiveEnhancement();
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}

export { exampleAddLiquidity, compareSDKvsAPI, exampleProgressiveEnhancement };
