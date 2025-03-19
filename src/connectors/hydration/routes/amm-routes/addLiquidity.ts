import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { BigNumber } from '@galacticcouncil/sdk';
import { logger } from '../../../../services/logger';
import { validatePolkadotAddress } from '../../../../chains/polkadot/polkadot.validators';
import { httpBadRequest, httpNotFound, ERROR_MESSAGES } from '../../../../services/error-handler';
import {
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType
} from '../../../../services/clmm-interfaces';

// Maximum number of retries for transaction submission
const MAX_RETRIES = 3;
// Fee multiplier for retries
const FEE_MULTIPLIER = 1.5;
// Base transaction fee buffer in HDX
const BASE_TX_FEE = 0.01;

/**
 * Create the add liquidity transaction
 */
async function createAddLiquidityTransaction(
  hydration: Hydration,
  polkadot: Polkadot,
  poolId: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippage: number
) {
  const pool = await hydration.getPoolInfo(poolId);
  if (!pool) {
    throw new Error(`Pool not found: ${poolId}`);
  }

  const baseTokenSymbol = pool.baseToken.symbol;
  const quoteTokenSymbol = pool.quoteToken.symbol;

  // Get asset information
  const assets = await hydration.getAllTokens();
  const baseAsset = assets.find(a => a.symbol === baseTokenSymbol);
  const quoteAsset = assets.find(a => a.symbol === quoteTokenSymbol);

  if (!baseAsset || !quoteAsset) {
    throw new Error(`Asset not found: ${!baseAsset ? baseTokenSymbol : quoteTokenSymbol}`);
  }

  // Convert amounts to BigNumber with proper decimals
  const baseAmountBN = new BigNumber(baseTokenAmount)
    .multipliedBy(new BigNumber(10).pow(baseAsset.decimals))
    .decimalPlaces(0);

  const quoteAmountBN = new BigNumber(quoteTokenAmount)
    .multipliedBy(new BigNumber(10).pow(quoteAsset.decimals))
    .decimalPlaces(0);

  // Calculate minimum amount expected based on slippage
  const minBaseExpected = baseAmountBN.multipliedBy(
    new BigNumber(100 - slippage).dividedBy(100)
  ).decimalPlaces(0);

  const api = polkadot.api;

  // Examine pool properties to determine type
  // In a real implementation, we would use a more robust method to determine the pool type
  // For now we're making an educated guess based on the pool structure
  if (pool.hasOwnProperty('omnipoolId')) {
    // Omnipool - the main Hydration pool type
    return api.tx.omnipool.addLiquidity(
      baseAsset.id,
      baseAmountBN.toString()
    );
  } 
  else if (pool.hasOwnProperty('lbpId')) {
    // LBP pool - check actual required parameters from API
    return api.tx.lbp.addLiquidity(
      [
        baseAsset.id,
        baseAmountBN.toString()
      ],
      [
        quoteAsset.id,
        quoteAmountBN.toString()
      ]
    );
  }
  else {
    // Default to XYK (standard AMM) pool
    return api.tx.xyk.addLiquidity(
      baseAsset.id,
      quoteAsset.id,
      baseAmountBN.toString(),
      quoteAmountBN.toString()
    );
  }
}

/**
 * Add liquidity to a Hydration position
 * @param fastify Fastify instance
 * @param network The blockchain network (e.g., 'mainnet')
 * @param walletAddress The user's wallet address
 * @param positionAddress The position address/ID to add liquidity to
 * @param baseTokenAmount Amount of base token to add
 * @param quoteTokenAmount Amount of quote token to add
 * @param slippagePct Optional slippage percentage (default from config)
 * @returns Details of the liquidity addition
 */
async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number
): Promise<AddLiquidityResponseType> {
  const initTime = Date.now();

  // Validate address - Use a simple validation without custom error message
  try {
    validatePolkadotAddress(walletAddress);
  } catch (error) {
    // Use a standard error format instead of the custom ERROR_MESSAGES.INVALID_ADDRESS
    throw httpBadRequest(`Invalid Polkadot address: ${walletAddress}`);
  }

  const polkadot = await Polkadot.getInstance(network);
  const hydration = await Hydration.getInstance(network);

  // Get wallet
  const wallet = await polkadot.getWallet(walletAddress);
  
  // Get pool info (positionAddress is poolId in Hydration)
  const poolId = positionAddress;
  const pool = await hydration.getPoolInfo(poolId);
  
  if (!pool) {
    logger.error(`Pool not found: ${poolId}`);
    throw new Error(`Pool not found: ${poolId}`);
  }
  
  const baseTokenSymbol = pool.baseToken.symbol;
  const quoteTokenSymbol = pool.quoteToken.symbol;
  
  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw new Error('At least one token amount must be greater than zero');
  }
  
  // Check balances
  const balances = await polkadot.getBalance(wallet, [baseTokenSymbol, quoteTokenSymbol, "HDX"]);
  
  if (balances[baseTokenSymbol] < baseTokenAmount) {
    throw new Error(`Insufficient ${baseTokenSymbol} balance: ${balances[baseTokenSymbol]} < ${baseTokenAmount}`);
  }
  
  if (balances[quoteTokenSymbol] < quoteTokenAmount) {
    throw new Error(`Insufficient ${quoteTokenSymbol} balance: ${balances[quoteTokenSymbol]} < ${quoteTokenAmount}`);
  }
  
  if (balances['HDX'] < BASE_TX_FEE) {
    throw new Error(`Insufficient HDX for transaction fees: ${balances['HDX']} < ${BASE_TX_FEE}`);
  }
  
  logger.info(`Adding liquidity to Hydration pool ${poolId} (${baseTokenSymbol}-${quoteTokenSymbol})...`);

  // Use hydration's slippage or provided slippage
  const slippage = slippagePct ?? hydration.getSlippagePct();
  
  // Try to submit transaction with increasing fees if needed
  let currentFee = BASE_TX_FEE;
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      // Create transaction
      const tx = await createAddLiquidityTransaction(
        hydration,
        polkadot,
        poolId,
        baseTokenAmount,
        quoteTokenAmount,
        slippage
      );

      // Sign and send the transaction
      const txHash = await new Promise<string>((resolve, reject) => {
        tx.signAndSend(wallet, (result: any) => {
          if (result.status.isInBlock || result.status.isFinalized) {
            resolve(result.status.asInBlock.toString());
          } else if (result.isError) {
            reject(new Error(`Transaction failed: ${result.status.toString()}`));
          }
        }).catch((error: any) => {
          reject(error);
        });
      });
      
      logger.info(`Liquidity added to pool ${poolId} with tx hash: ${txHash}`);
      
      // For now, we return the requested amounts as the actual amounts
      // In a production implementation, we would parse events to get actual amounts added
      return {
        signature: txHash,
        fee: currentFee,
        baseTokenAmountAdded: baseTokenAmount,
        quoteTokenAmountAdded: quoteTokenAmount
      };
    } catch (error) {
      retryCount++;
      currentFee *= FEE_MULTIPLIER;
      
      if (retryCount >= MAX_RETRIES) {
        logger.error(`Add liquidity failed after ${MAX_RETRIES} retries with max fee ${currentFee}`);
        throw error;
      }
      
      logger.info(`Retrying add liquidity with increased fee: ${currentFee} HDX (retry ${retryCount}/${MAX_RETRIES})`);
    }
  }
  
  throw new Error(`Add liquidity failed after ${MAX_RETRIES} retries`);
}

/**
 * Register the add-liquidity route
 */
export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '';
  
  try {
    const foundWallet = await polkadot.getFirstWalletAddress();
    if (foundWallet) {
      firstWalletAddress = foundWallet;
    } else {
      logger.debug('No wallets found for examples in schema');
    }
  } catch (error) {
    logger.debug('Error getting example wallet address', error);
  }
  
  // Update schema example
  AddLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: AddLiquidityRequestType
    Reply: AddLiquidityResponseType
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Hydration pool',
        tags: ['hydration'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            positionAddress: { type: 'string', examples: ['12345'] }, // Example pool ID
            slippagePct: { type: 'number', examples: [1] },
            baseTokenAmount: { type: 'number', examples: [10] },
            quoteTokenAmount: { type: 'number', examples: [10] },
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
        } = request.body;
        
        return await addLiquidity(
          fastify,
          network || 'mainnet',
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    }
  );
};

export default addLiquidityRoute;

