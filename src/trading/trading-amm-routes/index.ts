export { createPoolRoute } from './create-pool';
export { poolInfoRoute } from './pool-info';
export { positionInfoRoute } from './position-info';
export { positionsOwnedRoute } from './positions-owned';
export { quoteLiquidityRoute } from './quote-liquidity';
export { addLiquidityRoute } from './add';
export { removeLiquidityRoute } from './remove';

// The request bodies, re-exported so app.ts can publish them as spec components. Only
// the POSTs appear here: the GET routes carry their fields as `parameters`, which never
// enter components.schemas.
export { UnifiedCreatePoolRequest } from './create-pool';
export { UnifiedAmmAddLiquidityRequest } from './add';
export { UnifiedAmmRemoveLiquidityRequest } from './remove';

// The GET querystrings. Registering these publishes them as components; the routes still
// expand their fields into `parameters`, so the operations are unchanged and a generated
// client gains a request model for the reads.
export { UnifiedAmmPoolInfoRequest } from './pool-info';
export { UnifiedAmmPositionInfoRequest } from './position-info';
export { UnifiedAmmPositionsOwnedRequest } from './positions-owned';
export { UnifiedAmmQuoteLiquidityRequest } from './quote-liquidity';
