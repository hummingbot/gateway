import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { Raydium } from '../raydium'
import { logger } from '../../../services/logger'
import {
  ExecuteSwapResponse,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapRequestType
} from '../../../schemas/trading-types/swap-schema'
import { getRawSwapQuote } from './quoteSwap'
import BN from 'bn.js'
import { VersionedTransaction } from '@solana/web3.js'

async function executeSwap(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL',
  poolAddress: string,
  slippagePct?: number
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network)
  const raydium = await Raydium.getInstance(network)
  const wallet = await solana.getWallet(walletAddress)

  // Get pool info from address
  const poolInfo = await raydium.getAmmPoolInfo(poolAddress)
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`)
  }

  // Use configured slippage if not provided
  const effectiveSlippage = slippagePct || raydium.getSlippagePct()

  // Get swap quote
  const quote = await getRawSwapQuote(
    raydium,
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    effectiveSlippage
  )

  const inputToken = quote.inputToken
  const outputToken = quote.outputToken

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`)

  const COMPUTE_UNITS = 600000;
  let currentPriorityFee = (await solana.estimateGas() * 1e9) - BASE_FEE;
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS);
    let transaction: VersionedTransaction;

    // Get transaction based on pool type
    if (poolInfo.poolType === 'amm') {
      if (side === 'BUY') {
        // AMM swap base out (exact output)
        ({ transaction } = await raydium.raydiumSDK.liquidity.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          amountIn: quote.maxAmountIn,
          amountOut: new BN(quote.amountOut), 
          fixedSide: 'out',
          inputMint: inputToken.address,
          txVersion: raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        }) as { transaction: VersionedTransaction })
      } else {
        // AMM swap (exact input)
        ({ transaction } = await raydium.raydiumSDK.liquidity.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          amountIn: new BN(quote.amountIn),
          amountOut: quote.minAmountOut, 
          fixedSide: 'in',
          inputMint: inputToken.address,
          txVersion: raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        }) as { transaction: VersionedTransaction })
      }
    } else if (poolInfo.poolType === 'cpmm') {
      if (side === 'BUY') {
        // CPMM swap base out (exact output)
        ({ transaction } = await raydium.raydiumSDK.cpmm.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          inputAmount: new BN(0), // not used when fixedOut is true
          fixedOut: true,
          swapResult: {
            sourceAmountSwapped: quote.amountIn,
            destinationAmountSwapped: new BN(quote.amountOut),
          },
          slippage: effectiveSlippage / 100,
          baseIn: inputToken.address === quote.poolInfo.mintA.address,
          txVersion: raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        }) as { transaction: VersionedTransaction })
      } else {
        // CPMM swap (exact input)
        ({ transaction } = await raydium.raydiumSDK.cpmm.swap({
          poolInfo: quote.poolInfo,
          poolKeys: quote.poolKeys,
          inputAmount: quote.amountIn,
          swapResult: {
            sourceAmountSwapped: quote.amountIn,
            destinationAmountSwapped: quote.amountOut,
          },
          slippage: effectiveSlippage / 100,
          baseIn: inputToken.address === quote.poolInfo.mintA.address,
          txVersion: raydium.txVersion,
          computeBudgetConfig: {
            units: COMPUTE_UNITS,
            microLamports: priorityFeePerCU,
          },
        }) as { transaction: VersionedTransaction })
      }
    } else {
      throw new Error(`Unsupported pool type: ${poolInfo.poolType}`)
    }

    transaction.sign([wallet]);
    await solana.simulateTransaction(transaction as VersionedTransaction);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
    if (confirmed && txData) {
      const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
        await solana.extractPairBalanceChangesAndFee(
          signature,
          await solana.getToken(poolInfo.baseTokenAddress),
          await solana.getToken(poolInfo.quoteTokenAddress),
          wallet.publicKey.toBase58()
        );
  
      logger.info(`Swap executed successfully: ${Math.abs(side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`);
    
      return {
        signature,
        totalInputSwapped: Math.abs(side === 'SELL' ? baseTokenBalanceChange : quoteTokenBalanceChange),
        totalOutputSwapped: Math.abs(side === 'SELL' ? quoteTokenBalanceChange : baseTokenBalanceChange),
        fee: txData.meta.fee / 1e9,
        baseTokenBalanceChange,
        quoteTokenBalanceChange,
      }
    }
    currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier
    logger.info(`Increasing priority fee to ${currentPriorityFee} lamports/CU (max fee of ${(currentPriorityFee / 1e9).toFixed(6)} SOL)`);
  }
  throw new Error(`Swap execution failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`);
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta')
  let firstWalletAddress = '<solana-wallet-address>'
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress() || firstWalletAddress
  } catch (error) {
    logger.warn('No wallets found for examples in schema')
  }
  
  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Raydium AMM or CPMM',
        tags: ['raydium/amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.01] },
            side: { type: 'string', examples: ['SELL'] },
            poolAddress: { type: 'string', examples: [''] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: { 200: ExecuteSwapResponse }
      }
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body
        const networkToUse = network || 'mainnet-beta'

        // If no pool address provided, find default pool
        let poolAddressToUse = poolAddress;
        if (!poolAddressToUse) {
          const raydium = await Raydium.getInstance(networkToUse);
          poolAddressToUse = await raydium.findDefaultPool(baseToken, quoteToken, 'amm');
          if (!poolAddressToUse) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`
            );
          }
        }

        return await executeSwap(
          fastify,
          networkToUse,
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          poolAddressToUse,
          slippagePct
        )
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Swap execution failed')
      }
    }
  )
}

export default executeSwapRoute