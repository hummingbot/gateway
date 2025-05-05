import {
  OpenPositionRequest,
  OpenPositionResponse
} from '../../../../src/schemas/trading-types/clmm-schema';
import { testSchemaAcrossConnectors } from '../../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'clmm-open-position',
  OpenPositionRequest,
  OpenPositionResponse
);