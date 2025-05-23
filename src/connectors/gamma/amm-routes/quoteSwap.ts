import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Gamma } from '../gamma'
import { Solana } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  GetSwapQuoteResponseType,
  GetSwapQuoteResponse,
  GetSwapQuoteRequestType,
  GetSwapQuoteRequest
} from '../../../schemas/swap-schema'
import { OracleBasedCurveCalculator, PoolKeys, PoolInfo, SwapResult } from 'goosefx-amm-sdk'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { estimateGasSolana } from '../../../chains/solana/routes/estimate-gas'
import { TokenInfo } from '../../../services/base'

type RawQuoteResponse = SwapResult & {
  zeroForOne: boolean;
  minAmountOut: BN;
  maxAmountIn: BN;
  inputToken: TokenInfo;
  outputToken: TokenInfo;
  price: number;
  poolInfo: PoolInfo;
  poolKeys: PoolKeys;
}

export async function getRawSwapQuote(
  network: string,
  poolId: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
): Promise<RawQuoteResponse> {
  // Convert side to exactIn
  const exactIn = side === 'SELL';
  if (!exactIn) {
    throw new Error(`FixedOut swaps not supported by Gamma oracle-based AMM`)
  }

  const solana = await Solana.getInstance(network);
  const gamma = await Gamma.getInstance(network);

  // Resolve tokens from symbols or addresses
  const resolvedBaseToken = await solana.getToken(baseTokenSymbol);
  const resolvedQuoteToken = await solana.getToken(quoteTokenSymbol);

  if (!resolvedBaseToken || !resolvedQuoteToken) {
    throw new Error(`Token not found: ${!resolvedBaseToken ? baseTokenSymbol : quoteTokenSymbol}`)
  }
  
  logger.info(`Base token: ${resolvedBaseToken.symbol}, address=${resolvedBaseToken.address}, decimals=${resolvedBaseToken.decimals}`)
  logger.info(`Quote token: ${resolvedQuoteToken.symbol}, address=${resolvedQuoteToken.address}, decimals=${resolvedQuoteToken.decimals}`)

  const baseTokenAddress = resolvedBaseToken.address
  const quoteTokenAddress = resolvedQuoteToken.address
  
  logger.info(`getRawSwapQuote: poolId=${poolId}, baseToken=${baseTokenSymbol}, quoteToken=${quoteTokenSymbol}, amount=${amount}, side=${side}, exactIn=${exactIn}`)
  
  // Get pool info
  const { poolInfo, poolKeys, rpcData } = await gamma.client.cpmm.getPoolInfoFromRpc(poolId)

  const observationState = await gamma.client.cpmm.getObservationStates([rpcData.observationKey]).then((res) => res.at(0))
  if (!observationState) {
    throw new Error(`Pool observations not found. Pool: ${poolId}`)
  }
  const ammPoolInfo = gamma.rpcToPoolInfo(poolId, rpcData)
  
  // Verify input and output tokens match pool tokens
  if (baseTokenAddress !== ammPoolInfo.baseTokenAddress && baseTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw new Error(`Base token ${baseTokenSymbol} is not in pool ${poolId}`)
  }
  
  if (quoteTokenAddress !== ammPoolInfo.baseTokenAddress && quoteTokenAddress !== ammPoolInfo.quoteTokenAddress) {
    throw new Error(`Quote token ${quoteTokenSymbol} is not in pool ${poolId}`)
  }

  // `side` specifies if the amount(in base tokens) is what we're buying or what we're selling
  // - For buys, output is in base tokens
  // - For sells, input is in base tokens
  const [inputToken, outputToken, inputTokenReserves, outputTokenReserves] = 
    [resolvedBaseToken, resolvedQuoteToken, ammPoolInfo.baseTokenAmount, ammPoolInfo.quoteTokenAmount] 
  const zeroForOne = inputToken.address === ammPoolInfo.baseTokenAddress
  
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

  const result = OracleBasedCurveCalculator.swap(
    new BN(amountInWithDecimals!),
    zeroForOne,
    new BN(inputTokenReserves),
    new BN(outputTokenReserves),
    new BN(ammPoolInfo.feePct),
    observationState,
    rpcData
  ) 
  
  const slippage = slippagePct === undefined ? 0.01 : slippagePct / 100
  const otherAmountThreshold = exactIn
    ? result.destinationAmountSwapped.mul(new BN((1 - slippage) * 10000)).div(new BN(10000))
    : result.sourceAmountSwapped.mul(new BN((1 + slippage) * 10000)).div(new BN(10000))
  
  logger.info(`Raw quote result: amountIn=${result.sourceAmountSwapped.toString()}, amountOut=${result.destinationAmountSwapped.toString()}, inputMint=${inputToken.address}, outputMint=${outputToken.address}`)
  
  // Add price calculation
  const price = side === 'SELL'
    ? result.destinationAmountSwapped.div(result.sourceAmountSwapped).toNumber()
    : result.sourceAmountSwapped.div(result.destinationAmountSwapped).toNumber()
  
  return {
    ...result,
    zeroForOne,
    maxAmountIn: exactIn ? result.sourceAmountSwapped : otherAmountThreshold,
    minAmountOut: exactIn ? otherAmountThreshold : result.destinationAmountSwapped,
    inputToken,
    outputToken,
    price,
    poolInfo,
    poolKeys,
  };
}

async function formatSwapQuote(
  _fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
): Promise<GetSwapQuoteResponseType> {
  logger.info(`formatSwapQuote: poolAddress=${poolAddress}, baseToken=${baseToken}, quoteToken=${quoteToken}, amount=${amount}, side=${side}`)

  const quote = await getRawSwapQuote(
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side as 'BUY' | 'SELL',
    slippagePct
  )
  
  logger.info(`Quote result: amountIn=${quote.sourceAmountSwapped.toString()}, amountOut=${quote.destinationAmountSwapped.toString()}`)

  // Use the token objects returned from getRawSwapQuote
  const inputToken = quote.inputToken
  const outputToken = quote.outputToken
  
  logger.info(`Using input token decimals: ${inputToken.decimals}, output token decimals: ${outputToken.decimals}`)

  // Convert BN values to numbers with correct decimal precision
  const estimatedAmountIn = new Decimal(quote.sourceAmountSwapped.toString())
    .div(10 ** inputToken.decimals)
    .toNumber()
  
  const estimatedAmountOut = new Decimal(quote.destinationAmountSwapped.toString())
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
  // SELL: amount(base tokens) is input, base tokens decrease(+ve), quote tokens increase(-ve)
  // BUY: _amount(base tokens) is output, base tokens increase(+ve), quote tokens decrease(-ve)
  const baseTokenBalanceChange = side === 'BUY' ? estimatedAmountOut : -estimatedAmountIn
  const quoteTokenBalanceChange = side === 'BUY' ? -estimatedAmountIn : estimatedAmountOut
  
  logger.info(`Balance changes: baseTokenBalanceChange=${baseTokenBalanceChange}, quoteTokenBalanceChange=${quoteTokenBalanceChange}`)

  // Add price calculation
  const price = side === 'SELL' 
    ? estimatedAmountOut / estimatedAmountIn
    : estimatedAmountIn / estimatedAmountOut;

  return {
    poolAddress,
    estimatedAmountIn,
    estimatedAmountOut,
    minAmountOut,
    maxAmountIn,
    baseTokenBalanceChange,
    quoteTokenBalanceChange,
    price,
    gasPrice: 0,
    gasLimit: 0,
    gasCost: 0
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
        description: 'Get swap quote for Gamma AMM',
        tags: ['gamma/amm'],
        querystring:{ 
          ...GetSwapQuoteRequest,
          properties: {
            ...GetSwapQuoteRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', enum: ['BUY', 'SELL'], examples: ['SELL'] },
            poolAddress: { type: 'string', examples: ['Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng'] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: {
            properties: {
              ...GetSwapQuoteResponse.properties,
            }
          }
        },
      }
    },
    async (request) => {
      try {
        const { network, poolAddress: requestedPoolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query
        const networkToUse = network || 'mainnet-beta'

        const gamma = await Gamma.getInstance(networkToUse);
        let poolAddress = requestedPoolAddress;
        
        if (!poolAddress) {
          poolAddress = await gamma.findDefaultPool(baseToken, quoteToken, 'amm');
          
          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        const result = await formatSwapQuote(
          fastify,
          networkToUse,
          poolAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct
        )

        let gasEstimation = null;
        try {
          gasEstimation = await estimateGasSolana(fastify, networkToUse);
        } catch (error) {
          logger.warn(`Failed to estimate gas for swap quote: ${error.message}`);
        }

        return {
          ...result,
          gasPrice: gasEstimation?.gasPrice,
          gasLimit: gasEstimation?.gasLimit,
          gasCost: gasEstimation?.gasCost
        }
      } catch (e) {
        logger.error(e)
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Internal server error')
      }
    }
  )
}

export default quoteSwapRoute