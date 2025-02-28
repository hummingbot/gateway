import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { Raydium } from '../raydium'
import { logger } from '../../../services/logger'
import {
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapResponse
} from '../../../services/swap-interfaces'
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
  side: 'buy' | 'sell',
  poolAddress: string,
  slippagePct: number
): Promise<ExecuteSwapResponseType> {
  const solana = await Solana.getInstance(network)
  const raydium = await Raydium.getInstance(network)
  const wallet = await solana.getWallet(walletAddress)

  // Get pool info from address
  const poolInfo = await raydium.getAmmPoolInfo(poolAddress)
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`)
  }

  // Get swap quote
  const quote = await getRawSwapQuote(
    raydium,
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side,
    slippagePct
  )

  const inputToken = quote.inputToken
  const outputToken = quote.outputToken

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`)

  const COMPUTE_UNITS = 600000;
  let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE;
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS);
    let transaction: VersionedTransaction;

    // Get transaction based on pool type
    if (poolInfo.poolType === 'amm') {
      if (side === 'buy') {
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
      if (side === 'buy') {
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
          slippage: slippagePct / 100,
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
          slippage: slippagePct / 100,
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
  
      logger.info(`Swap executed successfully: ${Math.abs(side === 'sell' ? baseTokenBalanceChange : quoteTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(side === 'sell' ? quoteTokenBalanceChange : baseTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`);
    
      return {
        signature,
        totalInputSwapped: Math.abs(side === 'sell' ? baseTokenBalanceChange : quoteTokenBalanceChange),
        totalOutputSwapped: Math.abs(side === 'sell' ? quoteTokenBalanceChange : baseTokenBalanceChange),
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
  
  ExecuteSwapRequest.properties.walletAddress.examples = [firstWalletAddress]

  fastify.post<{
    Body: ExecuteSwapRequestType;
    Reply: ExecuteSwapResponseType;
  }>(
    '/execute-swap',
    {
      schema: {
        description: 'Execute a swap on Raydium AMM or CPMM',
        tags: ['raydium-amm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['RAY'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', examples: ['sell'] },
            poolAddress: { type: 'string', examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'] }, // AMM
            // poolAddress: { type: 'string', examples: ['7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny'] }, // CPMM
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: { 200: ExecuteSwapResponse }
      }
    },
    async (request) => {
      try {
        const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body
        return await executeSwap(
          fastify,
          network || 'mainnet-beta',
          walletAddress,
          baseToken,
          quoteToken,
          amount,
          side as 'buy' | 'sell',
          poolAddress,
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