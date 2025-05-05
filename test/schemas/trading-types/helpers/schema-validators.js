/**
 * Shared schema validation utilities for trading-type tests
 * These helpers help reduce duplication across test files
 */

// For validating common pool info properties across different pool types
function validateCommonPoolInfo(poolInfo) {
  expect(poolInfo).toHaveProperty('address');
  expect(poolInfo).toHaveProperty('baseTokenAddress');
  expect(poolInfo).toHaveProperty('quoteTokenAddress');
  expect(poolInfo).toHaveProperty('feePct');
  expect(poolInfo).toHaveProperty('price');
  expect(poolInfo).toHaveProperty('baseTokenAmount');
  expect(poolInfo).toHaveProperty('quoteTokenAmount');
  
  // Type validations
  expect(typeof poolInfo.address).toBe('string');
  expect(typeof poolInfo.baseTokenAddress).toBe('string');
  expect(typeof poolInfo.quoteTokenAddress).toBe('string');
  expect(typeof poolInfo.feePct).toBe('number');
  expect(typeof poolInfo.price).toBe('number');
  expect(typeof poolInfo.baseTokenAmount).toBe('number');
  expect(typeof poolInfo.quoteTokenAmount).toBe('number');
  
  // Range validations
  expect(poolInfo.feePct).toBeGreaterThanOrEqual(0);
  expect(poolInfo.feePct).toBeLessThanOrEqual(1);
  expect(poolInfo.price).toBeGreaterThan(0);
  expect(poolInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
  expect(poolInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
}

// For validating AMM-specific pool properties
function validateAmmPoolInfo(poolInfo) {
  validateCommonPoolInfo(poolInfo);
  
  // AMM-specific properties
  expect(poolInfo).toHaveProperty('poolType');
  expect(poolInfo).toHaveProperty('lpMint');
  expect(poolInfo.lpMint).toHaveProperty('address');
  expect(poolInfo.lpMint).toHaveProperty('decimals');
  
  // Type validations
  expect(typeof poolInfo.poolType).toBe('string');
  expect(typeof poolInfo.lpMint).toBe('object');
  expect(typeof poolInfo.lpMint.address).toBe('string');
  expect(typeof poolInfo.lpMint.decimals).toBe('number');
  
  // Value validations
  expect(poolInfo.poolType).toBe('amm');
}

// For validating CLMM-specific pool properties
function validateClmmPoolInfo(poolInfo) {
  validateCommonPoolInfo(poolInfo);
  
  // CLMM-specific properties
  expect(poolInfo).toHaveProperty('binStep');
  expect(poolInfo).toHaveProperty('activeBinId');
  
  // Type validations
  expect(typeof poolInfo.binStep).toBe('number');
  expect(typeof poolInfo.activeBinId).toBe('number');
  
  // Range validations
  expect(poolInfo.binStep).toBeGreaterThan(0);
}

// For validating position info
function validatePositionInfo(positionInfo, type = 'amm') {
  // Common validations
  expect(positionInfo).toHaveProperty('poolAddress');
  expect(positionInfo).toHaveProperty('baseTokenAddress');
  expect(positionInfo).toHaveProperty('quoteTokenAddress');
  expect(positionInfo).toHaveProperty('price');
  
  // Type validations
  expect(typeof positionInfo.poolAddress).toBe('string');
  expect(typeof positionInfo.baseTokenAddress).toBe('string');
  expect(typeof positionInfo.quoteTokenAddress).toBe('string');
  expect(typeof positionInfo.price).toBe('number');
  
  if (type === 'amm') {
    // AMM-specific validations
    expect(positionInfo).toHaveProperty('walletAddress');
    expect(positionInfo).toHaveProperty('lpTokenAmount');
    expect(positionInfo).toHaveProperty('baseTokenAmount');
    expect(positionInfo).toHaveProperty('quoteTokenAmount');
    
    expect(typeof positionInfo.walletAddress).toBe('string');
    expect(typeof positionInfo.lpTokenAmount).toBe('number');
    expect(typeof positionInfo.baseTokenAmount).toBe('number');
    expect(typeof positionInfo.quoteTokenAmount).toBe('number');
    
    expect(positionInfo.lpTokenAmount).toBeGreaterThanOrEqual(0);
  } else if (type === 'clmm') {
    // CLMM-specific validations
    expect(positionInfo).toHaveProperty('address');
    expect(positionInfo).toHaveProperty('baseTokenAmount');
    expect(positionInfo).toHaveProperty('quoteTokenAmount');
    expect(positionInfo).toHaveProperty('baseFeeAmount');
    expect(positionInfo).toHaveProperty('quoteFeeAmount');
    expect(positionInfo).toHaveProperty('lowerBinId');
    expect(positionInfo).toHaveProperty('upperBinId');
    expect(positionInfo).toHaveProperty('lowerPrice');
    expect(positionInfo).toHaveProperty('upperPrice');
    
    expect(typeof positionInfo.address).toBe('string');
    expect(typeof positionInfo.baseTokenAmount).toBe('number');
    expect(typeof positionInfo.quoteTokenAmount).toBe('number');
    expect(typeof positionInfo.baseFeeAmount).toBe('number');
    expect(typeof positionInfo.quoteFeeAmount).toBe('number');
    expect(typeof positionInfo.lowerBinId).toBe('number');
    expect(typeof positionInfo.upperBinId).toBe('number');
    expect(typeof positionInfo.lowerPrice).toBe('number');
    expect(typeof positionInfo.upperPrice).toBe('number');
    
    // Range and relationship validations
    expect(positionInfo.lowerBinId).toBeLessThan(positionInfo.upperBinId);
    expect(positionInfo.lowerPrice).toBeLessThan(positionInfo.upperPrice);
    expect(positionInfo.price).toBeGreaterThanOrEqual(positionInfo.lowerPrice);
    expect(positionInfo.price).toBeLessThanOrEqual(positionInfo.upperPrice);
  }
  
  // Common ranges
  expect(positionInfo.baseTokenAmount).toBeGreaterThanOrEqual(0);
  expect(positionInfo.quoteTokenAmount).toBeGreaterThanOrEqual(0);
  expect(positionInfo.price).toBeGreaterThan(0);
}

// For validating swap quotes
function validateSwapQuote(swapQuote, side = 'SELL') {
  // Common properties
  expect(swapQuote).toHaveProperty('estimatedAmountIn');
  expect(swapQuote).toHaveProperty('estimatedAmountOut');
  expect(swapQuote).toHaveProperty('minAmountOut');
  expect(swapQuote).toHaveProperty('maxAmountIn');
  expect(swapQuote).toHaveProperty('baseTokenBalanceChange');
  expect(swapQuote).toHaveProperty('quoteTokenBalanceChange');
  expect(swapQuote).toHaveProperty('price');
  
  // Type validations
  expect(typeof swapQuote.estimatedAmountIn).toBe('number');
  expect(typeof swapQuote.estimatedAmountOut).toBe('number');
  expect(typeof swapQuote.minAmountOut).toBe('number');
  expect(typeof swapQuote.maxAmountIn).toBe('number');
  expect(typeof swapQuote.baseTokenBalanceChange).toBe('number');
  expect(typeof swapQuote.quoteTokenBalanceChange).toBe('number');
  expect(typeof swapQuote.price).toBe('number');
  
  // Sometimes present
  if (swapQuote.poolAddress) {
    expect(typeof swapQuote.poolAddress).toBe('string');
  }
  
  if (swapQuote.gasPrice) {
    expect(swapQuote).toHaveProperty('gasLimit');
    expect(swapQuote).toHaveProperty('gasCost');
    expect(typeof swapQuote.gasPrice).toBe('number');
    expect(typeof swapQuote.gasLimit).toBe('number');
    expect(typeof swapQuote.gasCost).toBe('number');
  }
  
  // Range validations
  expect(swapQuote.estimatedAmountIn).toBeGreaterThan(0);
  expect(swapQuote.estimatedAmountOut).toBeGreaterThan(0);
  expect(swapQuote.minAmountOut).toBeLessThanOrEqual(swapQuote.estimatedAmountOut);
  expect(swapQuote.maxAmountIn).toBeGreaterThanOrEqual(swapQuote.estimatedAmountIn);
  expect(swapQuote.price).toBeGreaterThan(0);
  
  // Token balance changes have opposite signs (one positive, one negative)
  expect(Math.sign(swapQuote.baseTokenBalanceChange) * Math.sign(swapQuote.quoteTokenBalanceChange)).toBeLessThan(0);
  
  // Side-specific validations
  if (side === 'SELL') {
    // Selling base token for quote token
    expect(swapQuote.baseTokenBalanceChange).toBeLessThan(0);
    expect(swapQuote.quoteTokenBalanceChange).toBeGreaterThan(0);
  } else if (side === 'BUY') {
    // Buying base token with quote token
    expect(swapQuote.baseTokenBalanceChange).toBeGreaterThan(0);
    expect(swapQuote.quoteTokenBalanceChange).toBeLessThan(0);
  }
}

// For validating common operation response properties (signatures, fees)
function validateOperationResponse(response) {
  expect(response).toHaveProperty('signature');
  expect(response).toHaveProperty('fee');
  
  expect(typeof response.signature).toBe('string');
  expect(typeof response.fee).toBe('number');
  
  expect(response.fee).toBeGreaterThanOrEqual(0);
}

// For validating add liquidity responses
function validateAddLiquidityResponse(response) {
  validateOperationResponse(response);
  
  expect(response).toHaveProperty('baseTokenAmountAdded');
  expect(response).toHaveProperty('quoteTokenAmountAdded');
  
  expect(typeof response.baseTokenAmountAdded).toBe('number');
  expect(typeof response.quoteTokenAmountAdded).toBe('number');
  
  expect(response.baseTokenAmountAdded).toBeGreaterThanOrEqual(0);
  expect(response.quoteTokenAmountAdded).toBeGreaterThanOrEqual(0);
}

// For validating remove liquidity responses
function validateRemoveLiquidityResponse(response) {
  validateOperationResponse(response);
  
  expect(response).toHaveProperty('baseTokenAmountRemoved');
  expect(response).toHaveProperty('quoteTokenAmountRemoved');
  
  expect(typeof response.baseTokenAmountRemoved).toBe('number');
  expect(typeof response.quoteTokenAmountRemoved).toBe('number');
  
  expect(response.baseTokenAmountRemoved).toBeGreaterThanOrEqual(0);
  expect(response.quoteTokenAmountRemoved).toBeGreaterThanOrEqual(0);
}

// For validating execute swap responses
function validateExecuteSwapResponse(response) {
  validateOperationResponse(response);
  
  expect(response).toHaveProperty('totalInputSwapped');
  expect(response).toHaveProperty('totalOutputSwapped');
  expect(response).toHaveProperty('baseTokenBalanceChange');
  expect(response).toHaveProperty('quoteTokenBalanceChange');
  
  expect(typeof response.totalInputSwapped).toBe('number');
  expect(typeof response.totalOutputSwapped).toBe('number');
  expect(typeof response.baseTokenBalanceChange).toBe('number');
  expect(typeof response.quoteTokenBalanceChange).toBe('number');
  
  expect(response.totalInputSwapped).toBeGreaterThan(0);
  expect(response.totalOutputSwapped).toBeGreaterThan(0);
  
  // Token balance changes have opposite signs (one positive, one negative)
  expect(Math.sign(response.baseTokenBalanceChange) * Math.sign(response.quoteTokenBalanceChange)).toBeLessThan(0);
}

module.exports = {
  validateCommonPoolInfo,
  validateAmmPoolInfo,
  validateClmmPoolInfo,
  validatePositionInfo,
  validateSwapQuote,
  validateOperationResponse,
  validateAddLiquidityResponse,
  validateRemoveLiquidityResponse,
  validateExecuteSwapResponse
};