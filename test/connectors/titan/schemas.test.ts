import { Value } from '@sinclair/typebox/value';

import * as Titan from '../../../src/connectors/titan/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('Titan Schema Tests', () => {
  describe('Schema Superset Validation', () => {
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
  });

  describe('Titan-specific Fields', () => {
    it('TitanQuoteSwapResponse should include the bound wallet', () => {
      const props = Object.keys(Titan.TitanQuoteSwapResponse.properties);
      expect(props).toContain('wallet');
      expect(props).toContain('approximation');
    });
  });

  describe('Field Examples and Defaults', () => {});
});
