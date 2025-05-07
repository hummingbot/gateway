const fs = require('fs');
const path = require('path');
const { GetSwapQuoteRequest, ExecuteSwapRequest } = require('../../../../src/schemas/trading-types/swap-schema');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Initialize Ajv
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load mock responses
const quoteSwapMocks = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../mocks/connectors/raydium/launchpad/quote-swap.json'), 'utf8')
);
const executeSwapMocks = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../mocks/connectors/raydium/launchpad/execute-swap.json'), 'utf8')
);

// Compile validators
const validateQuoteSwapResponse = ajv.compile(GetSwapQuoteRequest.responses[200]);
const validateExecuteSwapResponse = ajv.compile(ExecuteSwapRequest.responses[200]);

describe('Raydium Launchpad API', () => {
  describe('Swap Quote Endpoint', () => {
    it('should validate correct quote swap responses', () => {
      quoteSwapMocks.forEach((mock) => {
        const isValid = validateQuoteSwapResponse(mock.validResponse);
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid quote swap responses', () => {
      quoteSwapMocks.forEach((mock) => {
        const isValid = validateQuoteSwapResponse(mock.invalidResponse);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Execute Swap Endpoint', () => {
    it('should validate correct execute swap responses', () => {
      executeSwapMocks.forEach((mock) => {
        const isValid = validateExecuteSwapResponse(mock.validResponse);
        expect(isValid).toBe(true);
      });
    });

    it('should reject invalid execute swap responses', () => {
      executeSwapMocks.forEach((mock) => {
        const isValid = validateExecuteSwapResponse(mock.invalidResponse);
        expect(isValid).toBe(false);
      });
    });
  });
});