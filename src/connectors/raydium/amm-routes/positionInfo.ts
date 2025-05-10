import { FastifyPluginAsync } from 'fastify'
import { Raydium } from '../raydium'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Decimal } from 'decimal.js'
import { Solana } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  PositionInfo, 
  PositionInfoSchema,
  GetPositionInfoRequest,
  GetPositionInfoRequestType
} from '../../../schemas/trading-types/amm-schema'

/**
 * Calculate the LP token amount and corresponding token amounts
 */
async function calculateLpAmount(
    solana: Solana,
    walletAddress: PublicKey,
    _ammPoolInfo: any,
    poolInfo: any,
    poolAddress: string,
  ): Promise<{
    lpTokenAmount: number,
    baseTokenAmount: number,
    quoteTokenAmount: number
  }> {
    let lpMint: string
    
    // Get LP mint from poolInfo instead of poolKeys
    if (poolInfo.lpMint && poolInfo.lpMint.address) {
      lpMint = poolInfo.lpMint.address
    } else {
      throw new Error(`Could not find LP mint for pool ${poolAddress}`)
    }
    
    // Get user's LP token account
    const lpTokenAccounts = await solana.connection.getTokenAccountsByOwner(
      walletAddress,
      { mint: new PublicKey(lpMint) }
    )
    
    if (lpTokenAccounts.value.length === 0) {
      // Return zero values if no LP token account exists
      return {
        lpTokenAmount: 0,
        baseTokenAmount: 0,
        quoteTokenAmount: 0
      }
    }
    
    // Get LP token balance
    const lpTokenAccount = lpTokenAccounts.value[0].pubkey
    const accountInfo = await solana.connection.getTokenAccountBalance(lpTokenAccount)
    const lpTokenAmount = accountInfo.value.uiAmount || 0
    
    if (lpTokenAmount === 0) {
      return {
        lpTokenAmount: 0,
        baseTokenAmount: 0,
        quoteTokenAmount: 0
      }
    }

    // Calculate token amounts based on LP share
    const baseTokenAmount = lpTokenAmount * poolInfo.mintAmountA / poolInfo.lpAmount
    const quoteTokenAmount = lpTokenAmount * poolInfo.mintAmountB / poolInfo.lpAmount

    return {
      lpTokenAmount,
      baseTokenAmount: baseTokenAmount || 0,
      quoteTokenAmount: quoteTokenAmount || 0
    }
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  // Populate wallet address example
  let firstWalletAddress = '<solana-wallet-address>';
  try {
    const solana = await Solana.getInstance('mainnet-beta');
    const walletAddress = await solana.getFirstWalletAddress();
    if (walletAddress) {
      firstWalletAddress = walletAddress;
    }
  } catch (e) {
    logger.warn('Could not populate wallet address example:', e);
  }

  fastify.get<{
    Querystring: GetPositionInfoRequestType
    Reply: PositionInfo
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get info about a Raydium AMM position',
        tags: ['raydium/amm'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', examples: ['mainnet-beta'] },
            poolAddress: { 
              type: 'string', 
              examples: ['AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA'] 
            },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            walletAddress: { 
              type: 'string', 
              examples: [firstWalletAddress] 
            }
          }
        },
        response: {
          200: PositionInfoSchema
        }
      }
    },
    async (request) => {
      try {
        const { poolAddress, walletAddress, baseToken, quoteToken } = request.query
        const network = request.query.network || 'mainnet-beta'
        
        // Check if either poolAddress or both baseToken and quoteToken are provided
        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either poolAddress or both baseToken and quoteToken must be provided'
          );
        }
        
        // Validate wallet address
        try {
          new PublicKey(walletAddress)
        } catch (error) {
          throw fastify.httpErrors.badRequest('Invalid wallet address')
        }

        const raydium = await Raydium.getInstance(network)
        const solana = await Solana.getInstance(network)

        // If no pool address provided, find default pool using base and quote tokens
        let poolAddressToUse = poolAddress;
        if (!poolAddressToUse) {
          poolAddressToUse = await raydium.findDefaultPool(baseToken, quoteToken, 'amm');
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        // Validate pool address
        try {
          new PublicKey(poolAddressToUse)
        } catch (error) {
          throw fastify.httpErrors.badRequest('Invalid pool address')
        }

        // Get pool info
        const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddressToUse)
        const [poolInfo, poolKeys] = await raydium.getPoolfromAPI(poolAddressToUse)
        if (!poolInfo) {
          throw fastify.httpErrors.notFound('Pool not found')
        }

        // Calculate LP token amount and token amounts
        const { lpTokenAmount, baseTokenAmount, quoteTokenAmount } = await calculateLpAmount(
          solana,
          new PublicKey(walletAddress),
          ammPoolInfo,
          poolInfo,
          poolAddressToUse
        )

        return {
          poolAddress: poolAddressToUse,
          walletAddress,
          baseTokenAddress: ammPoolInfo.baseTokenAddress,
          quoteTokenAddress: ammPoolInfo.quoteTokenAddress,
          lpTokenAmount: lpTokenAmount,
          baseTokenAmount,
          quoteTokenAmount,
          price: poolInfo.price
        }
      } catch (e) {
        logger.error(e)
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message)
        }
        throw fastify.httpErrors.internalServerError('Failed to fetch position info')
      }
    }
  )
}

export default positionInfoRoute