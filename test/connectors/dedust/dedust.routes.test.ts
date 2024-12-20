jest.mock('../../../src/services/config-manager-v2');
jest.mock('../../../src/services/logger');
jest.useFakeTimers();
import './__mocks__/dedust.config';
import express from 'express';
import { Express } from 'express-serve-static-core';
import request from 'supertest';
import { Ton } from '../../../src/chains/ton/ton';
import { Dedust } from '../../../src/connectors/dedust/dedust';
import { AmmRoutes } from '../../../src/amm/amm.routes';
import { patch, unpatch } from '../../../test/services/patch';

let app: Express;
let ton: Ton;
let dedust: Dedust;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ton = Ton.getInstance('mainnet');
  await ton.init();
  dedust = Dedust.getInstance('mainnet');
  await dedust.init();
  app.use('/amm', AmmRoutes.router);
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await ton.close();
});

const address = 'EQDjVXa_oltdBP64Nc__p397xLCvGm2IcZ1ba7anSW0NAkeP';

const setupMocks = () => {
  patch(ton, 'getAccountFromAddress', () => ({
    publicKey: 'mock-public-key',
    secretKey: 'mock-secret-key',
  }));
  patch(dedust, 'init', async () => {});
  patch(ton, 'storedTokenList', () => ({
    TON: { symbol: 'TON', assetId: 'TON', decimals: 9 },
    jUSDT: { symbol: 'jUSDT', assetId: 'EQDjVXa_oltdBP64Nc__p397xLCvGm2IcZ1ba7anSW0NAkeP', decimals: 6 },
  }));
  patch(dedust, 'estimateTrade', () => ({
    trade: {
      pool: {},
      vault: {},
      amount: BigInt('1500000000'),
      fromAsset: {},
      toAsset: {},
      expectedOut: BigInt('1000000000'),
      priceImpact: 1.5,
      tradeFee: BigInt('1000000'),
    },
    expectedAmount: 1.0,
    expectedPrice: 1.5,
  }));
  patch(dedust, 'executeTrade', () => ({
    txId: 'mock-tx-hash',
    success: true,
  }));
};

describe('Dedust Routes', () => {
  describe('POST /amm/price', () => {
    it('should return 200 for valid request', async () => {
      setupMocks();
      await request(app)
        .post(`/amm/price`)
        .send({
          chain: 'ton',
          network: 'mainnet',
          connector: 'dedust',
          quote: 'jUSDT',
          base: 'TON',
          amount: '1.5',
          side: 'SELL',
        })
        .set('Accept', 'application/json')
        .expect(200)
        .then((res: any) => {
          expect(res.body.amount).toBeDefined();
          expect(res.body.price).toBeDefined();
        });
    });

    it('should return 500 for unsupported token', async () => {
      setupMocks();
      await request(app)
        .post(`/amm/price`)
        .send({
          chain: 'ton',
          network: 'mainnet',
          connector: 'dedust',
          quote: 'UNSUPPORTED',
          base: 'TON',
          amount: '1.5',
          side: 'SELL',
        })
        .set('Accept', 'application/json')
        .expect(500);
    });
  });

  describe('POST /amm/trade', () => {
    it('should execute trade successfully', async () => {
      setupMocks();
      await request(app)
        .post(`/amm/trade`)
        .send({
          chain: 'ton',
          network: 'mainnet',
          connector: 'dedust',
          quote: 'jUSDT',
          base: 'TON',
          amount: '1.5',
          address,
          side: 'SELL',
        })
        .set('Accept', 'application/json')
        .expect(200)
        .then((res: any) => {
          expect(res.body.txHash).toBe('mock-tx-hash');
        });
    });

    it('should handle trade failure', async () => {
      setupMocks();
      patch(dedust, 'executeTrade', () => ({
        txId: '',
        success: false,
        error: 'Trade execution failed',
      }));

      await request(app)
        .post(`/amm/trade`)
        .send({
          chain: 'ton',
          network: 'mainnet',
          connector: 'dedust',
          quote: 'jUSDT',
          base: 'TON',
          amount: '1.5',
          address,
          side: 'SELL',
        })
        .set('Accept', 'application/json')
        .expect(500);
    });
  });
}); 