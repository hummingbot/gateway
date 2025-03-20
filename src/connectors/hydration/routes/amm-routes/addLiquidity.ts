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

// Buffer for transaction costs (in HDX)
const HDX_TRANSACTION_BUFFER = 0.1;

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

  // Get keyPair from wallet address - Fix method name
  // Use the correct method from the Polkadot class
  const keyPair = await polkadot.getWallet(walletAddress);

  // Get position info
  // For Hydration, we'd need to get the poolId from the position
  // This is an adaptation since Hydration doesn't have the same position concept
  const poolId = positionAddress; // In Hydration we're using poolId as positionAddress

  // Get pool info
  const pool = await hydration.getPoolInfo(poolId);
  if (!pool) {
    throw httpNotFound(`Pool not found: ${poolId}`);
  }

  const baseTokenSymbol = pool.baseToken.symbol;
  const quoteTokenSymbol = pool.quoteToken.symbol;

  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw httpBadRequest(ERROR_MESSAGES.MISSING_AMOUNTS);
  }

  // Check balances with transaction buffer
  // Fix the method name for getting balances
  const balances = await polkadot.getBalance(keyPair, [baseTokenSymbol, quoteTokenSymbol, "HDX"]);
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
    const api = polkadot.api;

    // Create the add liquidity transaction
    // Example based on GalacticCouncil SDK for Omnipool
    const addLiquidityTx = api.tx.omnipool.addLiquidity(
      baseAsset.id,
      baseAmountBN.toString(),
      //calculateMinAmountOut(quoteAmountBN, effectiveSlippage).toString()
    );

    // Sign and send the transaction - Fix the signAndSend callback signature
    const txHash = await new Promise<string>((resolve, reject) => {
      // Use the correct callback format for Polkadot.js
      addLiquidityTx.signAndSend(keyPair, (result) => {
        if (result.status.isInBlock || result.status.isFinalized) {
          resolve(result.status.asInBlock.toString());
        } else if (result.isError) {
          reject(new Error(`Transaction failed: ${result.status.toString()}`));
        }
      }).catch(error => {
        reject(error);
      });
    });

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
 * Calculate minimum amount out based on slippage
 */
function calculateMinAmountOut(amount: BigNumber, slippagePct: number): BigNumber {
  return amount.multipliedBy(new BigNumber(100 - slippagePct).dividedBy(100));
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
            slippagePct: { type: 'number', examples: [1] }
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
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.body as AddLiquidityRequestType;
        const network = (request.body as AddLiquidityRequestType).network || 'mainnet';

        const result = await addLiquidity(
          fastify,
          network,
          walletAddress,
          positionAddress,
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

