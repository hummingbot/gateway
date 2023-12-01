import { Plenty } from '../../../src/connectors/plenty/plenty';
import BigNumber from 'bignumber.js';
import { Tezosish } from '../../../src/services/common-interfaces';
import { tokensAPI } from './tokensAPI';
import { analyticsAPI } from './analyticsAPI';
import { patch } from '../../../test/services/patch';
import { Tezos } from '../../../src/chains/tezos/tezos';


describe('Plenty', () => {
  let plenty: Plenty;
  let tezos: Tezosish;

  const patchFetch = () => {
    patch(global, 'fetch', (url: string) => {
      return {
        json: () => {
          if (url.includes('analytics'))
            return analyticsAPI;
          else
            return tokensAPI;
        }
      }
    });
  };

  const patchProvider = () => {
    patch(tezos.provider.signer, 'publicKeyHash', () => 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV');
    patch(tezos.provider.contract, 'batch', () => {
      return {
        send: () => {
          return {
            status: 'applied',
            hash: 'hash',
            results: []
          }
        }
      }
    });
  };

  beforeAll(async () => {
    tezos = Tezos.getInstance('mainnet');
    plenty = Plenty.getInstance('mainnet');

    patchFetch();
    await tezos.init();
    await plenty.init();
  });

  describe('getTokenBySymbol', () => {
    it('should return the correct token for a valid symbol', () => {
      const token = plenty.getTokenBySymbol('USDT');
      expect(token.symbol).toEqual('USDT');
    });
  });

  describe('getPool', () => {
    it('should return the correct pool for a valid token pair', () => {
      const pool = plenty.getPool('XTZ', 'CTEZ');
      expect(pool.address).toBeDefined();
    });
  });

  describe('tokenList', () => {
    it('should return the token list', () => {
      const tokenList = plenty.tokenList;
      expect(tokenList).toBeDefined();
      expect(Object.keys(tokenList).length).toBeGreaterThan(0);
    });
  });

  describe('router', () => {
    it('should return the router address', () => {
      const router = plenty.router;
      expect(router).toBeDefined();
    });
  });

  describe('gasLimitEstimate', () => {
    it('should return the gas limit estimate', () => {
      const gasLimitEstimate = plenty.gasLimitEstimate;
      expect(gasLimitEstimate).toEqual(15000);
    });
  });

  describe('getAllowedSlippage', () => {
    it('should return the allowed slippage from the configuration', () => {
      const allowedSlippage = plenty.getAllowedSlippage();
      expect(allowedSlippage).toEqual('1/200');
    });

    it('should return the allowed slippage from the parameter', () => {
      const allowedSlippage = plenty.getAllowedSlippage('1/20');
      expect(allowedSlippage).toEqual('1/20');
    });

    it('should return the allowed slippage from the configuration if the parameter is invalid', () => {
      const allowedSlippage = plenty.getAllowedSlippage('invalid');
      expect(allowedSlippage).toEqual('1/200');
    });
  });

  describe('estimateSellTrade', () => {
    it('should return the expected trade for a valid trade', async () => {
      const baseToken = plenty.tokenList.XTZ;
      const quoteToken = plenty.tokenList.USDT;
      const amount = new BigNumber(1);
      const expectedTrade = await plenty.estimateSellTrade(tezos, baseToken, quoteToken, amount);
      expect(expectedTrade.expectedAmount).toBeDefined();
      expect(expectedTrade.trade).toBeDefined();
    });
  });

  describe('estimateBuyTrade', () => {
    it('should return the expected trade for a valid trade', async () => {
      const baseToken = plenty.tokenList.XTZ;
      const quoteToken = plenty.tokenList.USDT;
      const amount = new BigNumber(1);
      const expectedTrade = await plenty.estimateBuyTrade(tezos, quoteToken, baseToken, amount);
      expect(expectedTrade.expectedAmount).toBeDefined();
      expect(expectedTrade.trade).toBeDefined();
    });
  });

  describe('executeTrade', () => {
    it('should execute the trade and return the hash and operations', async () => {
      patchProvider();
      const baseToken = plenty.tokenList.XTZ;
      const quoteToken = plenty.tokenList.USDT;
      const amount = new BigNumber(1);
      const expectedTrade = await plenty.estimateSellTrade(tezos, baseToken, quoteToken, amount);
      const executedTrade = await plenty.executeTrade(tezos, expectedTrade.trade);
      expect(executedTrade.hash).toBeDefined();
      expect(executedTrade.operations).toBeDefined();
    });
  });
});