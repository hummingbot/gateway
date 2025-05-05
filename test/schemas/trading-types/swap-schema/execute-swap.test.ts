import {
  ExecuteSwapRequest,
  ExecuteSwapResponse
} from '../../../../src/schemas/trading-types/swap-schema';
import { testSchemaAcrossConnectors } from '../../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'swap-execute',
  ExecuteSwapRequest,
  ExecuteSwapResponse
);