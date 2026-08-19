import { Type, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import * as Jupiter from '../../../src/connectors/jupiter/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('Jupiter Schema Tests', () => {
  describe('Schema Superset Validation', () => {
    it('JupiterQuoteSwapRequest should be a superset of QuoteSwapRequest', () => {
      // Get all required fields from base schema
      const baseRequired = Base.QuoteSwapRequest.required || [];
      const jupiterRequired = Jupiter.JupiterQuoteSwapRequest.required || [];

      // Check that all base required fields are in Jupiter schema
      for (const field of baseRequired) {
        expect(jupiterRequired).toContain(field);
      }

      // Check that all base properties exist in Jupiter schema
      const baseProps = Object.keys(Base.QuoteSwapRequest.properties);
      const jupiterProps = Object.keys(Jupiter.JupiterQuoteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(jupiterProps).toContain(prop);
      }

      // Verify a sample base request is valid for Jupiter schema
      const sampleRequest = {
        network: 'mainnet-beta',
        baseToken: 'SOL',
        quoteToken: 'USDC',
        amount: 1,
        side: 'SELL',
        slippagePct: 0.5,
      };

      expect(Value.Check(Base.QuoteSwapRequest, sampleRequest)).toBe(true);
      expect(Value.Check(Jupiter.JupiterQuoteSwapRequest, sampleRequest)).toBe(true);
    });

    it('JupiterQuoteSwapResponse should be a superset of QuoteSwapResponse', () => {
      // Get all required fields from base schema
      const baseRequired = Base.QuoteSwapResponse.required || [];
      const jupiterRequired = Jupiter.JupiterQuoteSwapResponse.required || [];

      // Check that all base required fields are in Jupiter schema
      for (const field of baseRequired) {
        expect(jupiterRequired).toContain(field);
      }

      // Check that all base properties exist in Jupiter schema
      const baseProps = Object.keys(Base.QuoteSwapResponse.properties);
      const jupiterProps = Object.keys(Jupiter.JupiterQuoteSwapResponse.properties);

      for (const prop of baseProps) {
        expect(jupiterProps).toContain(prop);
      }
    });

    it('JupiterExecuteQuoteRequest should be a superset of ExecuteQuoteRequest', () => {
      // Get all required fields from base schema
      const baseRequired = Base.ExecuteQuoteRequest.required || [];
      const jupiterRequired = Jupiter.JupiterExecuteQuoteRequest.required || [];

      // Check that all base required fields are in Jupiter schema
      for (const field of baseRequired) {
        expect(jupiterRequired).toContain(field);
      }

      // Check that all base properties exist in Jupiter schema
      const baseProps = Object.keys(Base.ExecuteQuoteRequest.properties);
      const jupiterProps = Object.keys(Jupiter.JupiterExecuteQuoteRequest.properties);

      for (const prop of baseProps) {
        expect(jupiterProps).toContain(prop);
      }

      // Verify a sample base request is valid for Jupiter schema
      const sampleRequest = {
        walletAddress: '7aaee2311351ac9e4de53bf981fd3c882969e4edcd8e858b4eac50f6b8a41112',
        network: 'mainnet-beta',
        quoteId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(Value.Check(Base.ExecuteQuoteRequest, sampleRequest)).toBe(true);
      expect(Value.Check(Jupiter.JupiterExecuteQuoteRequest, sampleRequest)).toBe(true);
    });

    it('JupiterExecuteSwapRequest should be a superset of ExecuteSwapRequest', () => {
      // Get all required fields from base schema
      const baseRequired = Base.ExecuteSwapRequest.required || [];
      const jupiterRequired = Jupiter.JupiterExecuteSwapRequest.required || [];

      // Check that all base required fields are in Jupiter schema
      for (const field of baseRequired) {
        expect(jupiterRequired).toContain(field);
      }

      // Check that all base properties exist in Jupiter schema
      const baseProps = Object.keys(Base.ExecuteSwapRequest.properties);
      const jupiterProps = Object.keys(Jupiter.JupiterExecuteSwapRequest.properties);

      for (const prop of baseProps) {
        expect(jupiterProps).toContain(prop);
      }

      // Verify a sample base request is valid for Jupiter schema
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
      expect(Value.Check(Jupiter.JupiterExecuteSwapRequest, sampleRequest)).toBe(true);
    });
  });

  describe('Jupiter-specific Fields', () => {
    // Routing policy (restrictIntermediateTokens/onlyDirectRoutes) and priority fees
    // (priorityLevel/maxLamports) are connector-config settings, not request params.
    // The one request-level knob shared by every Solana router is approximateIfNoExactOut.
    it('JupiterQuoteSwapRequest exposes only the standard router params', () => {
      const props = Object.keys(Jupiter.JupiterQuoteSwapRequest.properties);
      expect(props).toContain('approximateIfNoExactOut');
      expect(props).not.toContain('restrictIntermediateTokens');
      expect(props).not.toContain('onlyDirectRoutes');
    });

    it('JupiterExecuteQuoteRequest exposes no priority-fee params', () => {
      const props = Object.keys(Jupiter.JupiterExecuteQuoteRequest.properties);
      expect(props).not.toContain('priorityLevel');
      expect(props).not.toContain('maxLamports');
    });

    it('JupiterExecuteSwapRequest exposes only the standard router params', () => {
      const props = Object.keys(Jupiter.JupiterExecuteSwapRequest.properties);
      expect(props).toContain('approximateIfNoExactOut');
      expect(props).not.toContain('restrictIntermediateTokens');
      expect(props).not.toContain('priorityLevel');
    });

    it('JupiterQuoteSwapResponse should include Jupiter-specific fields', () => {
      const props = Object.keys(Jupiter.JupiterQuoteSwapResponse.properties);
      expect(props).toContain('quoteResponse');
    });
  });

  describe('Field Examples and Defaults', () => {
    it('should have Solana-specific examples in fields', () => {
      const networkProp = Jupiter.JupiterQuoteSwapRequest.properties.network;
      expect(networkProp.default).toBe('mainnet-beta');
      expect(networkProp.enum).toContain('mainnet-beta');

      const baseTokenProp = Jupiter.JupiterQuoteSwapRequest.properties.baseToken;
      expect(baseTokenProp.examples).toContain('SOL');

      const quoteTokenProp = Jupiter.JupiterQuoteSwapRequest.properties.quoteToken;
      expect(quoteTokenProp.examples).toContain('USDC');
    });
  });
});
