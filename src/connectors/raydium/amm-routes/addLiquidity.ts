import { FastifyPluginAsync, FastifyInstance } from 'fastify'
import { Raydium } from '../raydium'
import { Solana, BASE_FEE } from '../../../chains/solana/solana'
import { logger } from '../../../services/logger'
import { 
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType,
  QuoteLiquidityResponseType,
} from '../../../services/amm-interfaces'
import { 
  AmmV4Keys,
  CpmmKeys,
  ApiV3PoolInfoStandardItem,
  ApiV3PoolInfoStandardItemCpmm,
  Percent,
  TokenAmount,
  toToken,
} from '@raydium-io/raydium-sdk-v2'
import { quoteLiquidity } from './quoteLiquidity'
import Decimal from 'decimal.js'
import BN from 'bn.js'
import { VersionedTransaction } from '@solana/web3.js'

async function createAddLiquidityTransaction(
  raydium: Raydium,
  ammPoolInfo: any,
  poolInfo: any,
  poolKeys: any,
  baseTokenAmountAdded: number,
  quoteTokenAmountAdded: number,
  baseLimited: boolean,
  slippage: Percent,
  computeBudgetConfig: { units: number; microLamports: number }
): Promise<VersionedTransaction> {
  if (ammPoolInfo.poolType === 'amm') {
    const response = await raydium.raydiumSDK.liquidity.addLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItem,
      poolKeys: poolKeys as AmmV4Keys,
      amountInA: new TokenAmount(
        toToken(poolInfo.mintA),
        new Decimal(baseTokenAmountAdded).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
      ),
      amountInB: new TokenAmount(
        toToken(poolInfo.mintB),
        new Decimal(quoteTokenAmountAdded).mul(10 ** poolInfo.mintB.decimals).toFixed(0)
      ),
      fixedSide: baseLimited ? 'a' : 'b',
      txVersion: raydium.txVersion,
      computeBudgetConfig,
    })
    return response.transaction as VersionedTransaction
  } else if (ammPoolInfo.poolType === 'cpmm') {
    const baseIn = baseLimited;
    const inputAmount = new BN(
      new Decimal(baseLimited ? baseTokenAmountAdded : quoteTokenAmountAdded)
        .mul(10 ** (baseLimited ? poolInfo.mintA.decimals : poolInfo.mintB.decimals))
        .toFixed(0)
    );
    const response = await raydium.raydiumSDK.cpmm.addLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      poolKeys: poolKeys as CpmmKeys,
      inputAmount,
      slippage,
      baseIn,
      txVersion: raydium.txVersion,
      computeBudgetConfig,
    })
    return response.transaction as VersionedTransaction
  }
  throw new Error(`Unsupported pool type: ${ammPoolInfo.poolType}`)
}

async function addLiquidity(
    _fastify: FastifyInstance,
    network: string,
    walletAddress: string,
    poolAddress: string,
    baseTokenAmount: number,
    quoteTokenAmount: number,
    slippagePct?: number
  ): Promise<AddLiquidityResponseType> {
    const solana = await Solana.getInstance(network)
    const raydium = await Raydium.getInstance(network)
    const wallet = await solana.getWallet(walletAddress);

    const ammPoolInfo = await raydium.getAmmPoolInfo(poolAddress);
    const { poolInfo, poolKeys, baseLimited, baseTokenAmountMax, quoteTokenAmountMax } = await quoteLiquidity(
      _fastify,
      network,
      poolAddress,
      baseTokenAmount,
      quoteTokenAmount,
      slippagePct
    ) as QuoteLiquidityResponseType;

    const baseTokenAmountAdded = baseLimited ? baseTokenAmount : baseTokenAmountMax;
    const quoteTokenAmountAdded = baseLimited ? quoteTokenAmount : quoteTokenAmountMax;

    logger.info(`Adding liquidity to Raydium ${ammPoolInfo.poolType} position...`);
    const COMPUTE_UNITS = 600000
    const slippage = new Percent(
      Math.floor(((slippagePct === 0 ? 0 : slippagePct || raydium.getSlippagePct())) * 100), 
      10000
    );

    let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE
    while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
      const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS)
      
      const transaction = await createAddLiquidityTransaction(
        raydium,
        ammPoolInfo,
        poolInfo,
        poolKeys,
        baseTokenAmountAdded,
        quoteTokenAmountAdded,
        baseLimited,
        slippage,
        {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        }
      )
      console.log('transaction', transaction);

      transaction.sign([wallet]);
      await solana.simulateTransaction(transaction);
  
      console.log('signed transaction', transaction);

      const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
      if (confirmed && txData) {
        const { baseTokenBalanceChange, quoteTokenBalanceChange } = 
        await solana.extractPairBalanceChangesAndFee(
          signature,
          await solana.getToken(poolInfo.mintA.address),
          await solana.getToken(poolInfo.mintB.address),
          wallet.publicKey.toBase58()
        );
          return {
          signature,
          fee: txData.meta.fee / 1e9,
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
          description: 'Add liquidity to a Raydium AMM/CPMM pool',
          tags: ['raydium-amm'],
          body: {
            ...AddLiquidityRequest,
            properties: {
              ...AddLiquidityRequest.properties,
              network: { type: 'string', default: 'mainnet-beta' },
              poolAddress: { type: 'string', examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'] },
              slippagePct: { type: 'number', examples: [1] },
              baseTokenAmount: { type: 'number', examples: [1] },
              quoteTokenAmount: { type: 'number', examples: [5] },
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
            poolAddress,
            baseTokenAmount,
            quoteTokenAmount,
            slippagePct 
          } = request.body
          
          return await addLiquidity(
            fastify,
            network || 'mainnet-beta',
            walletAddress,
            poolAddress,
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
  