/**
 * Test factories for creating sample test data
 * These factories help create consistent test data across all tests
 */

// Define token and network constants
const NETWORKS = {
  ethereum: {
    mainnet: 'mainnet',
    base: 'base'
  },
  solana: {
    mainnet: 'mainnet-beta',
    devnet: 'devnet'
  }
};

const TOKENS = {
  ethereum: {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  },
  solana: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  }
};

const SAMPLE_ADDRESSES = {
  ethereum: {
    wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    ammPool: '0x4c36388be6f416a29c8d8eee81c771ce6be14b18',
    clmmPool: '0x17c14d2c404d167802b16c450d3c99f88f2c4fd4',
    position: '0x1234567890123456789012345678901234567890'
  },
  solana: {
    wallet: 'AabEVCB1sWgCPxbn6hFYM4Ukj7UubpBRbbYqRnqRXnZD',
    ammPool: 'CS2H8nbAVVEUHWPF5extCSymqheQdkd4d7thik6eet9N',
    clmmPool: '7quzvT3yBcbxLMGxbvHBwrXuUeN5xHPGUXUm6eKwLMsW',
    position: '8auCnkYLHhYJLGk8s9Vb1A3hbQQ2h2zNNBBUkUr3ViJx'
  }
};

/**
 * Create a sample AMM pool info object
 */
function createAmmPoolInfo({
  chain = 'ethereum',
  baseTokenAddress = TOKENS[chain].WETH || TOKENS[chain].SOL,
  quoteTokenAddress = TOKENS[chain].USDC,
  poolAddress = SAMPLE_ADDRESSES[chain].ammPool,
  price = 3200.0,
  baseTokenAmount = 10.0,
  quoteTokenAmount = 32000.0,
  feePct = 0.3
} = {}) {
  return {
    address: poolAddress,
    baseTokenAddress: baseTokenAddress,
    quoteTokenAddress: quoteTokenAddress,
    feePct: feePct,
    price: price,
    baseTokenAmount: baseTokenAmount,
    quoteTokenAmount: quoteTokenAmount,
    poolType: 'amm',
    lpMint: {
      // In Uniswap V2, the LP token address is the pair address
      // In other AMMs, this might be different
      address: poolAddress,
      decimals: chain === 'ethereum' ? 18 : 9
    }
  };
}

/**
 * Create a sample CLMM pool info object
 */
function createClmmPoolInfo({
  chain = 'ethereum',
  baseTokenAddress = TOKENS[chain].WETH || TOKENS[chain].SOL,
  quoteTokenAddress = TOKENS[chain].USDC,
  poolAddress = SAMPLE_ADDRESSES[chain].clmmPool,
  price = 3200.0,
  baseTokenAmount = 10.0,
  quoteTokenAmount = 32000.0,
  feePct = 0.05,
  binStep = 10,
  activeBinId = 205800
} = {}) {
  return {
    address: poolAddress,
    baseTokenAddress: baseTokenAddress,
    quoteTokenAddress: quoteTokenAddress,
    binStep: binStep,
    feePct: feePct,
    price: price,
    baseTokenAmount: baseTokenAmount,
    quoteTokenAmount: quoteTokenAmount,
    activeBinId: activeBinId
  };
}

/**
 * Create a sample AMM position info object
 */
function createAmmPositionInfo({
  chain = 'ethereum',
  baseTokenAddress = TOKENS[chain].WETH || TOKENS[chain].SOL,
  quoteTokenAddress = TOKENS[chain].USDC,
  poolAddress = SAMPLE_ADDRESSES[chain].ammPool,
  walletAddress = SAMPLE_ADDRESSES[chain].wallet,
  price = 3200.0,
  lpTokenAmount = 5.0,
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0
} = {}) {
  return {
    poolAddress: poolAddress,
    walletAddress: walletAddress,
    baseTokenAddress: baseTokenAddress,
    quoteTokenAddress: quoteTokenAddress,
    lpTokenAmount: lpTokenAmount,
    baseTokenAmount: baseTokenAmount,
    quoteTokenAmount: quoteTokenAmount,
    price: price
  };
}

/**
 * Create a sample CLMM position info object
 */
function createClmmPositionInfo({
  chain = 'ethereum',
  positionAddress = SAMPLE_ADDRESSES[chain].position,
  baseTokenAddress = TOKENS[chain].WETH || TOKENS[chain].SOL,
  quoteTokenAddress = TOKENS[chain].USDC,
  poolAddress = SAMPLE_ADDRESSES[chain].clmmPool,
  price = 3200.0,
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0,
  baseFeeAmount = 0.01,
  quoteFeeAmount = chain === 'ethereum' ? 32.0 : 0.3,
  lowerBinId = 200000,
  upperBinId = 210000,
  lowerPrice = 3000.0,
  upperPrice = 3500.0
} = {}) {
  return {
    address: positionAddress,
    poolAddress: poolAddress,
    baseTokenAddress: baseTokenAddress,
    quoteTokenAddress: quoteTokenAddress,
    baseTokenAmount: baseTokenAmount,
    quoteTokenAmount: quoteTokenAmount,
    baseFeeAmount: baseFeeAmount,
    quoteFeeAmount: quoteFeeAmount,
    lowerBinId: lowerBinId,
    upperBinId: upperBinId,
    lowerPrice: lowerPrice,
    upperPrice: upperPrice,
    price: price
  };
}

/**
 * Create a sample swap quote object
 */
function createSwapQuote({
  chain = 'ethereum',
  poolAddress = SAMPLE_ADDRESSES[chain].ammPool,
  side = 'SELL', // 'SELL' or 'BUY'
  amount = 1.0,
  price = 3200.0,
  slippagePct = 1.0, // 1%
  includeGasInfo = true
} = {}) {
  // For SELL quote, we're selling baseToken for quoteToken
  // For BUY quote, we're buying baseToken with quoteToken
  const isSell = side === 'SELL';
  const estimatedAmountIn = isSell ? amount : amount * price;
  const estimatedAmountOut = isSell ? amount * price : amount;
  
  const slippageFactor = 1 - (slippagePct / 100);
  const minAmountOut = estimatedAmountOut * slippageFactor;
  const maxAmountIn = estimatedAmountIn * (2 - slippageFactor);
  
  const baseTokenBalanceChange = isSell ? -amount : amount;
  const quoteTokenBalanceChange = isSell ? amount * price : -amount * price;
  
  const result = {
    poolAddress: poolAddress,
    estimatedAmountIn: estimatedAmountIn,
    estimatedAmountOut: estimatedAmountOut,
    minAmountOut: minAmountOut,
    maxAmountIn: maxAmountIn,
    baseTokenBalanceChange: baseTokenBalanceChange,
    quoteTokenBalanceChange: quoteTokenBalanceChange,
    price: price
  };
  
  if (includeGasInfo) {
    result.gasPrice = chain === 'ethereum' ? 1.5 : 5000;
    result.gasLimit = chain === 'ethereum' ? 150000 : 200000;
    result.gasCost = chain === 'ethereum' ? 0.000225 : 0.001;
  }
  
  return result;
}

/**
 * Create a sample execute swap response
 */
function createExecuteSwapResponse({
  chain = 'ethereum',
  side = 'SELL', // 'SELL' or 'BUY'
  amount = 1.0,
  price = 3200.0,
  fee = 0.003
} = {}) {
  // For SELL, we're selling baseToken for quoteToken
  // For BUY, we're buying baseToken with quoteToken
  const isSell = side === 'SELL';
  const totalInputSwapped = isSell ? amount : amount * price;
  const totalOutputSwapped = isSell ? amount * price : amount;
  
  const baseTokenBalanceChange = isSell ? -amount : amount;
  const quoteTokenBalanceChange = isSell ? amount * price : -amount * price;
  
  return {
    signature: chain === 'ethereum' 
      ? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      : '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
    totalInputSwapped: totalInputSwapped,
    totalOutputSwapped: totalOutputSwapped,
    fee: fee,
    baseTokenBalanceChange: baseTokenBalanceChange,
    quoteTokenBalanceChange: quoteTokenBalanceChange
  };
}

/**
 * Create a sample add liquidity response
 */
function createAddLiquidityResponse({
  chain = 'ethereum',
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0,
  fee = 0.005
} = {}) {
  return {
    signature: chain === 'ethereum' 
      ? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      : '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
    fee: fee,
    baseTokenAmountAdded: baseTokenAmount,
    quoteTokenAmountAdded: quoteTokenAmount
  };
}

/**
 * Create a sample remove liquidity response
 */
function createRemoveLiquidityResponse({
  chain = 'ethereum',
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0,
  fee = 0.005
} = {}) {
  return {
    signature: chain === 'ethereum' 
      ? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      : '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
    fee: fee,
    baseTokenAmountRemoved: baseTokenAmount,
    quoteTokenAmountRemoved: quoteTokenAmount
  };
}

/**
 * Create a sample open position response
 */
function createOpenPositionResponse({
  chain = 'ethereum',
  positionAddress = SAMPLE_ADDRESSES[chain].position,
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0,
  fee = 0.005,
  positionRent = 0.001
} = {}) {
  return {
    signature: chain === 'ethereum' 
      ? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      : '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
    fee: fee,
    positionAddress: positionAddress,
    positionRent: positionRent,
    baseTokenAmountAdded: baseTokenAmount,
    quoteTokenAmountAdded: quoteTokenAmount
  };
}

/**
 * Create a sample close position response
 */
function createClosePositionResponse({
  chain = 'ethereum',
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0,
  baseFeeAmount = 0.01,
  quoteFeeAmount = chain === 'ethereum' ? 32.0 : 0.3,
  fee = 0.003,
  positionRentRefunded = 0.0005
} = {}) {
  return {
    signature: chain === 'ethereum' 
      ? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      : '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
    fee: fee,
    positionRentRefunded: positionRentRefunded,
    baseTokenAmountRemoved: baseTokenAmount,
    quoteTokenAmountRemoved: quoteTokenAmount,
    baseFeeAmountCollected: baseFeeAmount,
    quoteFeeAmountCollected: quoteFeeAmount
  };
}

/**
 * Create a sample collect fees response
 */
function createCollectFeesResponse({
  chain = 'ethereum',
  baseFeeAmount = 0.01,
  quoteFeeAmount = chain === 'ethereum' ? 32.0 : 0.3,
  fee = 0.002
} = {}) {
  return {
    signature: chain === 'ethereum' 
      ? '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      : '5QpUZPim4Riw8HrPnUqZiW1vZrxyA2hHpgAVonkXjirKH147YLsZAZruw4gB9cGBrZeP2DgAWjvYXaKKFfhuJpC9',
    fee: fee,
    baseFeeAmountCollected: baseFeeAmount,
    quoteFeeAmountCollected: quoteFeeAmount
  };
}

/**
 * Create a sample quote position response
 */
function createQuotePositionResponse({
  baseLimited = true,
  baseTokenAmount = 1.0,
  quoteTokenAmount = 3200.0,
  baseTokenAmountMax = 2.0,
  quoteTokenAmountMax = 6400.0,
  includeLiquidity = true
} = {}) {
  const result = {
    baseLimited: baseLimited,
    baseTokenAmount: baseTokenAmount,
    quoteTokenAmount: quoteTokenAmount,
    baseTokenAmountMax: baseTokenAmountMax,
    quoteTokenAmountMax: quoteTokenAmountMax
  };
  
  if (includeLiquidity) {
    result.liquidity = 123456789;
  }
  
  return result;
}

// Export all factory functions
module.exports = {
  NETWORKS,
  TOKENS,
  SAMPLE_ADDRESSES,
  createAmmPoolInfo,
  createClmmPoolInfo,
  createAmmPositionInfo,
  createClmmPositionInfo,
  createSwapQuote,
  createExecuteSwapResponse,
  createAddLiquidityResponse,
  createRemoveLiquidityResponse,
  createOpenPositionResponse,
  createClosePositionResponse,
  createCollectFeesResponse,
  createQuotePositionResponse
};