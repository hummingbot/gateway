import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { RaydiumCLMM } from '../raydium-clmm'
import { ApiV3PoolInfoConcentratedItem } from '@raydium-io/raydium-sdk-v2'
import { Solana } from '../../../chains/solana/solana'
import { PublicKey } from '@solana/web3.js'
import { logger } from '../../../services/logger'
import { 
  CollectFeesRequest,
  CollectFeesResponse,
  CollectFeesRequestType,
  CollectFeesResponseType
} from '../../../services/clmm-interfaces'

export async function collectFees(
    fastify: FastifyInstance,
    network: string,
    walletAddress: string,
    positionAddress: string
  ): Promise<CollectFeesResponseType> {
    const solana = await Solana.getInstance(network)
    const raydium = await RaydiumCLMM.getInstance(network)
    const wallet = await solana.getWallet(walletAddress)
  
    const position = await raydium.getClmmPosition(positionAddress)
    if (!position) {
      throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`)
    }
  
    const [poolInfo] = await raydium.getClmmPoolfromAPI(position.poolId.toBase58())
  
    const tokenA = await solana.getToken(poolInfo.mintA.address)
    const tokenB = await solana.getToken(poolInfo.mintB.address)
    const tokenASymbol = tokenA?.symbol || 'UNKNOWN'
    const tokenBSymbol = tokenB?.symbol || 'UNKNOWN'
  
    logger.info(`Collecting fees from CLMM position ${positionAddress}`)
  
    const { transaction } = await raydium.raydium.clmm.collectRewards({
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      ownerInfo: {
        useSOLBalance: true,
      },
      rewardMints: [new PublicKey(position.address)],
    })
  
    const { signature, fee } = await solana.sendAndConfirmTransaction(transaction, [wallet])
    
    const { balanceChange: collectedFeeA } = await solana.extractTokenBalanceChangeAndFee(
      signature,
      poolInfo.mintA.address,
      wallet.publicKey.toBase58()
    )
    
    const { balanceChange: collectedFeeB } = await solana.extractTokenBalanceChangeAndFee(
      signature,
      poolInfo.mintB.address,
      wallet.publicKey.toBase58()
    )
  
    logger.info(`Fees collected from position ${positionAddress}: ${
      Math.abs(collectedFeeA).toFixed(4)} ${tokenASymbol}, ${
      Math.abs(collectedFeeB).toFixed(4)} ${tokenBSymbol}`)
  
    return {
      signature,
      fee,
      baseFeeAmountCollected: Math.abs(collectedFeeA),
      quoteFeeAmountCollected: Math.abs(collectedFeeB)
    }
  }
  
  export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
    const solana = await Solana.getInstance('mainnet-beta')
    let firstWalletAddress = '<solana-wallet-address>'
    
    try {
      firstWalletAddress = await solana.getFirstWalletAddress() || firstWalletAddress
    } catch (error) {
      logger.debug('No wallets found for examples in schema')
    }
    
    CollectFeesRequest.properties.walletAddress.examples = [firstWalletAddress]
  
    fastify.post<{
      Body: CollectFeesRequestType;
      Reply: CollectFeesResponseType;
    }>(
      '/collect-fees',
      {
        schema: {
          description: 'Collect fees from a Raydium CLMM position',
          tags: ['raydium-clmm'],
          body: CollectFeesRequest,
          response: { 200: CollectFeesResponse },
        }
      },
      async (request) => {
        try {
          const { network, walletAddress, positionAddress } = request.body
          return await collectFees(
            fastify,
            network || 'mainnet-beta',
            walletAddress,
            positionAddress
          )
        } catch (e) {
          logger.error(e)
          if (e.statusCode) {
            throw fastify.httpErrors.createError(e.statusCode, e.message)
          }
          throw fastify.httpErrors.internalServerError('Failed to collect fees')
        }
      }
    )
  }
  
  export default collectFeesRoute
  