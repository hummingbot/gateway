import { Value } from '@sinclair/typebox/value';

import * as Okx from '../../../src/connectors/okx/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('OKX Schema Tests', () => {
  describe('Schema Superset Validation', () => {
    it('OkxQuoteSwapRequest should be a superset of QuoteSwapRequest', () => {
      const baseRequired = Base.QuoteSwapRequest.required || [];
      const okxRequired = Okx.OkxQuoteSwapRequest.required || [];

      for (const field of baseRequired) {
        expect(okxRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.QuoteSwapRequest.properties);
      const okxProps = Object.keys(Okx.OkxQuoteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(okxProps).toContain(prop);
      }

      const sampleRequest = {
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
        slippagePct: 0.5,
      };

      expect(Value.Check(Base.QuoteSwapRequest, sampleRequest)).toBe(true);
      expect(Value.Check(Okx.OkxQuoteSwapRequest, sampleRequest)).toBe(true);
    });

    it('OkxQuoteSwapResponse should be a superset of QuoteSwapResponse', () => {
      const baseRequired = Base.QuoteSwapResponse.required || [];
      const okxRequired = Okx.OkxQuoteSwapResponse.required || [];

      for (const field of baseRequired) {
        expect(okxRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.QuoteSwapResponse.properties);
      const okxProps = Object.keys(Okx.OkxQuoteSwapResponse.properties);

      for (const prop of baseProps) {
        expect(okxProps).toContain(prop);
      }
    });

    it('OkxExecuteQuoteRequest should be a superset of ExecuteQuoteRequest', () => {
      const baseRequired = Base.ExecuteQuoteRequest.required || [];
      const okxRequired = Okx.OkxExecuteQuoteRequest.required || [];

      for (const field of baseRequired) {
        expect(okxRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.ExecuteQuoteRequest.properties);
      const okxProps = Object.keys(Okx.OkxExecuteQuoteRequest.properties);

      for (const prop of baseProps) {
        expect(okxProps).toContain(prop);
      }

      const sampleRequest = {
        walletAddress: '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
        network: 'mainnet-beta',
        quoteId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(Value.Check(Base.ExecuteQuoteRequest, sampleRequest)).toBe(true);
      expect(Value.Check(Okx.OkxExecuteQuoteRequest, sampleRequest)).toBe(true);
    });

    it('OkxExecuteSwapRequest should be a superset of ExecuteSwapRequest', () => {
      const baseRequired = Base.ExecuteSwapRequest.required || [];
      const okxRequired = Okx.OkxExecuteSwapRequest.required || [];

      for (const field of baseRequired) {
        expect(okxRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.ExecuteSwapRequest.properties);
      const okxProps = Object.keys(Okx.OkxExecuteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(okxProps).toContain(prop);
      }

      const sampleRequest = {
        walletAddress: '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
        slippagePct: 0.5,
      };

      expect(Value.Check(Base.ExecuteSwapRequest, sampleRequest)).toBe(true);
      expect(Value.Check(Okx.OkxExecuteSwapRequest, sampleRequest)).toBe(true);
    });
  });

  describe('OKX-specific Fields', () => {
    it('OkxQuoteSwapRequest should include the BUY approximation flag', () => {
      const props = Object.keys(Okx.OkxQuoteSwapRequest.properties);
      expect(props).toContain('approximateIfNoExactOut');
    });

    it('OkxQuoteSwapResponse should include OKX-specific fields', () => {
      const props = Object.keys(Okx.OkxQuoteSwapResponse.properties);
      expect(props).toContain('routerResult');
      expect(props).toContain('approximation');
    });
  });

  describe('Field Examples and Defaults', () => {
    it('should have Solana mainnet-only network enum', () => {
      const networkProp = Okx.OkxQuoteSwapRequest.properties.network;
      expect(networkProp.default).toBe('mainnet-beta');
      expect(networkProp.enum).toEqual(['mainnet-beta']);
    });
  });
});
