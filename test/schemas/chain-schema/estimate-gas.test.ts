import {
  EstimateGasRequestSchema,
  EstimateGasResponseSchema,
} from '../../../src/schemas/chain-schema';
import { testSchemaAcrossConnectors } from '../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'estimate-gas',
  EstimateGasRequestSchema,
  EstimateGasResponseSchema
);