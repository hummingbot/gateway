/**
 * Helper configurations for mocking connector route files
 *
 * Note: jest.mock() must be called at the module level (before imports),
 * so these functions return mock configurations that you apply manually.
 * This still saves significant code by centralizing the mock structure.
 */

/**
 * Standard mock object for a connector route file
 */
export function createRouteMock(exportName: string, includeRoutePlugin: boolean = false): any {
  const mockObject: any = {
    [exportName]: jest.fn(),
    default: jest.fn().mockImplementation(async () => {}),
  };

  if (includeRoutePlugin) {
    mockObject[`${exportName}Route`] = jest.fn().mockImplementation(async () => {});
  }

  return mockObject;
}

/**
 * Get the list of Ethereum connector paths that need mocking
 * Returns: Array of {path, exportName, includeRoutePlugin}
 */
export function getEthereumConnectorMockPaths(
  basePath: string = '../../../../src/connectors',
  operation: 'quoteSwap' | 'executeSwap',
) {
  return [
    // Uniswap - router, amm, clmm
    { path: `${basePath}/uniswap/router-routes/${operation}`, exportName: operation },
    { path: `${basePath}/uniswap/amm-routes/${operation}`, exportName: operation },
    { path: `${basePath}/uniswap/clmm-routes/${operation}`, exportName: operation },
    // PancakeSwap - router, amm, clmm
    { path: `${basePath}/pancakeswap/router-routes/${operation}`, exportName: operation },
    { path: `${basePath}/pancakeswap/amm-routes/${operation}`, exportName: operation },
    { path: `${basePath}/pancakeswap/clmm-routes/${operation}`, exportName: operation },
    // 0x - router only
    { path: `${basePath}/0x/router-routes/${operation}`, exportName: operation },
  ];
}

/**
 * Get the list of Solana connector paths that need mocking
 * Returns: Array of {path, exportName, includeRoutePlugin}
 */
export function getSolanaConnectorMockPaths(
  basePath: string = '../../../../src/connectors',
  operation: 'quoteSwap' | 'executeSwap',
) {
  return [
    // Jupiter - router only
    { path: `${basePath}/jupiter/router-routes/${operation}`, exportName: operation, includeRoutePlugin: false },
    // Raydium - amm, clmm (with route plugins)
    { path: `${basePath}/raydium/amm-routes/${operation}`, exportName: operation, includeRoutePlugin: true },
    { path: `${basePath}/raydium/clmm-routes/${operation}`, exportName: operation, includeRoutePlugin: true },
    // Meteora - clmm only (with route plugins)
    { path: `${basePath}/meteora/clmm-routes/${operation}`, exportName: operation, includeRoutePlugin: true },
    // PancakeSwap-Sol - clmm only (with route plugins)
    { path: `${basePath}/pancakeswap-sol/clmm-routes/${operation}`, exportName: operation, includeRoutePlugin: true },
  ];
}
