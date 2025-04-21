import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Hydration } from '../../hydration';
import { Polkadot } from '../../../../chains/polkadot/polkadot';
import { BigNumber } from '@galacticcouncil/sdk';
import { logger } from '../../../../services/logger';
import { 
  RemoveLiquidityRequest, 
  RemoveLiquidityResponse, 
  RemoveLiquidityRequestType, 
  RemoveLiquidityResponseType 
} from '../../../../schemas/trading-types/amm-schema';
import { httpBadRequest, httpNotFound } from '../../../../services/error-handler';
import { validatePolkadotAddress } from '../../../../chains/polkadot/polkadot.validators';

// Pool types
const POOL_TYPE = {
  XYK: 'xyk',
  LBP: 'lbp',
  OMNIPOOL: 'omnipool',
  STABLESWAP: 'stableswap'
};

/**
 * Remove liquidity from a pool
 */
export async function removeLiquidity(
  _fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number
): Promise<RemoveLiquidityResponseType> {
  try {
    // Validate inputs
    if (percentageToRemove <= 0 || percentageToRemove > 100) {
      throw httpBadRequest('Percentage to remove must be between 0 and 100');
    }

    // Validate address
    try {
      validatePolkadotAddress(walletAddress);
    } catch (error) {
      throw httpBadRequest(`Invalid Polkadot address: ${walletAddress}`);
    }

    const polkadot = await Polkadot.getInstance(network);
    const hydration = await Hydration.getInstance(network);
    
    // Get wallet
    const wallet = await polkadot.getWallet(walletAddress);
    
    // Get pool info
    const pool = await hydration.getPoolInfo(poolAddress);
    if (!pool) {
      throw httpNotFound(`Pool not found: ${poolAddress}`);
    }

    // Get token symbols from addresses
    const baseTokenSymbol = await hydration.getTokenSymbol(pool.baseTokenAddress);
    const quoteTokenSymbol = await hydration.getTokenSymbol(pool.quoteTokenAddress);
    
    logger.info(`Removing ${percentageToRemove}% liquidity from pool ${poolAddress}`);

    try {
      // Use assets from Hydration to get asset IDs
      const assets = await hydration.getAllTokens();
      const baseAsset = assets.find(a => a.symbol === baseTokenSymbol);
      const quoteAsset = assets.find(a => a.symbol === quoteTokenSymbol);

      if (!baseAsset || !quoteAsset) {
        throw httpNotFound(`Asset not found: ${!baseAsset ? baseTokenSymbol : quoteTokenSymbol}`);
      }

      // TODO Important: verify how this calculation needs to be done!!!
      const liquidityToRemove = new BigNumber(percentageToRemove * Math.pow(10, 18));

      if (liquidityToRemove.lte(0)) {
        throw httpBadRequest('Calculated liquidity to remove is zero or negative');
      }

      // Using the GalacticCouncil SDK to prepare the transaction
      const apiPromise = await hydration.getApiPromise();

      let removeLiquidityTx;
      // Get pool type
      const poolType = pool.poolType?.toLowerCase() || POOL_TYPE.XYK; // Default to XYK if type is not provided

      logger.info(`Removing liquidity from ${poolType} pool (${poolAddress})`);

      switch (poolType) {
        case POOL_TYPE.XYK:
          // For XYK pools
          removeLiquidityTx = apiPromise.tx.xyk.removeLiquidity(
            baseAsset.address,
            quoteAsset.address,
            liquidityToRemove.toString()
          );
          break;

        case POOL_TYPE.LBP:
          // For LBP pools
          removeLiquidityTx = apiPromise.tx.lbp.removeLiquidity(
            poolAddress // Pool ID for LBP
          );
          break;

        case POOL_TYPE.OMNIPOOL:
          // For Omnipool, we need to specify which asset we're withdrawing
          // In Omnipool, we can only withdraw one asset at a time, so we use the base asset
          removeLiquidityTx = apiPromise.tx.omnipool.removeLiquidity(
            baseAsset.address,
            liquidityToRemove.toString()
          );
          break;

        case POOL_TYPE.STABLESWAP:
          removeLiquidityTx = apiPromise.tx.stableswap.removeLiquidity(
            pool.id,
            liquidityToRemove.toString(),
            [
              { assetId: baseAsset.address, amount: 0 }, // Ask for minimum amount
              { assetId: quoteAsset.address, amount: 0 }  // System will calculate actual amounts
            ]
          );
          break;

        default:
          throw httpBadRequest(`Unsupported pool type: ${poolType}`);
      }

      // Sign and send the transaction
      const txHash = await submitTransaction(apiPromise, removeLiquidityTx, wallet, poolType);

      logger.info(`Liquidity removed from pool ${poolAddress} with tx hash: ${txHash}`);

      // Get transaction result to retrieve actual amounts removed
      const { baseAmount, quoteAmount } = await getRemoveLiquidityResult(
        apiPromise,
        txHash, 
        baseAsset, 
        quoteAsset, 
        poolType
      );

      return {
        signature: txHash,
        fee: 0.01, // This should be the actual fee from the transaction
        baseTokenAmountRemoved: baseAmount,
        quoteTokenAmountRemoved: quoteAmount
      };
    } catch (error) {
      logger.error(`Error removing liquidity from pool ${poolAddress}:`, error);
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to remove liquidity: ${error.message}`);
    if (error.statusCode) throw error;
    if (error.message.includes('not found')) {
      throw httpNotFound(error.message);
    }
    throw error;
  }
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
    (poolType === POOL_TYPE.XYK && api.events.xyk.LiquidityRemoved?.is(event)) ||
    (poolType === POOL_TYPE.LBP && api.events.lbp.LiquidityRemoved?.is(event)) ||
    (poolType === POOL_TYPE.OMNIPOOL && api.events.omnipool.LiquidityRemoved?.is(event)) ||
    (poolType === POOL_TYPE.STABLESWAP && api.events.stableswap.LiquidityRemoved?.is(event))
  );
}

/**
 * Get the actual amounts removed from transaction events
 */
async function getRemoveLiquidityResult(
  api: any, 
  txHash: string, 
  baseAsset: any, 
  quoteAsset: any, 
  poolType: string
): Promise<{ baseAmount: number, quoteAmount: number }> {
  try {
    // Get transaction events from hash
    const txInfo = await api.rpc.chain.getBlock();
    const blockHash = txInfo.block.header.hash;
    const events = await api.query.system.events.at(blockHash);

    // Default response if we can't extract exact amounts
    const defaultResponse = { baseAmount: 0, quoteAmount: 0 };

    // Find the relevant event based on pool type
    let relevantEvent;
    switch (poolType) {
      case POOL_TYPE.XYK:
        relevantEvent = events.find((record: any) => 
          record.event && api.events.xyk.LiquidityRemoved?.is(record.event)
        );
        break;
      case POOL_TYPE.LBP:
        relevantEvent = events.find((record: any) => 
          record.event && api.events.lbp.LiquidityRemoved?.is(record.event)
        );
        break;
      case POOL_TYPE.OMNIPOOL:
        relevantEvent = events.find((record: any) => 
          record.event && api.events.omnipool.LiquidityRemoved?.is(record.event)
        );
        break;
      case POOL_TYPE.STABLESWAP:
        relevantEvent = events.find((record: any) => 
          record.event && api.events.stableswap.LiquidityRemoved?.is(record.event)
        );
        break;
      default:
        return defaultResponse;
    }

    if (!relevantEvent || !relevantEvent.event) {
      logger.warn(`Could not find LiquidityRemoved event for transaction ${txHash}`);
      return defaultResponse;
    }

    // Extract amounts based on pool type
    let baseAmount = 0;
    let quoteAmount = 0;

    switch (poolType) {
      case POOL_TYPE.XYK:
        // Structure is typically [who, assetA, assetB, amountA, amountB]
        if (relevantEvent.event.data.length >= 5) {
          const assetAId = relevantEvent.event.data[1].toString();
          const assetBId = relevantEvent.event.data[2].toString();
          const amountA = new BigNumber(relevantEvent.event.data[3].toString());
          const amountB = new BigNumber(relevantEvent.event.data[4].toString());
          
          if (assetAId === baseAsset.id.toString()) {
            baseAmount = amountA.dividedBy(Math.pow(10, baseAsset.decimals)).toNumber();
            quoteAmount = amountB.dividedBy(Math.pow(10, quoteAsset.decimals)).toNumber();
          } else {
            baseAmount = amountB.dividedBy(Math.pow(10, baseAsset.decimals)).toNumber();
            quoteAmount = amountA.dividedBy(Math.pow(10, quoteAsset.decimals)).toNumber();
          }
        }
        break;
      
      case POOL_TYPE.OMNIPOOL:
      case POOL_TYPE.LBP:
      case POOL_TYPE.STABLESWAP:
        // For other pool types, the exact structure may vary
        // We'll need to extract the relevant amounts based on the specific event structure
        // This is a simplified example - adjust based on actual event structure
        if (relevantEvent.event.data.length >= 3) {
          // Assuming data includes who, assetId, amount
          const assetId = relevantEvent.event.data[1].toString();
          const amount = new BigNumber(relevantEvent.event.data[2].toString());
          
          if (assetId === baseAsset.id.toString()) {
            baseAmount = amount.dividedBy(Math.pow(10, baseAsset.decimals)).toNumber();
          } else if (assetId === quoteAsset.id.toString()) {
            quoteAmount = amount.dividedBy(Math.pow(10, quoteAsset.decimals)).toNumber();
          }
        }
        break;
    }

    return { baseAmount, quoteAmount };
  } catch (error) {
    logger.error(`Failed to extract removal amounts from transaction ${txHash}:`, error);
    return { baseAmount: 0, quoteAmount: 0 };
  }
}

/**
 * Route handler for removing liquidity
 */
export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const polkadot = await Polkadot.getInstance('mainnet');
  let firstWalletAddress = '<polkadot-wallet-address>';
  
  const foundWallet = await polkadot.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }
  
  // Update schema example
  RemoveLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Hydration pool',
        tags: ['hydration'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet' },
            poolAddress: { type: 'string', examples: ['hydration-pool-0'] },
            percentageToRemove: { type: 'number', examples: [50] }
          }
        },
        response: {
          200: RemoveLiquidityResponse
        },
      }
    },
    async (request, reply) => {
      try {
        const { network, walletAddress, poolAddress, percentageToRemove } = request.body as RemoveLiquidityRequestType;
        const networkToUse = network || 'mainnet';
        
        const result = await removeLiquidity(
          fastify,
          networkToUse,
          walletAddress,
          poolAddress,
          percentageToRemove
        );
        
        return reply.send(result);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          return reply.status(e.statusCode).send({ error: e.message || 'Request failed' });
        }
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};

export default removeLiquidityRoute;

