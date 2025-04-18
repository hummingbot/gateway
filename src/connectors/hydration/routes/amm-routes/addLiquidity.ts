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
} from '../../../../schemas/trading-types/amm-schema';

// Buffer for transaction costs (in HDX)
const HDX_TRANSACTION_BUFFER = 0.1;

// Pool types
const POOL_TYPE = {
  XYK: 'xyk',
  LBP: 'lbp',
  OMNIPOOL: 'omnipool',
  STABLESWAP: 'stableswap'
};

/**
 * Add liquidity to a Hydration position
 * @param fastify Fastify instance
 * @param network The blockchain network (e.g., 'mainnet')
 * @param walletAddress The user's wallet address
 * @param poolId The pool ID to add liquidity to
 * @param baseTokenAmount Amount of base token to add
 * @param quoteTokenAmount Amount of quote token to add
 * @param slippagePct Optional slippage percentage (default from config)
 * @returns Details of the liquidity addition
 */
async function addLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolId: string,
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
  
  // Get pool info
  const pool = await hydration.getPoolInfo(poolId);
  if (!pool) {
    throw httpNotFound(`Pool not found: ${poolId}`);
  }

  // Get token symbols from addresses
  const baseTokenSymbol = await hydration.getTokenSymbol(pool.baseTokenAddress);
  const quoteTokenSymbol = await hydration.getTokenSymbol(pool.quoteTokenAddress);

  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw httpBadRequest(ERROR_MESSAGES.MISSING_AMOUNTS);
  }

  // Check balances with transaction buffer
  // Fix the method name for getting balances
  const balances = await polkadot.getBalance(wallet, [baseTokenSymbol, quoteTokenSymbol, "HDX"]);
  const requiredBase = baseTokenAmount;
  const requiredQuote = quoteTokenAmount;
  const requiredHDX = HDX_TRANSACTION_BUFFER;

  // Check base token balance - Use proper error message construction
  if (balances[baseTokenSymbol] < requiredBase) {
    throw httpBadRequest(
      `Insufficient ${baseTokenSymbol} balance. Required: ${requiredBase}, Available: ${balances[baseTokenSymbol]}`
    );
  }

  // Check quote token balance
  if (balances[quoteTokenSymbol] < requiredQuote) {
    throw httpBadRequest(
      `Insufficient ${quoteTokenSymbol} balance. Required: ${requiredQuote}, Available: ${balances[quoteTokenSymbol]}`
    );
  }

  // Check HDX balance for gas
  if (balances['HDX'] < requiredHDX) {
    throw httpBadRequest(
      `Insufficient HDX balance for transaction fees. Required: ${requiredHDX}, Available: ${balances['HDX']}`
    );
  }

  logger.info(`Adding liquidity to pool ${poolId}: ${baseTokenAmount.toFixed(4)} ${baseTokenSymbol}, ${quoteTokenAmount.toFixed(4)} ${quoteTokenSymbol}`);

  try {
    // Use assets from Hydration to get asset IDs
    const assets = await hydration.getAllTokens();
    const baseAsset = assets.find(a => a.symbol === baseTokenSymbol);
    const quoteAsset = assets.find(a => a.symbol === quoteTokenSymbol);

    if (!baseAsset || !quoteAsset) {
      throw httpNotFound(`Asset not found: ${!baseAsset ? baseTokenSymbol : quoteTokenSymbol}`);
    }

    // Convert amounts to BigNumber with proper decimals
    const baseAmountBN = new BigNumber(baseTokenAmount)
      .multipliedBy(new BigNumber(10).pow(baseAsset.decimals))
      .decimalPlaces(0);

    const quoteAmountBN = new BigNumber(quoteTokenAmount)
      .multipliedBy(new BigNumber(10).pow(quoteAsset.decimals))
      .decimalPlaces(0);

    // Get slippage
    const effectiveSlippage = slippagePct ?? hydration.getSlippagePct();

    // Using the GalacticCouncil SDK to prepare the transaction
    const api = await polkadot.getApiPromise();
    
    let addLiquidityTx;
    const poolType = pool.poolType?.toLowerCase() || POOL_TYPE.XYK; // Default to XYK if type is not provided

    logger.info(`Adding liquidity to ${poolType} pool (${poolId})`);

    switch (poolType) {
      case POOL_TYPE.XYK:
        // Calculate max limit for quote token based on slippage
        const quoteAmountMaxLimit = calculateMaxAmountIn(quoteAmountBN, effectiveSlippage);
        
        // Create XYK add liquidity transaction
        addLiquidityTx = api.tx.xyk.addLiquidity(
          baseAsset.address,
          quoteAsset.address,
          baseAmountBN.toString(),
          quoteAmountMaxLimit.toString()
        );
        break;

      case POOL_TYPE.LBP:
        // For LBP, we use [assetId, amount] tuples
        const amountA = [baseAsset.address, baseAmountBN.toString()];
        const amountB = [quoteAsset.address, quoteAmountBN.toString()];
        
        addLiquidityTx = api.tx.lbp.addLiquidity(
          [baseAsset.address, baseAmountBN.toString()],
          [quoteAsset.address, quoteAmountBN.toString()]
        );
        break;

      case POOL_TYPE.OMNIPOOL:
        // For Omnipool, we can only add liquidity for one asset at a time
        // We'll use the base asset if both are provided
        if (baseTokenAmount > 0) {
          // Calculate min shares limit based on slippage (if applicable)
          const minSharesLimit = calculateMinSharesLimit(baseAmountBN, effectiveSlippage);
          
          addLiquidityTx = api.tx.omnipool.addLiquidityWithLimit(
            baseAsset.address,
            baseAmountBN.toString(),
            minSharesLimit.toString()
          );
        } else {
          // Use quote asset if base amount is 0
          const minSharesLimit = calculateMinSharesLimit(quoteAmountBN, effectiveSlippage);
          
          addLiquidityTx = api.tx.omnipool.addLiquidityWithLimit(
            quoteAsset.address,
            quoteAmountBN.toString(),
            minSharesLimit.toString()
          );
        }
        break;

      case POOL_TYPE.STABLESWAP:
        // For Stableswap, we need to provide assets array with [id, amount] objects
        const assets = [
          { assetId: baseAsset.address, amount: baseAmountBN.toString() },
          { assetId: quoteAsset.address, amount: quoteAmountBN.toString() }
        ].filter(asset => new BigNumber(asset.amount).gt(0)); // Only include assets with amount > 0
        
        addLiquidityTx = api.tx.stableswap.addLiquidity(
          poolId, // Pool ID is required for stableswap
          assets
        );
        break;

      default:
        throw httpBadRequest(`Unsupported pool type: ${poolType}`);
    }

    // Sign and send the transaction
    const txHash = await submitTransaction(api, addLiquidityTx, wallet, poolType);

    logger.info(`Liquidity added to pool ${poolId} with tx hash: ${txHash}`);

    // In a real implementation, we would parse events to get actual amounts added
    // Here we're returning the requested amounts
    return {
      signature: txHash,
      baseTokenAmountAdded: baseTokenAmount,
      quoteTokenAmountAdded: quoteTokenAmount,
      fee: 0.01 // This should be the actual fee from the transaction
    };
  } catch (error) {
    logger.error(`Error adding liquidity to pool ${poolId}:`, error);
    throw error;
  }
}

/**
 * Calculate maximum amount in based on slippage
 */
function calculateMaxAmountIn(amount: BigNumber, slippagePct: number): BigNumber {
  return amount.multipliedBy(new BigNumber(100 + slippagePct).dividedBy(100)).decimalPlaces(0);
}

/**
 * Calculate minimum shares limit based on slippage
 */
function calculateMinSharesLimit(amount: BigNumber, slippagePct: number): BigNumber {
  return amount.multipliedBy(new BigNumber(100 - slippagePct).dividedBy(100)).decimalPlaces(0);
}

/**
 * Submit a transaction and wait for it to be included in a block
 * @param api Polkadot API instance
 * @param tx Transaction to submit
 * @param wallet Wallet to sign the transaction
 * @param poolType Type of pool (for event detection)
 * @returns Transaction hash if successful
 * @throws Error if transaction fails
 */
async function submitTransaction(api: any, tx: any, wallet: any, poolType: string): Promise<string> {
  // We still need a promise for the event-based callbacks
  return new Promise<string>(async (resolve, reject) => {
    let unsub: () => void;
    
    // We'll get the hash from the status once available
    // Initial logging will use the tx ID for context only
    const txId = tx.hash.toHex(); // Short ID for initial logging
    logger.debug(`Transaction created with ID: ${txId}`);
    
    // Create a handler function for transaction status updates
    const statusHandler = async (result: any) => {
      try {
        // Get the hash from status when available
        const txHash = result.txHash.toString();
        
        if (result.status.isInBlock || result.status.isFinalized) {
          // Transaction is included in a block
          const blockHash = result.status.isInBlock ? result.status.asInBlock : result.status.asFinalized;
          
          logger.debug(`Transaction ${txHash} ${result.status.isInBlock ? 'in block' : 'finalized'}: ${blockHash.toString()}`);
          
          // Handle dispatch errors - these come directly with the status
          if (result.dispatchError) {
            const errorMessage = await extractErrorMessage(api, result.dispatchError);
            logger.error(`Transaction ${txHash} failed with dispatch error: ${errorMessage}`);
            unsub();
            reject(new Error(`Transaction ${txHash} failed: ${errorMessage}`));
            return;
          }
          
          // Check transaction events for success or failure
          if (await hasFailedEvent(api, result.events)) {
            const errorMessage = await extractEventErrorMessage(api, result.events);
            logger.error(`Transaction ${txHash} failed with event error: ${errorMessage}`);
            unsub();
            reject(new Error(`Transaction ${txHash} failed: ${errorMessage}`));
            return;
          }
          
          // Check for pool-specific success events
          if (await hasSuccessEvent(api, result.events, poolType)) {
            logger.info(`Transaction ${txHash} succeeded in block ${blockHash.toString()}`);
            unsub();
            resolve(txHash);
            return;
          }
          
          // If we reached finalization with no explicit failure, consider it a success
          if (result.status.isFinalized) {
            logger.warn(`Transaction ${txHash} finalized with no specific success/failure event. Assuming success.`);
            unsub();
            resolve(txHash);
            return;
          }
        } 
        else if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped) {
          // Transaction didn't make it to a block
          const statusType = result.status.type;
          const statusValue = result.status.value.toString();
          const errorMessage = `Transaction ${statusType}: ${statusValue}`;
          logger.error(`Transaction ${txHash} - ${errorMessage}`);
          unsub();
          reject(new Error(`Transaction ${txHash} ${statusType}: ${statusValue}`));
          return;
        }
        else {
          // Log other status updates with the transaction hash
          logger.debug(`Transaction ${txHash} status: ${result.status.type}`);
        }
        // For other statuses (like Ready, Broadcast), we continue waiting
      } catch (error) {
        // If we can't get the hash from status for some reason, fall back to tx hash
        const fallbackHash = tx.hash.toString();
        logger.error(`Error processing transaction status: ${error.message}`);
        unsub();
        reject(new Error(`Transaction ${fallbackHash} processing failed: ${error.message}`));
      }
    };
    
    // Submit the transaction using async/await
    try {
      // Use await instead of then/catch
      logger.info(`Submitting transaction with id ${txId} ...`);
      unsub = await tx.signAndSend(wallet, statusHandler);
    } catch (error) {
      // Use the fallback hash if submission failed before we got a status
      const fallbackHash = tx.hash.toString();
      logger.error(`Exception during transaction submission: ${error.message}`);
      reject(new Error(`Transaction ${fallbackHash} submission failed: ${error.message}`));
    }
  });
}

/**
 * Extract a meaningful error message from a dispatch error
 */
async function extractErrorMessage(api: any, dispatchError: any): Promise<string> {
  if (dispatchError.isModule) {
    try {
      const { docs, name, section } = api.registry.findMetaError(dispatchError.asModule);
      return `${section}.${name}: ${docs.join(' ')}`;
    } catch (error) {
      return `Unknown module error: ${dispatchError.asModule.toString()}`;
    }
  } else {
    return dispatchError.toString();
  }
}

/**
 * Extract error message from failure events
 */
async function extractEventErrorMessage(api: any, events: any[]): Promise<string> {
  const failureEvent = events.find(({ event }) => 
    api.events.system.ExtrinsicFailed.is(event)
  );
  
  if (!failureEvent) return 'Unknown transaction failure';
  
  const { event: { data: [error] } } = failureEvent;
  
  if (error.isModule) {
    try {
      const { docs, name, section } = api.registry.findMetaError(error.asModule);
      return `${section}.${name}: ${docs.join(' ')}`;
    } catch (e) {
      return `Unknown module error: ${error.toString()}`;
    }
  } else {
    return error.toString();
  }
}

/**
 * Check if events contain a failure event
 */
async function hasFailedEvent(api: any, events: any[]): Promise<boolean> {
  return events.some(({ event }) => 
    api.events.system.ExtrinsicFailed.is(event)
  );
}

/**
 * Check if events contain a success event specific to the pool type
 */
async function hasSuccessEvent(api: any, events: any[], poolType: string): Promise<boolean> {
  return events.some(({ event }) => 
    api.events.system.ExtrinsicSuccess.is(event) || 
    (poolType === POOL_TYPE.XYK && api.events.xyk.LiquidityAdded?.is(event)) ||
    (poolType === POOL_TYPE.LBP && api.events.lbp.LiquidityAdded?.is(event)) ||
    (poolType === POOL_TYPE.OMNIPOOL && api.events.omnipool.LiquidityAdded?.is(event)) ||
    (poolType === POOL_TYPE.STABLESWAP && api.events.stableswap.LiquidityAdded?.is(event))
  );
}

/**
 * Register the add-liquidity route
 */
export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '1examplePolkadotAddress...';

  // Try to get a real wallet address for examples if available
  try {
    const firstWallet = await polkadot.getFirstWalletAddress();
    if (firstWallet) {
      firstWalletAddress = firstWallet;
    }
  } catch (error) {
    logger.debug('Could not get example wallet address', error);
  }

  // Update schema example
  AddLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  // Fix the Fastify route typing issue
  fastify.post(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Hydration position',
        tags: ['hydration'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: ['12345'] }, // Example pool ID
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
    async (request, reply) => {
      try {
        const {
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.body as AddLiquidityRequestType;
        const network = (request.body as AddLiquidityRequestType).network || 'mainnet';

        const result = await addLiquidity(
          fastify,
          network,
          walletAddress,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        );

        return reply.send(result);
      } catch (e) {
        logger.error('Error in add-liquidity endpoint:', e);

        if (e.statusCode) {
          return reply.status(e.statusCode).send({ error: e.message });
        }
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default addLiquidityRoute;
