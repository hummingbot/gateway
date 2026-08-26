/**
 * The name each operation carries in a generated client.
 *
 * Without an `operationId` every generator invents one from the method and path, so the
 * method a caller wrote against is renamed by any path change — the same churn that
 * `refResolver` exists to keep out of the component names. Deriving them here from the
 * path would reproduce exactly that, so they are chosen instead: a rename moves the key
 * and leaves the name a caller depends on alone.
 *
 * They read as `<verb><Subject>` rather than mirroring the URL, because a client calls
 * `gateway.openClmmPosition(...)`, not `gateway.postTradingClmmOpen(...)`.
 *
 * Keyed by `METHOD path` exactly as the route table spells it.
 * `test/spec/operation-ids.test.ts` holds this to every route, in both directions.
 */
export const OPERATION_IDS: Record<string, string> = {
  // Server lifecycle
  'POST /restart': 'restartGateway',

  // System configuration
  'GET /config/': 'getConfig',
  'POST /config/update': 'updateConfig',
  'GET /config/chains': 'listChains',
  'GET /config/connectors': 'listConnectors',
  'GET /config/namespaces': 'listNamespaces',

  // Wallets
  'GET /wallet/': 'listWallets',
  'POST /wallet/add': 'addWallet',
  'POST /wallet/add-hardware': 'addHardwareWallet',
  'DELETE /wallet/remove': 'removeWallet',
  'POST /wallet/setDefault': 'setDefaultWallet',

  // Tokens
  'GET /tokens/': 'listTokens',
  'POST /tokens/': 'addToken',
  'GET /tokens/{symbolOrAddress}': 'getToken',
  'GET /tokens/find/{address}': 'findToken',
  'POST /tokens/save/{address}': 'saveToken',
  'DELETE /tokens/{address}': 'removeToken',

  // Pools
  'GET /pools/': 'listPools',
  'POST /pools/': 'addPool',
  'GET /pools/{tradingPair}': 'getPool',
  'GET /pools/find': 'findPools',
  'GET /pools/find/{address}': 'findPool',
  'POST /pools/save/{address}': 'savePool',
  'DELETE /pools/{address}': 'removePool',

  // Chains
  'GET /chains/{chain}/status': 'getChainStatus',
  'GET /chains/{chain}/estimate-gas': 'estimateGas',
  'POST /chains/{chain}/balances': 'getBalances',
  'POST /chains/{chain}/poll': 'pollTransaction',
  'POST /chains/{chain}/wrap': 'wrapNativeToken',
  'POST /chains/{chain}/unwrap': 'unwrapNativeToken',
  'POST /chains/ethereum/allowances': 'getAllowances',
  'POST /chains/ethereum/approve': 'approveToken',

  // Router swaps
  'GET /trading/router/quote-swap': 'quoteRouterSwap',
  'POST /trading/router/execute-quote': 'executeRouterQuote',
  'POST /trading/router/execute-swap': 'executeRouterSwap',

  // Concentrated liquidity
  'GET /trading/clmm/quote-swap': 'quoteClmmSwap',
  'POST /trading/clmm/execute-swap': 'executeClmmSwap',
  'GET /trading/clmm/pool-info': 'getClmmPoolInfo',
  'GET /trading/clmm/fetch-pools': 'fetchClmmPools',
  'POST /trading/clmm/create-pool': 'createClmmPool',
  'GET /trading/clmm/position-info': 'getClmmPositionInfo',
  'GET /trading/clmm/positions-owned': 'listClmmPositions',
  'GET /trading/clmm/quote-liquidity': 'quoteClmmLiquidity',
  'POST /trading/clmm/open': 'openClmmPosition',
  'POST /trading/clmm/add': 'addClmmLiquidity',
  'POST /trading/clmm/remove': 'removeClmmLiquidity',
  'POST /trading/clmm/collect-fees': 'collectClmmFees',
  'POST /trading/clmm/close': 'closeClmmPosition',

  // Constant product
  'GET /trading/amm/quote-swap': 'quoteAmmSwap',
  'POST /trading/amm/execute-swap': 'executeAmmSwap',
  'GET /trading/amm/pool-info': 'getAmmPoolInfo',
  'POST /trading/amm/create-pool': 'createAmmPool',
  'GET /trading/amm/position-info': 'getAmmPositionInfo',
  'GET /trading/amm/positions-owned': 'listAmmPositions',
  'GET /trading/amm/quote-liquidity': 'quoteAmmLiquidity',
  'POST /trading/amm/add': 'addAmmLiquidity',
  'POST /trading/amm/remove': 'removeAmmLiquidity',
};
