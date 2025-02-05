import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { RaydiumCLMM } from '../raydium-clmm';
import { Solana } from '../../../chains/solana/solana';
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
    const wallet = await solana.getWallet(walletAddress);

    const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress);
    console.log('poolInfo:', poolInfo);

    const baseToken = await solana.getToken(poolInfo.mintA.address);
    if (!baseToken) {
      throw new Error('Could not find token info');
    }

    const quoteToken = await solana.getToken(poolInfo.mintB.address);
    if (!quoteToken) {
      throw new Error('Could not find quote token info');
    }

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

    if (!baseTokenAmount) {
      throw new Error('Base token amount is required');
    }
    const amount = new Decimal(baseTokenAmount).mul(10 ** baseToken.decimals).toFixed(0);
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

    console.log('getLiquidityAmountOutFromAmountIn:', res);
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
  
    const { execute: _execute, transaction: _transaction, extInfo } = await raydium.raydium.clmm.openPositionFromBase({
      poolInfo,
      poolKeys,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      base: 'MintA',
      ownerInfo: {
        useSOLBalance: true,
      },
      baseAmount: res.amountA.amount,
      otherAmountMax: res.amountSlippageB.amount,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 300000,
        microLamports: 1000000,
      },
    });
    console.log('original tx:', _transaction);

    logger.info('Opening Raydium CLMM position...');
    // const { txId: signature } = await _execute({ sendAndConfirm: true })
    const { signature, fee: _fee } = await solana.sendAndConfirmVersionedTransaction(
      _transaction,
      [wallet],
      300_000
    );

    const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
    const positionRent = Math.abs(balanceChange);

    return {
      signature: signature,
      fee: 0,
      positionAddress: extInfo.nftMint.toBase58(),
      positionRent,
      baseTokenAmountAdded: 0,
      quoteTokenAmountAdded: 0,
    };
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
