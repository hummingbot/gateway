import BigNumber from 'bignumber.js';
import { Tezosish } from '../../../src/services/common-interfaces';
import { patch } from '../../../test/services/patch';
import { Tezos } from '../../../src/chains/tezos/tezos';
import { QuipuSwap } from '../../../src/connectors/quipuswap/quipuswap';


describe('QuipuSwap', () => {
  let quipuswap: QuipuSwap;
  let tezos: Tezosish;

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
    quipuswap = QuipuSwap.getInstance('mainnet');

    await tezos.init();
    await quipuswap.init();
  });

  describe('gasLimitEstimate', () => {
    it('should return the gas limit estimate', () => {
      const gasLimitEstimate = quipuswap.gasLimitEstimate;
      expect(gasLimitEstimate).toEqual(15000);
    });
  });

  describe('getAllowedSlippage', () => {
    it('should return the allowed slippage from the configuration', () => {
      const allowedSlippage = quipuswap.getAllowedSlippage();
      expect(allowedSlippage).toEqual(new BigNumber('0.5'));
    });

    it('should return the allowed slippage from the parameter', () => {
      const allowedSlippage = quipuswap.getAllowedSlippage('1/20');
      expect(allowedSlippage).toEqual(new BigNumber('5'));
    });

    it('should return the allowed slippage from the configuration if the parameter is invalid', () => {
      const allowedSlippage = quipuswap.getAllowedSlippage('invalid');
      expect(allowedSlippage).toEqual(new BigNumber('0.5'));
    });
  });

  describe('estimateSellTrade', () => {
    it('should return the expected trade for a valid trade', async () => {
      const baseToken = 'QUIPU';
      const quoteToken = 'XTZ';
      const amount = new BigNumber(1);
      const expectedTrade = quipuswap.estimateSellTrade(baseToken, quoteToken, amount);
      expect(expectedTrade.outputAmount).toBeDefined();
      expect(expectedTrade.trade).toBeDefined();
    });
  });

  describe('estimateBuyTrade', () => {
    it('should return the expected trade for a valid trade', async () => {
      const baseToken = 'DOGA';
      const quoteToken = 'XTZ';
      const amount = new BigNumber(1);
      const expectedTrade = quipuswap.estimateBuyTrade(baseToken, quoteToken, amount);
      expect(expectedTrade.inputAmount).toBeDefined();
      expect(expectedTrade.trade).toBeDefined();
    });
  });

  describe('executeTrade', () => {
    it('should execute the trade and return the hash and operations', async () => {
      patchProvider();
      const baseToken = 'CTEZ';
      const quoteToken = 'XTZ';
      const amount = new BigNumber(1);
      const expectedTrade = quipuswap.estimateBuyTrade(baseToken, quoteToken, amount);
      const executedTrade = await quipuswap.executeTrade(tezos.provider, expectedTrade.trade);
      expect(executedTrade.hash).toBeDefined();
      expect(executedTrade.operations).toBeDefined();
    });
  });
});