import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Gamma } from '../gamma'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  RemoveLiquidityRequestType,
  RemoveLiquidityResponseType,
} from '../../../schemas/amm-schema'
import { getPdaUserLiquidity, Percent, PoolInfo, PoolKeys, TxVersion } from "goosefx-amm-sdk"
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { Keypair, VersionedTransaction, Transaction, PublicKey } from '@solana/web3.js'

async function createRemoveLiquidityTransaction(
  gamma: Gamma,
  poolInfo: PoolInfo,
  poolKeys: PoolKeys,
  lpAmount: BN,
  computeBudgetConfig: { units: number; microLamports: number }
): Promise<VersionedTransaction | Transaction> {
  // Use default slippage from Gamma class
  const slippage = new Percent(
    Math.floor(gamma.getSlippagePct('amm') * 100) / 10000
  )
  
  const { transaction } = await gamma.client.cpmm.withdrawLiquidity({
    poolInfo: poolInfo,
    poolKeys: poolKeys,
    lpAmount: lpAmount,
    txVersion: TxVersion.V0,
    slippage,
    computeBudgetConfig,
  })
  return transaction
}

/**
 * Calculate the LP token amount to remove based on percentage
 */
async function calculateLpAmountToRemove(
  gamma: Gamma,
  wallet: Keypair,
  poolInfo: PoolInfo,
  percentageToRemove: number
): Promise<BN> {
  const userLiquidityPda = getPdaUserLiquidity(
    new PublicKey(poolInfo.programId),
    new PublicKey(poolInfo.id),
    wallet.publicKey,
  ).publicKey;
  const userLiquidity = await gamma.client.cpmm.getRpcUserLiquidityAccounts([userLiquidityPda]).then((res) => res.at(0))
  if (!userLiquidity) {
    throw new Error(`User has no positions for this pool - nothing to remove`)
  }
  
  const lpBalance = userLiquidity.lpTokensOwned
  if (lpBalance.isZero()) {
    throw new Error('User LP balance is zero - nothing to remove')
  }
  
  // Calculate LP amount to remove based on percentage
  return new BN(
    new Decimal(lpBalance.toString())
      .mul(percentageToRemove / 100)
      .toFixed(0)
  )
}

async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number
): Promise<RemoveLiquidityResponseType> {
  const solana = await Solana.getInstance(network)
  const gamma = await Gamma.getInstance(network)
  const wallet = await solana.getWallet(walletAddress)

  const { poolInfo, poolKeys } = await gamma.client.cpmm.getPoolInfoFromRpc(poolAddress)
  
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw new Error('Invalid percentageToRemove - must be between 0 and 100')
  }
  
  // Calculate LP amount to remove
  const lpAmountToRemove = await calculateLpAmountToRemove(
    gamma,
    wallet,
    poolInfo,
    percentageToRemove
  )
  
  logger.info(`Removing ${percentageToRemove.toFixed(4)}% liquidity from pool ${poolAddress}...`)
  const COMPUTE_UNITS = 600000

  let currentPriorityFee = (await solana.estimateGas() * 1e9) - BASE_FEE
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS)
    
    const transaction = await createRemoveLiquidityTransaction(
      gamma,
      poolInfo,
      poolKeys,
      lpAmountToRemove,
      {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      }
    )

    if (transaction instanceof VersionedTransaction) {
      (transaction as VersionedTransaction).sign([wallet])
    } else {
      const txAsTransaction = transaction as Transaction
      const { blockhash, lastValidBlockHeight } = await solana.connection.getLatestBlockhash()
      txAsTransaction.recentBlockhash = blockhash
      txAsTransaction.lastValidBlockHeight = lastValidBlockHeight
      txAsTransaction.feePayer = wallet.publicKey
      txAsTransaction.sign(wallet)
    }

    await solana.simulateTransaction(transaction)

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction)
    if (confirmed && txData) {
      const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
        await solana.extractPairBalanceChangesAndFee(
          signature,
          await solana.getToken(poolInfo.mintA.address),
          await solana.getToken(poolInfo.mintB.address),
          wallet.publicKey.toBase58()
        )

      logger.info(`Liquidity removed from pool ${poolAddress}: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${poolInfo.mintA.symbol}, ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${poolInfo.mintB.symbol}`)

      return {
        signature,
        fee: txData.meta.fee / 1e9,
        baseTokenAmountRemoved: Math.abs(baseTokenBalanceChange),
        quoteTokenAmountRemoved: Math.abs(quoteTokenBalanceChange),
      }
    }
    currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier
    logger.info(`Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`)
  }
  throw new Error(`Remove liquidity failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`)
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta')
  let firstWalletAddress = '<solana-wallet-address>'
  
  const foundWallet = await solana.getFirstWalletAddress()
  if (foundWallet) {
    firstWalletAddress = foundWallet
  } else {
    logger.debug('No wallets found for examples in schema')
  }
  
  // Update schema example
  RemoveLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress]

  fastify.post<{
    Body: RemoveLiquidityRequestType
    Reply: RemoveLiquidityResponseType
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Gamma AMM/CPMM pool',
        tags: ['gamma/amm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: { type: 'string', examples: ['Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng'] }, // SOL-USDC
            percentageToRemove: { type: 'number', examples: [100] },
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
          poolAddress,
          percentageToRemove
        } = request.body
        
        return await removeLiquidity(
          fastify,
          network || 'mainnet-beta',
          walletAddress,
          poolAddress,
          percentageToRemove
        )
      } catch (e) {
        logger.error(e)
        throw fastify.httpErrors.internalServerError('Internal server error')
      }
    }
  )
}

export default removeLiquidityRoute