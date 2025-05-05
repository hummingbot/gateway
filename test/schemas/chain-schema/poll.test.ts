import {
  PollRequestSchema,
  PollResponseSchema,
} from '../../../src/schemas/chain-schema';
import { testSchemaAcrossConnectors } from '../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'poll',
  PollRequestSchema,
  PollResponseSchema
);