import { Value } from '@sinclair/typebox/value';

import * as DFlow from '../../../src/connectors/dflow/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('DFlow Schema Tests', () => {
  describe('Schema Superset Validation', () => {
    it('DFlowQuoteSwapRequest should be a superset of QuoteSwapRequest', () => {
      const baseRequired = Base.QuoteSwapRequest.required || [];
      const dflowRequired = DFlow.DFlowQuoteSwapRequest.required || [];

      for (const field of baseRequired) {
        expect(dflowRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.QuoteSwapRequest.properties);
      const dflowProps = Object.keys(DFlow.DFlowQuoteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(dflowProps).toContain(prop);
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
      expect(Value.Check(DFlow.DFlowQuoteSwapRequest, sampleRequest)).toBe(true);
    });

    it('DFlowQuoteSwapResponse should be a superset of QuoteSwapResponse', () => {
      const baseRequired = Base.QuoteSwapResponse.required || [];
      const dflowRequired = DFlow.DFlowQuoteSwapResponse.required || [];

      for (const field of baseRequired) {
        expect(dflowRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.QuoteSwapResponse.properties);
      const dflowProps = Object.keys(DFlow.DFlowQuoteSwapResponse.properties);

      for (const prop of baseProps) {
        expect(dflowProps).toContain(prop);
      }
    });

    it('DFlowExecuteQuoteRequest should be a superset of ExecuteQuoteRequest', () => {
      const baseRequired = Base.ExecuteQuoteRequest.required || [];
      const dflowRequired = DFlow.DFlowExecuteQuoteRequest.required || [];

      for (const field of baseRequired) {
        expect(dflowRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.ExecuteQuoteRequest.properties);
      const dflowProps = Object.keys(DFlow.DFlowExecuteQuoteRequest.properties);

      for (const prop of baseProps) {
        expect(dflowProps).toContain(prop);
      }

      const sampleRequest = {
        walletAddress: '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
        network: 'mainnet-beta',
        quoteId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(Value.Check(Base.ExecuteQuoteRequest, sampleRequest)).toBe(true);
      expect(Value.Check(DFlow.DFlowExecuteQuoteRequest, sampleRequest)).toBe(true);
    });

    it('DFlowExecuteSwapRequest should be a superset of ExecuteSwapRequest', () => {
      const baseRequired = Base.ExecuteSwapRequest.required || [];
      const dflowRequired = DFlow.DFlowExecuteSwapRequest.required || [];

      for (const field of baseRequired) {
        expect(dflowRequired).toContain(field);
      }

      const baseProps = Object.keys(Base.ExecuteSwapRequest.properties);
      const dflowProps = Object.keys(DFlow.DFlowExecuteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(dflowProps).toContain(prop);
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
      expect(Value.Check(DFlow.DFlowExecuteSwapRequest, sampleRequest)).toBe(true);
    });
  });

  describe('DFlow-specific Fields', () => {
    it('DFlowQuoteSwapRequest should include the BUY approximation flag', () => {
      const props = Object.keys(DFlow.DFlowQuoteSwapRequest.properties);
      expect(props).toContain('approximateIfNoExactOut');
    });

    it('DFlowQuoteSwapResponse should include DFlow-specific fields', () => {
      const props = Object.keys(DFlow.DFlowQuoteSwapResponse.properties);
      expect(props).toContain('quoteResponse');
      expect(props).toContain('approximation');
    });
  });

  describe('Field Examples and Defaults', () => {
    it('should have Solana mainnet-only network enum', () => {
      const networkProp = DFlow.DFlowQuoteSwapRequest.properties.network;
      expect(networkProp.default).toBe('mainnet-beta');
      expect(networkProp.enum).toEqual(['mainnet-beta']);
    });
  });
});
