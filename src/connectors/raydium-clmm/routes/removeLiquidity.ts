import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { RaydiumCLMM } from '../raydium-clmm'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../services/clmm-interfaces'
import { TxVersion } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import Decimal from 'decimal.js'


export async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  closePosition: boolean = false
): Promise<RemoveLiquidityResponseType> {
  try {
    const solana = await Solana.getInstance(network)
    const raydium = await RaydiumCLMM.getInstance(network)
    const positionInfo = await raydium.getClmmPosition(positionAddress)
    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolId.toBase58())

    if (positionInfo.liquidity.isZero()) {
      throw new Error('Position has zero liquidity - nothing to remove')
    }
    if (percentageToRemove <= 0 || percentageToRemove > 100) {
      throw new Error('Invalid percentageToRemove - must be between 0 and 100')
    }

    const liquidityToRemove = new BN(
      new Decimal(positionInfo.liquidity.toString())
        .mul(percentageToRemove / 100)
        .toFixed(0)
    )

    logger.info('Removing liquidity from Raydium CLMM position...')
    const COMPUTE_UNITS = 600000
    let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE
    while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
      const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS)
      const { transaction } = await raydium.raydium.clmm.decreaseLiquidity({
        poolInfo,
        poolKeys,
        ownerPosition: positionInfo,
        ownerInfo: { 
            useSOLBalance: true,
            closePosition: closePosition
        },
        liquidity: liquidityToRemove,
        amountMinA: new BN(0),
        amountMinB: new BN(0),
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      })

      await solana.simulateTransaction(transaction)
      const wallet = await solana.getWallet(walletAddress)
      transaction.sign([wallet])

      const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction)
      if (confirmed && txData) {
        const totalFee = txData.meta.fee
        return {
          signature,
          fee: totalFee / 1e9,
          baseTokenAmountRemoved: 0,
          quoteTokenAmountRemoved: 0,
        }
      }
      currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier
      logger.info(`Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`)
    }
    throw new Error(`Remove liquidity failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`)
  } catch (error) {
    logger.error(error)
    throw error
  }
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType
    Reply: RemoveLiquidityResponseType
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from Raydium CLMM position',
        tags: ['raydium-clmm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' }
          }
        },
        response: {
          200: RemoveLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network,
          walletAddress,
          positionAddress,
          percentageToRemove,
        } = request.body
        
        return await removeLiquidity(
          fastify,
          network || 'mainnet-beta',
          walletAddress,
          positionAddress,
          percentageToRemove,
        )
      } catch (e) {
        logger.error(e)
        throw fastify.httpErrors.internalServerError('Internal server error')
      }
    }
  )
}

export default removeLiquidityRoute
