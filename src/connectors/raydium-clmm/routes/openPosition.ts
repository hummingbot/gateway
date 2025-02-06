import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
import { Solana, BASE_FEE } from '../../../chains/solana/solana';
import { logger } from '../../../services/logger';
import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { 
  OpenPositionRequest,
  OpenPositionResponse,
  OpenPositionRequestType,
  OpenPositionResponseType,
} from '../../../services/clmm-interfaces';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { TickUtils, PoolUtils } from '@raydium-io/raydium-sdk-v2';


async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  _quoteTokenAmount?: number,
  slippagePct?: number
): Promise<OpenPositionResponseType> {
  try {
    const solana = await Solana.getInstance(network);
    const raydium = await RaydiumCLMM.getInstance(network);

    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress);
    const baseToken = await solana.getToken(poolInfo.mintA.address);
    const quoteToken = await solana.getToken(poolInfo.mintB.address);

    const { tick: lowerTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(lowerPrice),
      baseIn: true,
    })    
    const { tick: upperTick } = TickUtils.getPriceAndTick({
      poolInfo,
      price: new Decimal(upperPrice),
      baseIn: true,
    })

    // Allow opening position with 0 base token amount
    const amount = new Decimal(baseTokenAmount || '0').mul(10 ** baseToken.decimals).toFixed(0);
    const amountBN = new BN(amount);
    const epochInfo = await solana.connection.getEpochInfo()
    const res = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: (slippagePct / 100) || raydium.getSlippagePct(),
      inputA: true,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      amount: amountBN,
      add: true,
      amountHasFee: true,
      epochInfo: epochInfo,
    })

    const { 
      liquidity,
      amountA,
      amountB,
      amountSlippageA,
      amountSlippageB,
      expirationTime 
    } = res;
    console.log({
      liquidity: liquidity.toString(),
      amountA: Number(amountA.amount.toString()) / (10 ** baseToken.decimals),
      amountB: Number(amountB.amount.toString()) / (10 ** quoteToken.decimals),
      amountSlippageA: Number(amountSlippageA.amount.toString()) / (10 ** baseToken.decimals),
      amountSlippageB: Number(amountSlippageB.amount.toString()) / (10 ** quoteToken.decimals),
      expirationTime
    });
  
    logger.info('Opening Raydium CLMM position...');
    const COMPUTE_UNITS = 300000;
    let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE;
    while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
      const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS);
      const { transaction, extInfo } = await raydium.raydium.clmm.openPositionFromBase({
        poolInfo,
        poolKeys,
        tickUpper: Math.max(lowerTick, upperTick),
        tickLower: Math.min(lowerTick, upperTick),
        base: 'MintA',
        ownerInfo: {
          useSOLBalance: true,
        },
        baseAmount: amountBN,
        otherAmountMax: res.amountSlippageB.amount,
        txVersion: TxVersion.V0,
        computeBudgetConfig: {
          units: COMPUTE_UNITS,
          microLamports: priorityFeePerCU,
        },
      });
      // console.log('original tx:', _transaction);
      await solana.simulateTransaction(transaction);
      const wallet = await solana.getWallet(walletAddress);
      transaction.sign([wallet]);

      const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
      if (confirmed && txData) {
        const totalFee = txData.meta.fee;
        const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
        const positionRent = Math.abs(balanceChange);
    
        return {
          signature,
          fee: totalFee / 1e9,
          positionAddress: extInfo.nftMint.toBase58(),
          positionRent,
          baseTokenAmountAdded: Number(amountA.amount.toString()) / (10 ** baseToken.decimals),
          quoteTokenAmountAdded: Number(amountB.amount.toString()) / (10 ** quoteToken.decimals),
        };
      }
      currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier;
      logger.info(`Increasing max priority fee to ${(currentPriorityFee / 1e9).toFixed(6)} SOL`);
    }
    throw new Error(`Open position failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`);
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';
  
  const foundWallet = await solana.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }
  
  // Update schema example
  OpenPositionRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: OpenPositionRequestType;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new Raydium CLMM position',
        tags: ['raydium-clmm'],
        body: {
          ...OpenPositionRequest,
          properties: {
            ...OpenPositionRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' }
          }
        },
        response: {
          200: OpenPositionResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct 
        } = request.body;
        const networkToUse = network || 'mainnet-beta';
        
        return await openPosition(
          fastify,
          networkToUse,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default openPositionRoute;
