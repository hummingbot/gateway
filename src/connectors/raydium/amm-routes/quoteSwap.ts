import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Raydium } from '../raydium'
import { Solana } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  GetSwapQuoteRequest,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteResponseType,
} from '../../../services/swap-interfaces'
import { 
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  CurveCalculator
} from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { PublicKey } from '@solana/web3.js'

async function quoteAmmSwap(
  raydium: Raydium,
  network: string,
  poolId: string,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct?: number
): Promise<any> {
  let poolInfo: ApiV3PoolInfoStandardItem
  let poolKeys: any
  let rpcData: any
  
  if (network === 'mainnet-beta') {
    // note: api doesn't support get devnet pool info, so in devnet else we go rpc method
    const [poolInfoData, poolKeysData] = await raydium.getPoolfromAPI(poolId)
    poolInfo = poolInfoData as ApiV3PoolInfoStandardItem
    poolKeys = poolKeysData
    rpcData = await raydium.raydiumSDK.liquidity.getRpcPoolInfo(poolId)
  } else {
    // note: getPoolInfoFromRpc method only returns required pool data for computing not all detail pool info
    const data = await raydium.raydiumSDK.liquidity.getPoolInfoFromRpc({ poolId })
    poolInfo = data.poolInfo
    poolKeys = data.poolKeys
    rpcData = data.poolRpcData
  }
  
  const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]

  if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
    throw new Error('input mint does not match pool')

  if (poolInfo.mintA.address !== outputMint && poolInfo.mintB.address !== outputMint)
    throw new Error('output mint does not match pool')

  const baseIn = inputMint === poolInfo.mintA.address
  const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]
  
  const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100

  if (amountIn) {
    const out = raydium.raydiumSDK.liquidity.computeAmountOut({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountIn: new BN(amountIn),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: effectiveSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    })

    return {
      poolInfo,
      mintIn,
      mintOut,
      amountIn: new BN(amountIn),
      amountOut: out.amountOut,
      minAmountOut: out.minAmountOut,
      maxAmountIn: new BN(amountIn),
      fee: out.fee,
      priceImpact: out.priceImpact,
    }
  } else if (amountOut) {
    const out = raydium.raydiumSDK.liquidity.computeAmountIn({
      poolInfo: {
        ...poolInfo,
        baseReserve,
        quoteReserve,
        status,
        version: 4,
      },
      amountOut: new BN(amountOut),
      mintIn: mintIn.address,
      mintOut: mintOut.address,
      slippage: effectiveSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    })

    return {
      poolInfo,
      mintIn,
      mintOut,
      amountIn: out.amountIn,
      amountOut: new BN(amountOut),
      minAmountOut: new BN(amountOut),
      maxAmountIn: out.maxAmountIn,
      priceImpact: out.priceImpact,
    }
  }
  
  throw new Error('Either amountIn or amountOut must be provided')
}

async function quoteCpmmSwap(
  raydium: Raydium,
  network: string,
  poolId: string,
  inputMint: string,
  outputMint: string,
  amountIn?: string,
  amountOut?: string,
  slippagePct?: number
): Promise<any> {
  let poolInfo: ApiV3PoolInfoStandardItemCpmm
  let poolKeys: any
  let rpcData: any

  if (network === 'mainnet-beta') {
    const [poolInfoData, poolKeysData] = await raydium.getPoolfromAPI(poolId)
    poolInfo = poolInfoData as ApiV3PoolInfoStandardItemCpmm
    poolKeys = poolKeysData
    rpcData = await raydium.raydiumSDK.cpmm.getRpcPoolInfo(poolInfo.id, true)
  } else {
    const data = await raydium.raydiumSDK.cpmm.getPoolInfoFromRpc(poolId)
    poolInfo = data.poolInfo
    poolKeys = data.poolKeys
    rpcData = data.rpcData
  }

  if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address)
    throw new Error('input mint does not match pool')

  if (outputMint !== poolInfo.mintA.address && outputMint !== poolInfo.mintB.address)
    throw new Error('output mint does not match pool')

  const baseIn = inputMint === poolInfo.mintA.address

  if (amountIn) {
    // Exact input (swap base in)
    const inputAmount = new BN(amountIn)
    
    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swap(
      inputAmount,
      baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
      baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
      rpcData.configInfo!.tradeFeeRate
    )

    // Apply slippage to output amount
    const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100
    const minAmountOut = swapResult.destinationAmountSwapped.mul(
      new BN(Math.floor((1 - effectiveSlippage) * 10000))
    ).div(new BN(10000))

    return {
      poolInfo,
      amountIn: inputAmount,
      amountOut: swapResult.destinationAmountSwapped,
      minAmountOut,
      maxAmountIn: inputAmount,
      fee: swapResult.tradeFee,
      priceImpact: null, // CPMM doesn't provide price impact
      inputMint,
      outputMint,
    }
  } else if (amountOut) {
    // Exact output (swap base out)
    const outputAmount = new BN(amountOut)
    const outputMintPk = new PublicKey(outputMint)
    
    // Log inputs to swapBaseOut
    logger.info(`CurveCalculator.swapBaseOut inputs: 
      poolMintA=${poolInfo.mintA.address}, 
      poolMintB=${poolInfo.mintB.address}, 
      tradeFeeRate=${rpcData.configInfo!.tradeFeeRate.toString()}, 
      baseReserve=${rpcData.baseReserve.toString()}, 
      quoteReserve=${rpcData.quoteReserve.toString()}, 
      outputMint=${outputMintPk.toString()}, 
      outputAmount=${outputAmount.toString()}`)
    
    // swap pool mintA for mintB
    const swapResult = CurveCalculator.swapBaseOut({
      poolMintA: poolInfo.mintA,
      poolMintB: poolInfo.mintB,
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate,
      baseReserve: rpcData.baseReserve,
      quoteReserve: rpcData.quoteReserve,
      outputMint: outputMintPk,
      outputAmount,
    })

    // Apply slippage to input amount
    const effectiveSlippage = slippagePct === undefined ? 0.01 : slippagePct / 100
    const maxAmountIn = swapResult.amountIn.mul(
      new BN(Math.floor((1 + effectiveSlippage) * 10000))
    ).div(new BN(10000))

    return {
      poolInfo,
      amountIn: swapResult.amountIn,
      amountOut: outputAmount,
      minAmountOut: outputAmount,
      maxAmountIn,
      fee: swapResult.tradeFee,
      priceImpact: null, // CPMM doesn't provide price impact
      inputMint,
      outputMint,
    }
  }

  throw new Error('Either amountIn or amountOut must be provided')
}

export async function getRawSwapQuote(
  raydium: Raydium,
  network: string,
  poolId: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'buy' | 'sell',
  slippagePct?: number
): Promise<any> {
  // Convert side to exactIn
  const exactIn = side === 'sell';
  
  logger.info(`getRawSwapQuote: poolId=${poolId}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}, exactIn=${exactIn}`)
  
  // Get pool info to determine if it's AMM or CPMM
  const ammPoolInfo = await raydium.getAmmPoolInfo(poolId)
  
  if (!ammPoolInfo) {
    throw new Error(`Pool not found: ${poolId}`)
  }
  
  logger.info(`Pool type: ${ammPoolInfo.poolType}`)

  // Resolve tokens from symbols or addresses
  const solana = await Solana.getInstance(network)
  const resolvedBaseToken = await solana.getToken(baseToken)
  const resolvedQuoteToken = await solana.getToken(quoteToken)
  
  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw new Error(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`)
  }
  
  logger.info(`Base token: ${resolvedBaseToken.symbol}, address=${resolvedBaseToken.address}, decimals=${resolvedBaseToken.decimals}`)
  logger.info(`Quote token: ${resolvedQuoteToken.symbol}, address=${resolvedQuoteToken.address}, decimals=${resolvedQuoteToken.decimals}`)
  
  const baseTokenAddress = resolvedBaseToken.address
  const quoteTokenAddress = resolvedQuoteToken.address
  
  // Verify input and output tokens match pool tokens
  if (baseTokenAddress !== ammPoolInfo.baseTokenAddress && baseTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw new Error(`Base token ${baseToken} is not in pool ${poolId}`)
  }
  
  if (quoteTokenAddress !== ammPoolInfo.baseTokenAddress && quoteTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw new Error(`Quote token ${quoteToken} is not in pool ${poolId}`)
  }
  
  // Determine which token is input and which is output based on exactIn flag
  const [inputToken, outputToken] = exactIn 
    ? [resolvedBaseToken, resolvedQuoteToken] 
    : [resolvedQuoteToken, resolvedBaseToken]
  
  logger.info(`Input token: ${inputToken.symbol}, address=${inputToken.address}, decimals=${inputToken.decimals}`)
  logger.info(`Output token: ${outputToken.symbol}, address=${outputToken.address}, decimals=${outputToken.decimals}`)
  
  // Convert amount to string with proper decimals based on which token we're using
  const inputDecimals = inputToken.decimals
  const outputDecimals = outputToken.decimals
  
  // Create amount with proper decimals for the token being used (input for exactIn, output for exactOut)
  const amountInWithDecimals = exactIn 
    ? new Decimal(amount).mul(10 ** inputDecimals).toFixed(0)
    : undefined
    
  const amountOutWithDecimals = !exactIn
    ? new Decimal(amount).mul(10 ** outputDecimals).toFixed(0)
    : undefined
  
  logger.info(`Amount in human readable: ${amount}`)
  logger.info(`Amount in with decimals: ${amountInWithDecimals}, Amount out with decimals: ${amountOutWithDecimals}`)
  
  let result;
  if (ammPoolInfo.poolType === 'amm') {
    result = await quoteAmmSwap(
      raydium, 
      network, 
      poolId, 
      inputToken.address, 
      outputToken.address, 
      amountInWithDecimals, 
      amountOutWithDecimals, 
      slippagePct
    )
  } else if (ammPoolInfo.poolType === 'cpmm') {
    result = await quoteCpmmSwap(
      raydium, 
      network, 
      poolId, 
      inputToken.address, 
      outputToken.address, 
      amountInWithDecimals, 
      amountOutWithDecimals, 
      slippagePct
    )
  } else {
    throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`)
  }
  
  logger.info(`Raw quote result: amountIn=${result.amountIn.toString()}, amountOut=${result.amountOut.toString()}, inputMint=${result.inputMint}, outputMint=${result.outputMint}`)
  
  return {
    ...result,
    inputToken,
    outputToken
  };
}

async function formatSwapQuote(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'buy' | 'sell',
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  logger.info(`formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}`)
  
  const raydium = await Raydium.getInstance(network)
  const solana = await Solana.getInstance(network)

  // Resolve tokens from symbols or addresses
  const resolvedBaseToken = await solana.getToken(baseToken)
  const resolvedQuoteToken = await solana.getToken(quoteToken)

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw new Error(`Token not found: ${!resolvedBaseToken ? baseToken : quoteToken}`)
  }
  
  logger.info(`Resolved base token: ${resolvedBaseToken.symbol}, address=${resolvedBaseToken.address}, decimals=${resolvedBaseToken.decimals}`)
  logger.info(`Resolved quote token: ${resolvedQuoteToken.symbol}, address=${resolvedQuoteToken.address}, decimals=${resolvedQuoteToken.decimals}`)

  // Get pool info
  const poolInfo = await raydium.getAmmPoolInfo(poolAddress)
  if (!poolInfo) {
    throw new Error(`Pool not found: ${poolAddress}`)
  }
  
  logger.info(`Pool info: type=${poolInfo.poolType}, baseToken=${poolInfo.baseTokenAddress}, quoteToken=${poolInfo.quoteTokenAddress}`)

  const quote = await getRawSwapQuote(
    raydium,
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side as 'buy' | 'sell',
    slippagePct
  )
  
  logger.info(`Quote result: amountIn=${quote.amountIn.toString()}, amountOut=${quote.amountOut.toString()}`)

  // Use the token objects returned from getRawSwapQuote
  const inputToken = quote.inputToken
  const outputToken = quote.outputToken
  
  logger.info(`Using input token decimals: ${inputToken.decimals}, output token decimals: ${outputToken.decimals}`)

  // Convert BN values to numbers with correct decimal precision
  const estimatedAmountIn = new Decimal(quote.amountIn.toString())
    .div(10 ** inputToken.decimals)
    .toNumber()
  
  const estimatedAmountOut = new Decimal(quote.amountOut.toString())
    .div(10 ** outputToken.decimals)
    .toNumber()
  
  const minAmountOut = new Decimal(quote.minAmountOut.toString())
    .div(10 ** outputToken.decimals)
    .toNumber()
  
  const maxAmountIn = new Decimal(quote.maxAmountIn.toString())
    .div(10 ** inputToken.decimals)
    .toNumber()
    
  logger.info(`Converted amounts: estimatedAmountIn=${estimatedAmountIn}, estimatedAmountOut=${estimatedAmountOut}, minAmountOut=${minAmountOut}, maxAmountIn=${maxAmountIn}`)

  // Calculate balance changes correctly based on which tokens are being swapped
  const baseTokenBalanceChange = side === 'buy' ? estimatedAmountOut : -estimatedAmountIn
  const quoteTokenBalanceChange = side === 'buy' ? -estimatedAmountIn : estimatedAmountOut
  
  logger.info(`Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`)

  return {
    estimatedAmountIn,
    estimatedAmountOut,
    minAmountOut,
    maxAmountIn,
    baseTokenBalanceChange,
    quoteTokenBalanceChange,
  }
}

export const quoteSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetSwapQuoteRequestType;
    Reply: GetSwapQuoteResponseType;
  }>(
    '/quote-swap',
    {
      schema: {
        description: 'Get a swap quote for Raydium AMM or CPMM',
        tags: ['raydium-amm'],
        querystring: {
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: { type: 'string', examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'] }, // AMM
            // poolAddress: { type: 'string', examples: ['7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny'] }, // CPMM
            baseToken: { type: 'string', examples: ['RAY'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', enum: ['buy', 'sell'], examples: ['sell'] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: GetSwapQuoteResponse
        },
      }
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query
        const networkToUse = network || 'mainnet-beta'

        return await formatSwapQuote(
          fastify,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'buy' | 'sell',
          slippagePct
        )
      } catch (e) {
        logger.error(e)
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message)
        }
        throw fastify.httpErrors.internalServerError('Internal server error')
      }
    }
  )
}

export default quoteSwapRoute