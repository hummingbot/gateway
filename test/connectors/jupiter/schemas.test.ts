import { Type, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import * as Jupiter from '../../../src/connectors/jupiter/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('Jupiter Schema Tests', () => {
  describe('Schema Superset Validation', () => {
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
  });

  describe('Jupiter-specific Fields', () => {
    // Routing policy (restrictIntermediateTokens/onlyDirectRoutes) and priority fees
    // (priorityLevel/maxLamports) are connector-config settings, not request params.
    // The one request-level knob shared by every Solana router is approximateIfNoExactOut.
    it('JupiterQuoteSwapResponse should include Jupiter-specific fields', () => {
      const props = Object.keys(Jupiter.JupiterQuoteSwapResponse.properties);
      expect(props).toContain('quoteResponse');
    });
  });

  describe('Field Examples and Defaults', () => {});
});
