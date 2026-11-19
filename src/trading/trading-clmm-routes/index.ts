export { openPositionRoute } from './open';
export { addLiquidityRoute } from './add';
export { removeLiquidityRoute } from './remove';
export { collectFeesRoute } from './collect-fees';
export { closePositionRoute } from './close';
export { createPoolRoute } from './create-pool';
export { buildCreatePoolRoute } from './build-create-pool';
export { fetchPoolsRoute } from './fetchPools';

// The request schemas, re-exported so app.ts can publish them as spec components.
// Registering a schema and referencing it are independent: `addSchema` puts it in
// components.schemas, while @fastify/swagger still expands a GET's querystring into
// `parameters`. So the GETs are published here too, and the operations are unchanged.
export { UnifiedOpenPositionRequest, BuildOpenPositionRequest } from './open';
export { UnifiedAddLiquidityRequest, BuildAddLiquidityRequest } from './add';
export { UnifiedRemoveLiquidityRequest, BuildRemoveLiquidityRequest } from './remove';
export { UnifiedCollectFeesRequest, BuildCollectFeesRequest } from './collect-fees';
export { UnifiedClosePositionRequest, BuildClosePositionRequest } from './close';
export { UnifiedClmmCreatePoolRequest } from './create-pool';
export { ClmmBuildCreatePoolRequest, ClmmBuildCreatePoolResponse } from './build-create-pool';
export { FetchPoolsRequestSchema } from './fetchPools';
