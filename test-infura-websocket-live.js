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
  try {
    // Initialize config manager
    const configManager = ConfigManagerV2.getInstance();

    // Get Infura API key from config
    const apiKey = configManager.get('infura.apiKey');
    const useWebSocket = configManager.get('infura.useWebSocket');

    if (!apiKey) {
      throw new Error('No Infura API key configured in conf/rpc/infura.yml');
    }

    // Test with Ethereum Mainnet (chainId 1)
    const mainnetService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'mainnet', chainId: 1 }
    );

    await mainnetService.initialize();

    // Wait for connection
    const connected = await waitForConnection(mainnetService, 10000);

    if (!connected) {
      throw new Error('Mainnet WebSocket connection failed');
    }

    // Test with Polygon (chainId 137)
    const polygonService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'polygon', chainId: 137 }
    );

    await polygonService.initialize();

    const polygonConnected = await waitForConnection(polygonService, 10000);

    if (!polygonConnected) {
      throw new Error('Polygon WebSocket connection failed');
    }

    // Test with Arbitrum (chainId 42161)
    const arbitrumService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'arbitrum', chainId: 42161 }
    );

    await arbitrumService.initialize();

    const arbitrumConnected = await waitForConnection(arbitrumService, 10000);

    if (!arbitrumConnected) {
      throw new Error('Arbitrum WebSocket connection failed');
    }

    // Test with Optimism (chainId 10)
    const optimismService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'optimism', chainId: 10 }
    );

    await optimismService.initialize();

    const optimismConnected = await waitForConnection(optimismService, 10000);

    if (!optimismConnected) {
      throw new Error('Optimism WebSocket connection failed');
    }

    // Test with Base (chainId 8453)
    const baseService = new InfuraService(
      { apiKey, useWebSocket },
      { chain: 'ethereum', network: 'base', chainId: 8453 }
    );

    await baseService.initialize();

    const baseConnected = await waitForConnection(baseService, 10000);

    if (!baseConnected) {
      throw new Error('Base WebSocket connection failed');
    }

    // Test disconnection
    mainnetService.disconnect();
    if (mainnetService.isWebSocketConnected()) {
      throw new Error('Mainnet disconnect failed');
    }

    polygonService.disconnect();
    if (polygonService.isWebSocketConnected()) {
      throw new Error('Polygon disconnect failed');
    }

    arbitrumService.disconnect();
    if (arbitrumService.isWebSocketConnected()) {
      throw new Error('Arbitrum disconnect failed');
    }

    optimismService.disconnect();
    if (optimismService.isWebSocketConnected()) {
      throw new Error('Optimism disconnect failed');
    }

    baseService.disconnect();
    if (baseService.isWebSocketConnected()) {
      throw new Error('Base disconnect failed');
    }

    process.exit(0);

  } catch (error) {
    process.exit(1);
  }
}

testInfuraWebSocket();
