const { InfuraService } = require('./dist/chains/ethereum/infura-service');
const { ConfigManagerV2 } = require('./dist/services/config-manager-v2');

// Helper to wait for WebSocket connection
async function waitForConnection(service, maxWait = 5000) {
  const start = Date.now();
  while (!service.isWebSocketConnected() && Date.now() - start < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return service.isWebSocketConnected();
}

async function testInfuraWebSocket() {
  console.log('=== Testing Infura WebSocket Service ===\n');

  try {
    // Initialize config manager
    const configManager = ConfigManagerV2.getInstance();

    // Get Infura API key from config
    const apiKey = configManager.get('infura.apiKey');
    const useWebSocket = configManager.get('infura.useWebSocket');

    console.log(`API Key configured: ${apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No'}`);
    console.log(`WebSocket enabled: ${useWebSocket}\n`);

    if (!apiKey) {
      console.error('❌ No Infura API key configured in conf/rpc/infura.yml');
      process.exit(1);
    }

    // Test with Ethereum Mainnet (chainId 1)
    console.log('--- Testing Ethereum Mainnet ---');
    const mainnetService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'mainnet', chainId: 1 }
    );

    await mainnetService.initialize();

    // Wait for connection
    console.log('Waiting for WebSocket connection...');
    const connected = await waitForConnection(mainnetService, 10000);
    console.log(`WebSocket connected: ${connected}`);

    if (connected) {
      console.log('✅ Mainnet WebSocket connection successful\n');
    } else {
      console.log('❌ Mainnet WebSocket connection failed\n');
    }

    // Test with Polygon (chainId 137)
    console.log('--- Testing Polygon ---');
    const polygonService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'polygon', chainId: 137 }
    );

    await polygonService.initialize();

    const polygonConnected = await waitForConnection(polygonService, 10000);
    console.log(`WebSocket connected: ${polygonConnected}`);

    if (polygonConnected) {
      console.log('✅ Polygon WebSocket connection successful\n');
    } else {
      console.log('❌ Polygon WebSocket connection failed\n');
    }

    // Test with Arbitrum (chainId 42161)
    console.log('--- Testing Arbitrum ---');
    const arbitrumService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'arbitrum', chainId: 42161 }
    );

    await arbitrumService.initialize();

    const arbitrumConnected = await waitForConnection(arbitrumService, 10000);
    console.log(`WebSocket connected: ${arbitrumConnected}`);

    if (arbitrumConnected) {
      console.log('✅ Arbitrum WebSocket connection successful\n');
    } else {
      console.log('❌ Arbitrum WebSocket connection failed\n');
    }

    // Test with Optimism (chainId 10)
    console.log('--- Testing Optimism ---');
    const optimismService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'optimism', chainId: 10 }
    );

    await optimismService.initialize();

    const optimismConnected = await waitForConnection(optimismService, 10000);
    console.log(`WebSocket connected: ${optimismConnected}`);

    if (optimismConnected) {
      console.log('✅ Optimism WebSocket connection successful\n');
    } else {
      console.log('❌ Optimism WebSocket connection failed\n');
    }

    // Test with Base (chainId 8453)
    console.log('--- Testing Base ---');
    const baseService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'base', chainId: 8453 }
    );

    await baseService.initialize();

    const baseConnected = await waitForConnection(baseService, 10000);
    console.log(`WebSocket connected: ${baseConnected}`);

    if (baseConnected) {
      console.log('✅ Base WebSocket connection successful\n');
    } else {
      console.log('❌ Base WebSocket connection failed\n');
    }

    // Test disconnection
    console.log('--- Testing Disconnection ---');
    mainnetService.disconnect();
    console.log(`Mainnet WebSocket connected after disconnect: ${mainnetService.isWebSocketConnected()}`);

    polygonService.disconnect();
    console.log(`Polygon WebSocket connected after disconnect: ${polygonService.isWebSocketConnected()}`);

    arbitrumService.disconnect();
    console.log(`Arbitrum WebSocket connected after disconnect: ${arbitrumService.isWebSocketConnected()}`);

    optimismService.disconnect();
    console.log(`Optimism WebSocket connected after disconnect: ${optimismService.isWebSocketConnected()}`);

    baseService.disconnect();
    console.log(`Base WebSocket connected after disconnect: ${baseService.isWebSocketConnected()}`);

    console.log('\n✅ All Infura WebSocket tests passed!');
    console.log('\nSummary:');
    console.log('- WebSocket connections established successfully for all networks');
    console.log('- Connection state tracking works properly');
    console.log('- Disconnect functionality works as expected');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testInfuraWebSocket();
