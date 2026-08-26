import { Value } from '@sinclair/typebox/value';

import * as Okx from '../../../src/connectors/okx/schemas';
import * as Base from '../../../src/schemas/router-schema';

describe('OKX Schema Tests', () => {
  describe('Schema Superset Validation', () => {
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
  });

  describe('OKX-specific Fields', () => {
    it('OkxQuoteSwapResponse should include OKX-specific fields', () => {
      const props = Object.keys(Okx.OkxQuoteSwapResponse.properties);
      expect(props).toContain('routerResult');
      expect(props).toContain('approximation');
    });
  });

  describe('Field Examples and Defaults', () => {});
});
