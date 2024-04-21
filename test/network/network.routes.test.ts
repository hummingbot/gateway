import request from 'supertest';
import { gatewayApp } from '../../src/app';
import { Ethereum } from '../../src/chains/ethereum/ethereum';
import { patchEVMNonceManager } from '../evm.nonce.mock';
import { patch, unpatch } from '../services/patch';
let eth: Ethereum;

beforeAll(async () => {
  eth = Ethereum.getInstance('goerli');
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

describe('GET /chain/status', () => {

  it('should return 200 when asking for goerli network status', async () => {
    patch(eth, 'chain', () => {
      return 'goerli';
    });
    patch(eth, 'rpcUrl', 'http://...');
    patch(eth, 'chainId', 5);
    patch(eth, 'getCurrentBlockNumber', () => {
      return 1;
    });

    await request(gatewayApp)
      .get(`/chain/status`)
      .query({
        chain: 'ethereum',
        network: 'goerli',
      })
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.chain).toBe('goerli'))
      .expect((res) => expect(res.body.chainId).toBeDefined())
      .expect((res) => expect(res.body.rpcUrl).toBeDefined())
      .expect((res) => expect(res.body.currentBlockNumber).toBeDefined());
  });

  it('should return 200 when requesting network status without specifying', async () => {
    patch(eth, 'getCurrentBlockNumber', () => {
      return 212;
    });

    await request(gatewayApp)
      .get(`/chain/status`)
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(Array.isArray(res.body)).toEqual(true));
  });

  it('should return 500 when asking for invalid network', async () => {
    await request(gatewayApp)
      .get(`/chain/status`)
      .query({
        chain: 'hello',
      })
      .expect(500);
  });
});

describe('GET /network/config', () => {
  it('should return 200 when asking for config', async () => {
    request(gatewayApp)
      .get(`/chain/config`)
      .expect('Content-Type', /json/)
      .expect(200);
  });
});

describe('GET /chain/tokens', () => {
  it('should return 200 when retrieving ethereum-goerli tokens, tokenSymbols parameter not provided', async () => {
    await request(gatewayApp)
      .get(`/chain/tokens`)
      .query({
        chain: 'ethereum',
        network: 'goerli',
      })
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should return 200 when retrieving ethereum-goerli tokens, s parameter provided', async () => {
    await request(gatewayApp)
      .get(`/chain/tokens`)
      .query({
        chain: 'ethereum',
        network: 'goerli',
        tokenSymbols: ['COIN3', 'COIN1'],
      })
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should return 200 when retrieving ethereum-goerli tokens, tokenSymbols parameter not provided', async () => {
    await request(gatewayApp)
      .get(`/chain/tokens`)
      .query({
        chain: 'ethereum',
        network: 'goerli',
      })
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should return 200 when retrieving ethereum-goerli tokens, tokenSymbols parameter provided', async () => {
    await request(gatewayApp)
      .get(`/chain/tokens`)
      .query({
        chain: 'ethereum',
        network: 'goerli',
        tokenSymbols: ['WETH', 'DAI'],
      })
      .expect('Content-Type', /json/)
      .expect(200);
  });


  it('should return 503 when retrieving tokens for invalid chain', async () => {
    await request(gatewayApp)
      .get(`/chain/tokens`)
      .query({
        chain: 'unknown',
        network: 'goerli',
      })
      .expect(503);
  });
});
