import {
  GetPoolInfoRequest,
  PoolInfoSchema
} from '../../../../src/schemas/trading-types/amm-schema';
import { testSchemaAcrossConnectors } from '../../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'amm-pool-info',
  GetPoolInfoRequest,
  PoolInfoSchema
);