import { gatewayApp } from '../../src/app';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../evm.nonce.mock';
import { patch, unpatch } from '../services/patch';
let eth: Ethereum;

beforeAll(async () => {
  eth = Ethereum.getInstance('sepolia');
  patchEVMNonceManager(eth.nonceManager);
  await eth.init();
});

beforeEach(() => {
  patchEVMNonceManager(eth.nonceManager);
});

afterEach(async () => {
  unpatch();
});

afterAll(async () => {
  await eth.close();
});

describe('GET /ethereum/status', () => {
  it('should return 200 when asking for sepolia network status', async () => {
    patch(eth, 'network', () => {
      return 'sepolia';
    });
    patch(eth, 'rpcUrl', 'http://...');
    patch(eth, 'chainId', 11155111);
    patch(eth, 'getCurrentBlockNumber', () => {
      return 1;
    });

    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/ethereum/status',
      query: {
        network: 'sepolia',
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    const body = JSON.parse(response.payload);
    expect(body.network).toBe('sepolia');
    expect(body.chainId).toBeDefined();
    expect(body.rpcUrl).toBeDefined();
    expect(body.currentBlockNumber).toBeDefined();
  });

  it('should return a 400 error when requesting status without specifying a network', async () => {
    patch(eth, 'getCurrentBlockNumber', () => {
      return 212;
    });

    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/ethereum/status'
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return a 500 error when asking for an invalid network', async () => {
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/ethereum/status',
      query: {
        network: 'invalid'
      }
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('GET /config', () => {
  it('should return 200 when asking for config', async () => {
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/config'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });

  it('should return 200 when asking for chain specific config', async () => {
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/config',
      query: { chain: 'ethereum' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });
});

describe('GET /ethereum/tokens', () => {
  it('should return 200 when retrieving ethereum-sepolia tokens, tokenSymbols parameter not provided', async () => {
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/ethereum/tokens',
      query: {
        network: 'sepolia',
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });

  it('should return 200 when retrieving ethereum-sepolia tokens, tokenSymbols parameter provided', async () => {
    const response = await gatewayApp.inject({
      method: 'GET',
      url: '/ethereum/tokens',
      query: {
        network: 'sepolia',
        tokenSymbols: ['WETH', 'DAI'],
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
  });

});
