import {
    ApiV3PoolInfoConcentratedItem,
    ClmmKeys,
    ComputeClmmPoolInfo,
    PoolUtils,
    ReturnTypeFetchMultiplePoolTickArrays,
  } from '@raydium-io/raydium-sdk-v2'
  import BN from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'
import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { RaydiumCLMM } from '../raydium-clmm'
import { Solana } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
  ExecuteSwapRequest,
  ExecuteSwapResponse
} from '../../../services/swap-interfaces'
import Decimal from 'decimal.js'

async function getPoolAndValidateMint(
  raydium: RaydiumCLMM,
  solana: Solana,
  poolId: string,
  mint: string,
  isInputMint: boolean
) {
  let poolInfo: ApiV3PoolInfoConcentratedItem;
  let poolKeys: ClmmKeys | undefined;
  let clmmPoolInfo: ComputeClmmPoolInfo;
  let tickCache: ReturnTypeFetchMultiplePoolTickArrays;

  if (solana.network === 'mainnet-beta') {
    const data = await raydium.raydium.api.fetchPoolById({ ids: poolId });
    poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
    
    clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
      connection: solana.connection,
      poolInfo,
    });
    
    tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
      connection: solana.connection,
      poolKeys: [clmmPoolInfo],
    });
  } else {
    const data = await raydium.raydium.clmm.getPoolInfoFromRpc(poolId);
    poolInfo = data.poolInfo;
    poolKeys = data.poolKeys;
    clmmPoolInfo = data.computePoolInfo;
    tickCache = data.tickData;
  }

  // Validate mint against pool
  const mintInPool = [poolInfo.mintA.address, poolInfo.mintB.address].includes(mint);
  if (!mintInPool) {
    throw new Error(`${isInputMint ? 'Input' : 'Output'} mint ${mint} not found in pool`);
  }

  return { poolInfo, poolKeys, clmmPoolInfo, tickCache };
}

export const swap = async (inputMint: string, poolId: string, inputAmount: BN) => {
  const raydium = await RaydiumCLMM.getInstance('mainnet-beta');
  const solana = await Solana.getInstance('mainnet-beta');
  
  const { poolInfo, poolKeys, clmmPoolInfo, tickCache } = await getPoolAndValidateMint(
    raydium,
    solana,
    poolId,
    inputMint,
    true
  );

  const baseIn = inputMint === poolInfo.mintA.address;

  const { minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
    poolInfo: clmmPoolInfo,
    tickArrayCache: tickCache[poolId],
    amountIn: inputAmount,
    tokenOut: poolInfo[baseIn ? 'mintB' : 'mintA'],
    slippage: 0.01,
    epochInfo: await raydium.raydium.fetchEpochInfo(),
  })

  // For buy transactions
  const { execute } = await raydium.raydium.clmm.swap({
    poolInfo,
    poolKeys,
    inputMint: poolInfo[baseIn ? 'mintA' : 'mintB'].address,
    amountIn: inputAmount,
    amountOutMin: minAmountOut.amount.raw,
    observationId: clmmPoolInfo.observationId,
    ownerInfo: {
      useSOLBalance: true, // if wish to use existed wsol token account, pass false
    },
    remainingAccounts,
    txVersion,

    // optional: set up priority fee here
    // computeBudgetConfig: {
    //   units: 600000,
    //   microLamports: 1000000,
    // },
  })

  const { txId } = await execute()
  console.log('swapped in clmm pool:', { txId })
}

/** uncomment code below to execute */
// swap()


// For sell transactions
// swapBaseOut means fixed output token amount, calculate needed input token amount
export const swapBaseOut = async (outputMint: string, poolId: string, amountOut: BN) => {
  const raydium = await RaydiumCLMM.getInstance('mainnet-beta');
  const solana = await Solana.getInstance('mainnet-beta');

  const { poolInfo, poolKeys, clmmPoolInfo, tickCache } = await getPoolAndValidateMint(
    raydium,
    solana,
    poolId,
    outputMint,
    false
  );

  const { remainingAccounts, ...res } = await PoolUtils.computeAmountIn({
    poolInfo: clmmPoolInfo,
    tickArrayCache: tickCache[poolId],
    amountOut,
    baseMint: NATIVE_MINT,
    slippage: 0.01,
    epochInfo: await raydium.raydium.fetchEpochInfo(),
  })

  const [mintIn, mintOut] =
    outputMint === poolInfo.mintB.address
      ? [poolInfo.mintA, poolInfo.mintB]
      : [poolInfo.mintB, poolInfo.mintA]

  console.log({
    amountIn: `${new Decimal(res.amountIn.amount.toString()).div(10 ** mintIn.decimals).toString()} ${mintIn.symbol}`,
    maxAmountIn: `${new Decimal(res.maxAmountIn.amount.toString()).div(10 ** mintIn.decimals).toString()} ${
      mintIn.symbol
    }`,
    realAmountOut: `${new Decimal(res.realAmountOut.amount.toString()).div(10 ** mintOut.decimals).toString()} ${
      mintOut.symbol
    }`,
  })

  const { execute } = await raydium.raydium.clmm.swapBaseOut({
    poolInfo,
    poolKeys,
    outputMint,
    amountInMax: res.maxAmountIn.amount,
    amountOut: res.realAmountOut.amount,
    observationId: clmmPoolInfo.observationId,
    ownerInfo: {
      useSOLBalance: true, // if wish to use existed wsol token account, pass false
    },
    remainingAccounts,
    txVersion,

    // optional: set up priority fee here
    computeBudgetConfig: {
      units: 600000,
      microLamports: 1000000,
    },
  })
}

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
  const raydium = await RaydiumCLMM.getInstance(network)
  const wallet = await solana.getWallet(walletAddress)

  // Get pool info from address
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress)
  if (!poolInfo || !poolKeys) {
    throw fastify.httpErrors.notFound(`CLMM pool not found: ${poolAddress}`)
  }

  // Determine swap direction
  const isBaseToQuote = side === 'sell'
  const inputMint = isBaseToQuote ? baseToken : quoteToken
  const outputMint = isBaseToQuote ? quoteToken : baseToken
  
  // Convert amount to BN with proper decimals
  const inputMintToken = await solana.getToken(inputMint)
  const inputDecimals = inputMintToken?.decimals || 0
  const amountBN = new BN(amount * 10 ** inputDecimals)

  let swapParams
  if (side === 'sell') {
    // ExactIn swap (sell base token for quote token)
    const { minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
      poolInfo,
      amountIn: amountBN,
      slippage: slippagePct / 100,
      tokenOut: outputMint
    })

    swapParams = {
      poolInfo,
      poolKeys,
      inputMint,
      amountIn: amountBN,
      amountOutMin: minAmountOut.amount.raw,
      remainingAccounts
    }
  } else {
    // ExactOut swap (buy base token with quote token)
    const { maxAmountIn, remainingAccounts } = await PoolUtils.computeAmountInFormat({
      poolInfo,
      amountOut: amountBN,
      slippage: slippagePct / 100,
      tokenIn: inputMint
    })

    swapParams = {
      poolInfo,
      poolKeys,
      inputMint,
      amountIn: maxAmountIn.amount.raw,
      amountOut: amountBN,
      remainingAccounts
    }
  }

  const { transaction } = await raydium.raydium.clmm.swap({
    ...swapParams,
    ownerInfo: { useSOLBalance: true },
    txVersion: raydium.txVersion
  })

  const { signature, fee } = await solana.sendAndConfirmTransaction(transaction, [wallet])
  
  // Extract balance changes
  const inputToken = await solana.getToken(inputMint)
  const outputToken = await solana.getToken(outputMint)
  
  const { balanceChange: inputChange } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    inputMint,
    wallet.publicKey.toBase58()
  )
  
  const { balanceChange: outputChange } = await solana.extractTokenBalanceChangeAndFee(
    signature,
    outputMint,
    wallet.publicKey.toBase58()
  )

  return {
    signature,
    totalInputSwapped: Math.abs(inputChange),
    totalOutputSwapped: Math.abs(outputChange),
    fee,
    baseTokenBalanceChange: side === 'sell' ? -inputChange : outputChange,
    quoteTokenBalanceChange: side === 'sell' ? outputChange : -inputChange
  }
}

export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
  const solana = await Solana.getInstance('mainnet-beta')
  let firstWalletAddress = '<solana-wallet-address>'
  
  try {
    firstWalletAddress = await solana.getFirstWalletAddress() || firstWalletAddress
  } catch (error) {
    logger.debug('No wallets found for examples in schema')
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
            baseToken: { type: 'string', examples: ['RAY'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            amount: { type: 'number', examples: [1] },
            side: { type: 'string', examples: ['sell'] },
            poolAddress: { type: 'string', examples: ['61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht'] },
            slippagePct: { type: 'number', examples: [0.5] }
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
        logger.error('Swap error:', e)
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, e.message)
        }
        throw fastify.httpErrors.internalServerError('Swap execution failed')
      }
    }
  )
}

export default executeSwapRoute