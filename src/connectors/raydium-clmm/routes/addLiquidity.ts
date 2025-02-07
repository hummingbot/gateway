import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { RaydiumCLMM } from '../raydium-clmm'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType,
} from '../../../services/clmm-interfaces'
import { PoolUtils, TxVersion } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import Decimal from 'decimal.js'


async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  _quoteTokenAmount: number,
  slippagePct?: number
): Promise<AddLiquidityResponseType> {
  try {
    const solana = await Solana.getInstance(network)
    const raydium = await RaydiumCLMM.getInstance(network)
    const positionInfo = await raydium.getClmmPosition(positionAddress);
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolId.toBase58())
    const rpcData = await raydium.getClmmPoolfromRPC(positionInfo.poolId.toBase58())
    poolInfo.price = rpcData.currentPrice
    console.log('current price', poolInfo.price);

    const baseToken = await solana.getToken(poolInfo.mintA.address)
    const quoteToken = await solana.getToken(poolInfo.mintB.address)

    if (!baseTokenAmount) {
      throw new Error('Base token amount is required');
    }
    const amount = new Decimal(baseTokenAmount).mul(10 ** baseToken.decimals).toFixed(0);
    const amountBN = new BN(amount);

    const epochInfo = await solana.connection.getEpochInfo()
    const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: 0,
      inputA: true,
      tickUpper: Math.max(positionInfo.tickLower, positionInfo.tickUpper),
      tickLower: Math.min(positionInfo.tickLower, positionInfo.tickUpper),
      amount: amountBN,
      add: true,
      amountHasFee: true,
      epochInfo,
    })

    const { 
      liquidity,
      amountA,
      amountB,
      amountSlippageA,
      amountSlippageB,
      expirationTime 
    } = res;
    console.log({
      liquidity: liquidity.toString(),
      amountA: Number(amountA.amount.toString()) / (10 ** baseToken.decimals),
      amountB: Number(amountB.amount.toString()) / (10 ** quoteToken.decimals),
      amountSlippageA: Number(amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      amountSlippageB: Number(amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
      expirationTime
    });

    logger.info('Adding liquidity to Raydium CLMM position...');
    const COMPUTE_UNITS = 300000
    const slippage = slippagePct / 100 || raydium.getSlippagePct()
    let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE
    while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
      const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS)
      const { transaction } = await raydium.raydium.clmm.increasePositionFromLiquidity({
        poolInfo,
        poolKeys,
        ownerPosition: positionInfo,
        ownerInfo: { useSOLBalance: true },
        liquidity: new BN(new Decimal(res.liquidity.toString()).mul(1 - slippage).toFixed(0)),
        amountMaxA: new BN(new Decimal(baseTokenAmount).mul(10 ** baseToken.decimals).toFixed(0)),
        amountMaxB: new BN(new Decimal(res.amountSlippageB.amount.toString()).mul(1 + slippage).toFixed(0)),
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      })

      await solana.simulateTransaction(transaction);
      const wallet = await solana.getWallet(walletAddress);
      transaction.sign([wallet]);

      const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
      if (confirmed && txData) {
        const totalFee = txData.meta.fee;
        return {
          signature,
          fee: totalFee / 1e9,
          baseTokenAmountAdded: Number(res.amountA.amount.toString()) / (10 ** baseToken.decimals),
          quoteTokenAmountAdded: Number(res.amountB.amount.toString()) / (10 ** quoteToken.decimals),
        }
      }
      currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier
      logger.info(`Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`);
    }
    throw new Error(`Add liquidity failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`);
  } catch (error) {
    logger.error(error)
    throw error
  }
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddLiquidityRequestType
    Reply: AddLiquidityResponseType
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to existing Raydium CLMM position',
        tags: ['raydium-clmm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' }
          }
        },
        response: {
          200: AddLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct 
        } = request.body
        
        return await addLiquidity(
          fastify,
          network || 'mainnet-beta',
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        )
      } catch (e) {
        logger.error(e)
        throw fastify.httpErrors.internalServerError('Internal server error')
      }
    }
  )
}

export default addLiquidityRoute
