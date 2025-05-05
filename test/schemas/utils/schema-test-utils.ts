// Set test environment variables
process.env.GATEWAY_TEST_MODE = 'dev';
process.env.NODE_ENV = 'test';

import { Type, Static } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import * as fs from 'fs';
import * as path from 'path';

// Generic schema validation function
export function validateSchema(schema: any, data: any): { valid: boolean; errors?: any[] } {
  const C = TypeCompiler.Compile(schema);
  const valid = C.Check(data);
  
  if (!valid) {
    return { valid, errors: [...C.Errors(data)] };
  }
  
  return { valid };
}

// Create a test Fastify instance with type validation
export function createTestFastifyApp() {
  const app = Fastify({
    logger: false
  });
  
  app.withTypeProvider<TypeBoxTypeProvider>();
  return app;
}

// Load test parameters for a specific connector and schema type
export function loadTestParams(connector: string, schemaType: string): any[] {
  const paramsPath = path.join(__dirname, '..', 'test-params', connector, `${schemaType}.json`);
  
  try {
    const fileContent = fs.readFileSync(paramsPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.warn(`No test parameters found for ${connector}/${schemaType}`);
    return [];
  }
}

// Load mock responses for a specific connector and schema type
export function loadMockResponses(connector: string, schemaType: string): any[] {
  const responsesPath = path.join(__dirname, '..', 'mock-responses', connector, `${schemaType}.json`);
  
  try {
    const fileContent = fs.readFileSync(responsesPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.warn(`No mock responses found for ${connector}/${schemaType}`);
    return [];
  }
}

// Enhanced test request validation with detailed error reporting
export function testRequestValidation(schema: any, validData: any, invalidData: any): void {
  describe('Request Validation', () => {
    it('should validate correct request data', () => {
      const result = validateSchema(schema, validData);
      if (!result.valid && result.errors) {
        console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.valid).toBe(true);
    });

    it('should reject invalid request data', () => {
      const result = validateSchema(schema, invalidData);
      expect(result.valid).toBe(false);
    });
  });
}

// Enhanced test response validation with detailed error reporting
export function testResponseValidation(schema: any, validData: any, invalidData: any): void {
  describe('Response Validation', () => {
    it('should validate correct response data', () => {
      const result = validateSchema(schema, validData);
      if (!result.valid && result.errors) {
        console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.valid).toBe(true);
    });

    it('should reject invalid response data', () => {
      const result = validateSchema(schema, invalidData);
      expect(result.valid).toBe(false);
    });
  });
}

// Test field constraints in a request schema
export function testRequestFieldConstraints(schema: any, baseRequest: any, fieldTests: {field: string, validValue: any, invalidValue: any, description: string}[]): void {
  describe('Request Field Constraints', () => {
    for (const test of fieldTests) {
      describe(`Field: ${test.field} - ${test.description}`, () => {
        it('should accept valid value', () => {
          const testRequest = { ...baseRequest, [test.field]: test.validValue };
          const result = validateSchema(schema, testRequest);
          if (!result.valid && result.errors) {
            console.error('Validation errors:', JSON.stringify(result.errors, null, 2));
          }
          expect(result.valid).toBe(true);
        });

        it('should reject invalid value', () => {
          const testRequest = { ...baseRequest, [test.field]: test.invalidValue };
          const result = validateSchema(schema, testRequest);
          expect(result.valid).toBe(false);
        });
      });
    }
  });
}

// Common test parameters for various blockchain networks
export const COMMON_TEST_CONSTANTS = {
  SOLANA: {
    NETWORK: 'mainnet',
    TEST_WALLET_ADDRESS: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
    TOKENS: {
      SOL: {
        symbol: 'SOL',
        address: 'So11111111111111111111111111111111111111112',
        decimals: 9,
        name: 'Wrapped SOL'
      },
      USDC: {
        symbol: 'USDC',
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        name: 'USD Coin'
      },
      USDT: {
        symbol: 'USDT',
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        decimals: 6,
        name: 'USDT'
      }
    },
    POOLS: {
      'SOL-USDC': 'CS2H8nbAVVEUHWPF5extCSymqheQdkd4d7thik6eet9N',
      'SOL-USDT': '7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX',
    }
  },
  ETHEREUM: {
    NETWORK: 'base',
    TEST_WALLET_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    TOKENS: {
      ETH: {
        symbol: 'ETH',
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        decimals: 18,
        name: 'Ether'
      },
      WETH: {
        symbol: 'WETH',
        address: '0x4200000000000000000000000000000000000006',
        decimals: 18,
        name: 'Wrapped Ether'
      },
      USDC: {
        symbol: 'USDC',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        name: 'USD Coin'
      }
    },
    POOLS: {
      'ETH-USDC': '0x4c36388be6f416a29c8d8eee81c771ce6be14b18',
      'ETH-USDC-0.05': '0x4c36388be6f416a29c8d8eee81c771ce6be14b18',
      'ETH-USDC-0.3': '0x17c14d2c404d167802b16c450d3c99f88f2c4fd4',
    }
  }
};

// Find all available connector test parameter directories
export function getAvailableConnectors(): string[] {
  const testParamsDir = path.join(__dirname, '..', 'test-params');
  
  try {
    return fs.readdirSync(testParamsDir).filter(item => {
      const itemPath = path.join(testParamsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
  } catch (error) {
    console.warn('Error reading test-params directory:', error);
    return [];
  }
}

// Advanced test helper that runs schema tests for all available connectors
export function testSchemaAcrossConnectors(
  schemaType: string,
  requestSchema: any,
  responseSchema: any,
  options: {
    testFieldConstraints?: boolean;
    extraRequestTests?: (connector: string, testCase: any) => void;
    extraResponseTests?: (connector: string, mockResponse: any) => void;
  } = {}
): void {
  const connectors = getAvailableConnectors();
  
  for (const connector of connectors) {
    describe(`${connector} - ${schemaType} Schema Tests`, () => {
      const testParams = loadTestParams(connector, schemaType);
      const mockResponses = loadMockResponses(connector, schemaType);
      
      if (testParams.length === 0 || mockResponses.length === 0) {
        it.skip(`Skipping tests for ${connector} (missing test data)`, () => {});
        return; // Use return instead of continue for proper control flow
      }
      
      for (let i = 0; i < Math.min(testParams.length, mockResponses.length); i++) {
        const testCase = testParams[i];
        const mockResponse = mockResponses[i];
        
        describe(`Test Case ${i + 1}: ${testCase.description || ''}`, () => {
          // Test request validation
          testRequestValidation(
            requestSchema,
            testCase.validRequest,
            testCase.invalidRequest
          );
          
          // Test response validation
          testResponseValidation(
            responseSchema,
            mockResponse.validResponse,
            mockResponse.invalidResponse
          );
          
          // Optional field constraint tests
          if (options.testFieldConstraints && testCase.fieldTests) {
            testRequestFieldConstraints(
              requestSchema,
              testCase.validRequest,
              testCase.fieldTests
            );
          }
          
          // Optional custom request tests
          if (options.extraRequestTests) {
            describe('Additional Request Tests', () => {
              options.extraRequestTests(connector, testCase);
            });
          }
          
          // Optional custom response tests
          if (options.extraResponseTests) {
            describe('Additional Response Tests', () => {
              options.extraResponseTests(connector, mockResponse);
            });
          }
        });
      }
    });
  }
}

// Helper to generate standard test parameters
export function createStandardTestParams(
  baseRequest: any,
  invalidFields: {field: string, value: any}[] = [],
  description: string = 'Standard test case'
): any {
  // Create a copy of valid request
  const validRequest = { ...baseRequest };
  
  // Create invalid request by combining valid request with first invalid field
  const invalidRequest = { 
    ...baseRequest,
    [invalidFields[0].field]: invalidFields[0].value 
  };
  
  // Create field tests for all invalid fields
  const fieldTests = invalidFields.map(item => ({
    field: item.field,
    validValue: baseRequest[item.field],
    invalidValue: item.value,
    description: `Testing invalid ${item.field}`
  }));
  
  return {
    description,
    validRequest,
    invalidRequest,
    fieldTests
  };
}

// Helper to generate standard mock responses
export function createStandardMockResponse(
  validResponse: any,
  invalidFields: {field: string, value: any}[] = []
): any {
  // Create invalid response by combining valid response with first invalid field
  const invalidResponse = {
    ...validResponse,
    [invalidFields[0].field]: invalidFields[0].value
  };
  
  return {
    validResponse,
    invalidResponse,
    fieldTests: invalidFields.map(item => ({
      field: item.field,
      validValue: validResponse[item.field],
      invalidValue: item.value,
      description: `Testing invalid ${item.field}`
    }))
  };
}