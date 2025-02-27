import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Raydium } from '../raydium'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType,
} from '../../../services/clmm-interfaces'
import { PoolUtils, TxVersion } from '@raydium-io/raydium-sdk-v2'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { quotePosition } from './quotePosition';


async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network)
  const raydium = await Raydium.getInstance(network)
  const wallet = await solana.getWallet(walletAddress);

  const positionInfo = await raydium.getPositionInfo(positionAddress);
  const position = await raydium.getClmmPosition(positionAddress);
  if (!position) throw new Error('Position not found');
  
  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolAddress);
  // const clmmPool = await raydium.getClmmPoolfromRPC(positionInfo.poolAddress);

  const baseToken = await solana.getToken(poolInfo.mintA.address)
  const quoteToken = await solana.getToken(poolInfo.mintB.address)

  const quotePositionResponse = await quotePosition(
    _fastify,
    network,
    positionInfo.lowerPrice,
    positionInfo.upperPrice,
    positionInfo.poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct
  );
  console.log('quotePositionResponse', quotePositionResponse)
  logger.info('Adding liquidity to Raydium CLMM position...');
  const COMPUTE_UNITS = 300000
  let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS)

    const { transaction } = await raydium.raydiumSDK.clmm.increasePositionFromBase({
      poolInfo,
      ownerPosition: position,
      ownerInfo: { useSOLBalance: true },
      base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
      baseAmount: quotePositionResponse.baseLimited ? new BN(quotePositionResponse.baseTokenAmount * (10 ** baseToken.decimals)) : new BN(quotePositionResponse.quoteTokenAmount * (10 ** quoteToken.decimals)),
      otherAmountMax: quotePositionResponse.baseLimited ? new BN(quotePositionResponse.quoteTokenAmountMax * (10 ** quoteToken.decimals)) : new BN(quotePositionResponse.baseTokenAmountMax * (10 ** baseToken.decimals)),
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    })

    // const { transaction } = await raydium.raydiumSDK.clmm.increasePositionFromLiquidity({
    //   poolInfo,
    //   poolKeys,
    //   ownerPosition: position,
    //   ownerInfo: { useSOLBalance: true },
    //   liquidity: quotePositionResponse.liquidity,
    //   amountMaxA: new BN(quotePositionResponse.baseTokenAmountMax * (10 ** baseToken.decimals)),
    //   amountMaxB: new BN(quotePositionResponse.quoteTokenAmountMax * (10 ** quoteToken.decimals)),
    //   txVersion: TxVersion.V0,
    //   computeBudgetConfig: {
    //     units: COMPUTE_UNITS,
    //     microLamports: priorityFeePerCU,
    //   },
    // })

    transaction.sign([wallet]);
    await solana.simulateTransaction(transaction);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
    if (confirmed && txData) {
      const totalFee = txData.meta.fee;
      const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
      await solana.extractPairBalanceChangesAndFee(
        signature,
        baseToken,
        quoteToken,
        wallet.publicKey.toBase58()
      );
      return {
        signature,
        fee: totalFee / 1e9,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      }
    }
    currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier
    logger.info(`Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`);
  }
  throw new Error(`Add liquidity failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`);
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddLiquidityRequestType
    Reply: AddLiquidityResponseType
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to existing Raydium CLMM position',
        tags: ['raydium-clmm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            slippagePct: { type: 'number', examples: [1] },
            network: { type: 'string', default: 'mainnet-beta' }
          }
        },
        response: {
          200: AddLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct 
        } = request.body
        
        return await addLiquidity(
          fastify,
          network || 'mainnet-beta',
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        )
      } catch (e) {
        logger.error(e)
        throw fastify.httpErrors.internalServerError('Internal server error')
      }
    }
  )
}

export default addLiquidityRoute
