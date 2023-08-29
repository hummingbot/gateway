import request from 'supertest';
import { XRPL } from '../../../src/chains/xrpl/xrpl';
import { patch, unpatch } from '../../services/patch';
import { gatewayApp } from '../../../src/app';
import { Wallet } from 'xrpl';

let xrplChain: XRPL;

const wallet1 = Wallet.fromSecret('sEd74fJ432TFE4f5Sy48gLyzknkdc1t'); // r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16
const wallet2 = Wallet.fromSecret('sEd7oiMn5napJBthB2z4CtN5nVi56Bd'); // r3z4R6KQWfwRf9G15AhUZe2GN67Sj6PYNV

const patchWallet = () => {
  patch(xrplChain, 'getWallet', (walletAddress: string) => {
    if (walletAddress === 'r9wmQfStbNfPJ2XqAN7KH4iP8NJKmqPe16') return wallet1;

    return wallet2;
  });
};

const patchDatabase = () => {
  patch(xrplChain, '_orderStorage', {
    declareOwnership: () => {
      return;
    },
    init: () => {
      return;
    },
    close: () => {
      return;
    },
  });
};

beforeAll(async () => {
  xrplChain = XRPL.getInstance('testnet');
  patchDatabase();
  await xrplChain.init();
});

afterAll(async () => {
  unpatch();
  await xrplChain.close();
});

describe('POST /chain/balances', () => {
  it('should return 200 with correct parameters', async () => {
    patchWallet();
    await request(gatewayApp)
      .post(`/chain/balances`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
        address: 'r3z4R6KQWfwRf9G15AhUZe2GN67Sj6PYNV',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeDefined();
      });
  });

  it('should return 404 when parameters are invalid/incomplete', async () => {
    unpatch();
    await request(gatewayApp)
      .post(`/chain/balances`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
      })
      .expect(404);
  });
});

describe('POST /chain/poll', () => {
  it('should return 200 with correct parameters', async () => {
    const res = await request(gatewayApp).post('/chain/poll').send({
      chain: 'xrpl',
      network: 'testnet',
      txHash:
        'EF074CD8C98E639B3560200C5664029E4E7133D4803EF75F6991788E09E04CDB', // noqa: mock
    });
    expect(res.statusCode).toEqual(200);
  });

  it('should get unknown error with invalid txHash', async () => {
    const res = await request(gatewayApp).post('/chain/poll').send({
      chain: 'xrpl',
      network: 'testnet',
      txHash: 123,
    });
    expect(res.statusCode).toEqual(404);
  });
});

describe('GET /chain/tokens', () => {
  it('should return 200 with correct parameters', async () => {
    const res = await request(gatewayApp)
      .get('/chain/tokens')
      .send({
        chain: 'xrpl',
        network: 'testnet',
        tokenSymbols: ['XRP'],
      });
    expect(res.statusCode).toEqual(200);
  });

  it('should get unknown error with invalid tokenSymbols', async () => {
    const res = await request(gatewayApp).get('/chain/tokens').send({
      chain: 'xrpl',
      network: 'testnet',
      tokenSymbols: 123,
    });
    expect(res.statusCode).toEqual(404);
  });
});
