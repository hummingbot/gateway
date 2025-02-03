// import { PublicKey } from '@solana/web3.js'
// import { FastifyPluginAsync } from 'fastify'
// import { RaydiumCLMM } from '../raydium-clmm'
// import { Solana } from '../../../chains/solana/solana'
// import { logger } from '../../../services/logger'
// import { 
//   PositionInfo, 
//   PositionInfoSchema, 
//   GetPositionInfoRequestType, 
//   GetPositionInfoRequest 
// } from '../../../services/clmm-interfaces'

// export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
//   // Get first wallet address for example
//   const solana = await Solana.getInstance('mainnet-beta')
//   let firstWalletAddress = '<solana-wallet-address>'
  
//   const foundWallet = await solana.getFirstWalletAddress()
//   if (foundWallet) {
//     firstWalletAddress = foundWallet
//   } else {
//     logger.debug('No wallets found for examples in schema')
//   }
  
//   // Update schema example
//   GetPositionInfoRequest.properties.walletAddress.examples = [firstWalletAddress]

//   fastify.get<{
//     Querystring: GetPositionInfoRequestType
//     Reply: PositionInfo
//   }>(
//     '/position-info',
//     {
//       schema: {
//         description: 'Get info about a Raydium CLMM position',
//         tags: ['raydium-clmm'],
//         querystring: GetPositionInfoRequest,
//         response: {
//           200: PositionInfoSchema
//         }
//       }
//     },
//     async (request) => {
//       const { network = 'mainnet-beta', walletAddress, positionAddress } = request.query
//       const raydium = await RaydiumCLMM.getInstance(network)
//       return raydium.getPositionInfo(positionAddress, new PublicKey(walletAddress))
//     }
//   )
// }

// export default positionInfoRoute
