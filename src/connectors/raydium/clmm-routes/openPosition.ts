import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Raydium } from '../raydium';
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
import { TickUtils } from '@raydium-io/raydium-sdk-v2';
import { quotePosition } from './quotePosition';


async function openPosition(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number
): Promise<OpenPositionResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);
  const wallet = await solana.getWallet(walletAddress);

  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(poolAddress);
  console.log('poolInfo', poolInfo)
  console.log('poolKeys', poolKeys)

  const rpcData = await raydium.getClmmPoolfromRPC(poolAddress)
  poolInfo.price = rpcData.currentPrice
  console.log('current price', poolInfo.price);

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

  const quotePositionResponse = await quotePosition(
    _fastify,
    network,
    lowerPrice,
    upperPrice,
    poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct
  );

  logger.info('Opening Raydium CLMM position...');
  const COMPUTE_UNITS = 300000;
  let currentPriorityFee = (await solana.getGasPrice() * 1e9) - BASE_FEE;
  while (currentPriorityFee <= solana.config.maxPriorityFee * 1e9) {
    const priorityFeePerCU = Math.floor(currentPriorityFee * 1e6 / COMPUTE_UNITS);
    const { transaction, extInfo } = await raydium.raydiumSDK.clmm.openPositionFromBase({
      poolInfo,
      poolKeys,
      tickUpper: Math.max(lowerTick, upperTick),
      tickLower: Math.min(lowerTick, upperTick),
      base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
      ownerInfo: {
        useSOLBalance: true,
      },
      baseAmount: quotePositionResponse.baseLimited ? new BN(quotePositionResponse.baseTokenAmount * (10 ** baseToken.decimals)) : new BN(quotePositionResponse.quoteTokenAmount * (10 ** quoteToken.decimals)),
      otherAmountMax: quotePositionResponse.baseLimited ? new BN(quotePositionResponse.quoteTokenAmountMax * (10 ** quoteToken.decimals)) : new BN(quotePositionResponse.baseTokenAmountMax * (10 ** baseToken.decimals)),
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: COMPUTE_UNITS,
        microLamports: priorityFeePerCU,
      },
    });

    transaction.sign([wallet]);
    await solana.simulateTransaction(transaction);

    const { confirmed, signature, txData } = await solana.sendAndConfirmRawTransaction(transaction);
    if (confirmed && txData) {
      const totalFee = txData.meta.fee;
      const { balanceChange } = await solana.extractAccountBalanceChangeAndFee(signature, 0);
      const positionRent = Math.abs(balanceChange);

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
        positionAddress: extInfo.nftMint.toBase58(),
        positionRent,
        baseTokenAmountAdded: baseTokenBalanceChange,
        quoteTokenAmountAdded: quoteTokenBalanceChange,
      };
    }
    currentPriorityFee = currentPriorityFee * solana.config.priorityFeeMultiplier;
    logger.info(`Increasing priority fee to ${currentPriorityFee} lamports/CU (max fee of ${(currentPriorityFee / 1e9).toFixed(6)} SOL)`);
  }
  throw new Error(`Open position failed after reaching max priority fee of ${(solana.config.maxPriorityFee / 1e9).toFixed(6)} SOL`);
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
            network: { type: 'string', default: 'mainnet-beta' },
            lowerPrice: { type: 'number', examples: [0.3] },
            upperPrice: { type: 'number', examples: [1] },
            poolAddress: { type: 'string', examples: ['BqBMwCcPXu6ZMKQBX2hYGGN4PNkEb15vLjigt8DKtuLp'] },
            slippagePct: { type: 'number', examples: [1] },
            baseTokenAmount: { type: 'number', examples: [2] },
            quoteTokenAmount: { type: 'number', examples: [10] },
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
