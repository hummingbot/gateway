// import { FastifyPluginAsync, FastifyInstance } from 'fastify'
// import { Solana } from '../../../chains/solana/solana'
// import { RaydiumCLMM } from '../raydium-clmm'
// import { logger } from '../../../services/logger'
// import Decimal from 'decimal.js'
// import {
//     ApiV3PoolInfoConcentratedItem,
//     ClmmKeys,
//     ComputeClmmPoolInfo,
//     PoolUtils,
//     ReturnTypeFetchMultiplePoolTickArrays,
//   } from '@raydium-io/raydium-sdk-v2'
//   import BN from 'bn.js'
// import { NATIVE_MINT } from '@solana/spl-token'
// import {
//   ExecuteSwapRequestType,
//   ExecuteSwapResponseType,
//   ExecuteSwapRequest,
//   ExecuteSwapResponse
// } from '../../../services/swap-interfaces'
// import { getSwapQuote } from './quoteSwap'


// async function executeSwap(
//   fastify: FastifyInstance,
//   network: string,
//   walletAddress: string,
//   baseToken: string,
//   quoteToken: string,
//   amount: number,
//   side: 'buy' | 'sell',
//   poolAddress: string,
//   slippagePct: number
// ): Promise<ExecuteSwapResponseType> {
//   const solana = await Solana.getInstance(network)
//   const raydium = await RaydiumCLMM.getInstance(network)
//   const wallet = await solana.getWallet(walletAddress)

//   // Get pool info from address
//   const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress)
//   if (!poolInfo || !poolKeys) {
//     throw fastify.httpErrors.notFound(`CLMM pool not found: ${poolAddress}`)
//   }

//   // Determine swap direction
//   const isBaseToQuote = side === 'sell'
//   const inputMint = isBaseToQuote ? baseToken : quoteToken
//   const outputMint = isBaseToQuote ? quoteToken : baseToken
  
//   // Convert amount to BN with proper decimals
//   const inputMintToken = await solana.getToken(inputMint)
//   const inputDecimals = inputMintToken?.decimals || 0
//   const amountBN = new BN(amount * 10 ** inputDecimals)

//   const {
//     estimatedAmountIn,
//     estimatedAmountOut,
//     minAmountOut,
//     maxAmountIn,
//     baseTokenBalanceChange,
//     quoteTokenBalanceChange
//   } = await getSwapQuote(
//     fastify,
//     network,
//     baseToken,
//     quoteToken,
//     amount,
//     side,
//     poolAddress,
//     slippagePct
//   );

//   const swapTx = side === 'buy'
//     ? await raydium.raydium.clmm.swap({
//       poolInfo,
//       poolKeys,
//       inputMint: poolInfo[baseIn ? 'mintA' : 'mintB'].address,
//       amountIn: amountBN,
//       amountOutMin: minAmountOut,
//       observationId: poolInfo.observationId,
//       ownerInfo: {
//         useSOLBalance: true, // if wish to use existed wsol token account, pass false
//       },
//       remainingAccounts,
//       txVersion,
//       computeBudgetConfig: {
//         units: 600000,
//         microLamports: 1000000,
//       },
//     })
//     : await raydium.raydium.clmm.swapBaseOut({
//       poolInfo,
//       poolKeys,
//       outputMint,
//       amountInMax: amountBN,
//       amountOut: res.realAmountOut.amount,
//       observationId: clmmPoolInfo.observationId,
//       ownerInfo: {
//         useSOLBalance: true, // if wish to use existed wsol token account, pass false
//       },
//       remainingAccounts,
//       txVersion,
//       computeBudgetConfig: {
//         units: 600000,
//         microLamports: 1000000,
//       },
//     })
    

//   const { signature, fee } = await solana.sendAndConfirmTransaction(swapTx, [wallet])
  
//   // Extract balance changes
//   const inputToken = await solana.getToken(inputMint)
//   const outputToken = await solana.getToken(outputMint)
  
//   const { balanceChange: inputChange } = await solana.extractTokenBalanceChangeAndFee(
//     signature,
//     inputMint,
//     wallet.publicKey.toBase58()
//   )
  
//   const { balanceChange: outputChange } = await solana.extractTokenBalanceChangeAndFee(
//     signature,
//     outputMint,
//     wallet.publicKey.toBase58()
//   )

//   return {
//     signature,
//     totalInputSwapped: Math.abs(inputChange),
//     totalOutputSwapped: Math.abs(outputChange),
//     fee,
//     baseTokenBalanceChange: side === 'sell' ? -inputChange : outputChange,
//     quoteTokenBalanceChange: side === 'sell' ? outputChange : -inputChange
//   }
// }

// export const executeSwapRoute: FastifyPluginAsync = async (fastify) => {
//   // Get first wallet address for example
//   const solana = await Solana.getInstance('mainnet-beta')
//   let firstWalletAddress = '<solana-wallet-address>'
  
//   try {
//     firstWalletAddress = await solana.getFirstWalletAddress() || firstWalletAddress
//   } catch (error) {
//     logger.warn('No wallets found for examples in schema')
//   }
  
//   ExecuteSwapRequest.properties.walletAddress.examples = [firstWalletAddress]

//   fastify.post<{
//     Body: ExecuteSwapRequestType;
//     Reply: ExecuteSwapResponseType;
//   }>(
//     '/execute-swap',
//     {
//       schema: {
//         description: 'Execute a swap on Raydium CLMM',
//         tags: ['raydium-clmm'],
//         body: {
//           ...ExecuteSwapRequest,
//           properties: {
//             ...ExecuteSwapRequest.properties,
//             network: { type: 'string', default: 'mainnet-beta' },
//             baseToken: { type: 'string', examples: ['RAY'] },
//             quoteToken: { type: 'string', examples: ['USDC'] },
//             amount: { type: 'number', examples: [1] },
//             side: { type: 'string', examples: ['sell'] },
//             poolAddress: { type: 'string', examples: ['61R1ndXxvsWXXkWSyNkCxnzwd3zUNB8Q2ibmkiLPC8ht'] },
//             slippagePct: { type: 'number', examples: [1] }
//           }
//         },
//         response: { 200: ExecuteSwapResponse }
//       }
//     },
//     async (request) => {
//       try {
//         const { network, walletAddress, baseToken, quoteToken, amount, side, poolAddress, slippagePct } = request.body
//         return await executeSwap(
//           fastify,
//           network || 'mainnet-beta',
//           walletAddress,
//           baseToken,
//           quoteToken,
//           amount,
//           side as 'buy' | 'sell',
//           poolAddress,
//           slippagePct
//         )
//       } catch (e) {
//         logger.error('Swap error:', e)
//         if (e.statusCode) {
//           throw fastify.httpErrors.createError(e.statusCode, e.message)
//         }
//         throw fastify.httpErrors.internalServerError('Swap execution failed')
//       }
//     }
//   )
// }

// export default executeSwapRoute