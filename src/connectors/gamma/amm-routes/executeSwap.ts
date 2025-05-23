import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { Gamma } from '../gamma'
import { logger } from '../../../services/logger'
import {
  ExecuteSwapResponse,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapRequestType
} from '../../../schemas/swap-schema'
import { getRawSwapQuote } from './quoteSwap'
import { VersionedTransaction } from '@solana/web3.js'
import { TxVersion } from 'goosefx-amm-sdk'

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
  // Convert side to exactIn
  const exactIn = side === 'SELL';
  if (!exactIn) {
    throw new Error(`BUY side(Exact Out) not supported by Gamma oracle swaps`)
  }

  const solana = await Solana.getInstance(network)
  const gamma = await Gamma.getInstance(network)
  const wallet = await solana.getWallet(walletAddress)

  // Get pool info from address
  const poolInfo = await gamma.getAmmPoolInfo(poolAddress)
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`)
  }

  // Use configured slippage if not provided
  const effectiveSlippage = slippagePct || gamma.getSlippagePct('amm')

  // Get swap quote
  const quote = await getRawSwapQuote(
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
    let { transaction } = await gamma.client.cpmm.swapWithOracle({
      poolInfo: quote.poolInfo,
      poolKeys: quote.poolKeys,
      zeroForOne: quote.zeroForOne,
      swapResult: quote,
      slippage: effectiveSlippage / 100,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    })

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
        description: 'Execute a swap on Gamma',
        tags: ['gamma/amm'],
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
            poolAddress: { type: 'string', examples: ['Hjm1F98vgVdN7Y9L46KLqcZZWyTKS9tj9ybYKJcXnSng'] },
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
          const gamma = await Gamma.getInstance(networkToUse);
          poolAddressToUse = await gamma.findDefaultPool(baseToken, quoteToken, 'amm');
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