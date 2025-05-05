import {
  AddLiquidityRequest,
  AddLiquidityResponse
} from '../../../../src/schemas/trading-types/amm-schema';
import { testSchemaAcrossConnectors } from '../../utils/schema-test-utils';

// Run tests across all connectors that implement this schema
testSchemaAcrossConnectors(
  'amm-add-liquidity',
  AddLiquidityRequest,
  AddLiquidityResponse
);