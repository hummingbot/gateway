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
import { getSwapQuote } from './quoteSwap'
import {
  ReturnTypeComputeAmountOutFormat,
  ReturnTypeComputeAmountOutBaseOut
} from '@raydium-io/raydium-sdk-v2';
import { VersionedTransaction } from '@solana/web3.js';


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
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress)
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
  }
  console.log('poolInfo', poolInfo)
  console.log('poolKeys', poolKeys)

  const { inputToken, outputToken, response, clmmPoolInfo } = await getSwapQuote(
    fastify,
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    poolAddress,
    slippagePct
  );

  logger.info(`Executing ${amount.toFixed(4)} ${side} swap in pool ${poolAddress}`);

  const COMPUTE_UNITS = 600000;
  let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE;
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS);
    let transaction : VersionedTransaction;
    if (side === 'buy') {
      const exactOutResponse = response as ReturnTypeComputeAmountOutBaseOut;    
      ({ transaction } = await raydium.raydiumSDK.clmm.swapBaseOut({
        poolInfo,
        poolKeys,
        outputMint: outputToken.address,
        amountInMax: exactOutResponse.maxAmountIn.amount,
        amountOut: exactOutResponse.realAmountOut.amount,
        observationId: clmmPoolInfo.observationId,
        ownerInfo: {
          useSOLBalance: true,
        },
        txVersion: raydium.txVersion,
        remainingAccounts: exactOutResponse.remainingAccounts,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      }) as { transaction: VersionedTransaction });
    } else {
      const exactInResponse = response as ReturnTypeComputeAmountOutFormat;
      ({ transaction } = await raydium.raydiumSDK.clmm.swap({
        poolInfo,
        poolKeys,
        inputMint: inputToken.address,
        amountIn: exactInResponse.realAmountIn.amount.raw,
        amountOutMin: exactInResponse.minAmountOut.amount.raw,
        observationId: clmmPoolInfo.observationId,
        ownerInfo: {
          useSOLBalance: true,
        },
        remainingAccounts: exactInResponse.remainingAccounts,
        txVersion: raydium.txVersion,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      }) as { transaction: VersionedTransaction });
    }

    transaction.sign([wallet]);
    await solana.simulateTransaction(transaction as VersionedTransaction);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
    if (confirmed && txData) {
      const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
        await solana.extractPairBalanceChangesAndFee(
          signature,
          await solana.getToken(poolInfo.mintA.address),
          await solana.getToken(poolInfo.mintB.address),
          wallet.publicKey.toBase58()
        );
  
      logger.info(`Swap executed successfully: ${Math.abs(baseTokenBalanceChange).toFixed(4)} ${inputToken.symbol} -> ${Math.abs(quoteTokenBalanceChange).toFixed(4)} ${outputToken.symbol}`);
    
      return {
        signature,
        totalInputSwapped: Math.abs(baseTokenBalanceChange),
        totalOutputSwapped: Math.abs(quoteTokenBalanceChange),
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
        description: 'Execute a swap on Raydium CLMM',
        tags: ['raydium-clmm'],
        body: {
          ...ExecuteSwapRequest,
          properties: {
            ...ExecuteSwapRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            baseToken: { type: 'string', examples: ['SOL'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [0.1] },
            side: { type: 'string', examples: ['sell'] },
            poolAddress: { type: 'string', examples: ['3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'] },
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