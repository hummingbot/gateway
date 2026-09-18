import { Value } from '@sinclair/typebox/value';

import * as DFlow from '../../../src/connectors/dflow/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('DFlow Schema Tests', () => {
  describe('Schema Superset Validation', () => {
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
  });

  describe('DFlow-specific Fields', () => {
    it('DFlowQuoteSwapResponse should include DFlow-specific fields', () => {
      const props = Object.keys(DFlow.DFlowQuoteSwapResponse.properties);
      expect(props).toContain('quoteResponse');
      expect(props).toContain('approximation');
    });
  });

  describe('Field Examples and Defaults', () => {});
});
