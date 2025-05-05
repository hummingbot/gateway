import {
  TokensRequestSchema,
  TokensResponseSchema,
} from '../../../src/schemas/chain-schema';
import { testSchemaAcrossConnectors } from '../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'tokens',
  TokensRequestSchema,
  TokensResponseSchema
);