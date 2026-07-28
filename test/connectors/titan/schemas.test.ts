import { Value } from '@sinclair/typebox/value';

import * as Titan from '../../../src/connectors/titan/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('Titan Schema Tests', () => {
  describe('Schema Superset Validation', () => {
    it('TitanQuoteSwapRequest should be a superset of QuoteSwapRequest', () => {
      const baseRequired = Base.QuoteSwapRequest.required || [];
      const titanRequired = Titan.TitanQuoteSwapRequest.required || [];

      for (const field of baseRequired) {
        expect(titanRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.QuoteSwapRequest.properties);
      const titanProps = Object.keys(Titan.TitanQuoteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(titanProps).toContain(prop);
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
      expect(Value.Check(Titan.TitanQuoteSwapRequest, sampleRequest)).toBe(true);
    });

    it('TitanQuoteSwapResponse should be a superset of QuoteSwapResponse', () => {
      const baseRequired = Base.QuoteSwapResponse.required || [];
      const titanRequired = Titan.TitanQuoteSwapResponse.required || [];

      for (const field of baseRequired) {
        expect(titanRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.QuoteSwapResponse.properties);
      const titanProps = Object.keys(Titan.TitanQuoteSwapResponse.properties);

      for (const prop of baseProps) {
        expect(titanProps).toContain(prop);
      }
    });

    it('TitanExecuteQuoteRequest should be a superset of ExecuteQuoteRequest', () => {
      const baseRequired = Base.ExecuteQuoteRequest.required || [];
      const titanRequired = Titan.TitanExecuteQuoteRequest.required || [];

      for (const field of baseRequired) {
        expect(titanRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.ExecuteQuoteRequest.properties);
      const titanProps = Object.keys(Titan.TitanExecuteQuoteRequest.properties);

      for (const prop of baseProps) {
        expect(titanProps).toContain(prop);
      }

      const sampleRequest = {
        walletAddress: '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
        network: 'mainnet-beta',
        quoteId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(Value.Check(Base.ExecuteQuoteRequest, sampleRequest)).toBe(true);
      expect(Value.Check(Titan.TitanExecuteQuoteRequest, sampleRequest)).toBe(true);
    });

    it('TitanExecuteSwapRequest should be a superset of ExecuteSwapRequest', () => {
      const baseRequired = Base.ExecuteSwapRequest.required || [];
      const titanRequired = Titan.TitanExecuteSwapRequest.required || [];

      for (const field of baseRequired) {
        expect(titanRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.ExecuteSwapRequest.properties);
      const titanProps = Object.keys(Titan.TitanExecuteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(titanProps).toContain(prop);
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
      expect(Value.Check(Titan.TitanExecuteSwapRequest, sampleRequest)).toBe(true);
    });
  });

  describe('Titan-specific Fields', () => {
    it('TitanQuoteSwapRequest should include wallet binding and the BUY approximation flag', () => {
      const props = Object.keys(Titan.TitanQuoteSwapRequest.properties);
      expect(props).toContain('walletAddress');
      expect(props).toContain('approximateIfNoExactOut');
    });

    it('TitanQuoteSwapResponse should include the bound wallet', () => {
      const props = Object.keys(Titan.TitanQuoteSwapResponse.properties);
      expect(props).toContain('wallet');
      expect(props).toContain('approximation');
    });
  });

  describe('Field Examples and Defaults', () => {
    it('should have Solana mainnet-only network enum', () => {
      const networkProp = Titan.TitanQuoteSwapRequest.properties.network;
      expect(networkProp.default).toBe('mainnet-beta');
      expect(networkProp.enum).toEqual(['mainnet-beta']);
    });
  });
});
