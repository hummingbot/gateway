import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../../services/logger';
import {
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityRequestType,
  AddLiquidityResponseType,
} from '../../../schemas/trading-types/amm-schema';

// /**
//  * Finds the best liquidity pool for a given token pair, based on best price ratio and deepest liquidity.
//  * This function does not require a swap amount — it uses internal pool metrics to estimate value.
//  *
//  * @param {string} baseToken - The symbol of the base token.
//  * @param {string} quoteToken - The symbol of the quote token.
//  * @returns {object} - An object containing the best pool and the corresponding real base/quote tokens.
//  */
// function getPool(ergo: Ergo, baseToken: string, quoteToken: string) {
//   // Retrieve candidate pools (array or single pool)
//   let pools = ergo.getPoolByToken(baseToken, quoteToken);

//   if (!pools) {
//     throw new Error(`Pool not found for ${baseToken} and ${quoteToken}`);
//   }

//   let deepestPool = pools.reduce((a, b) => {
//     if (a.info.lp.amount > b.info.lp.amount) {
//       return a;
//     } else {
//       return b;
//     }
//   });

//   return deepestPool;
// }

// async function createTxContext(ergo: Ergo, pool: Pool, return_address: string) {
//   const config = getErgoConfig(ergo.network);

//   let realBaseToken = ergo.findToken(pool.assetX.name);
//   let realQuoteToken = ergo.findToken(pool.assetY.name);

//   const _slippage = config.network.defaultSlippage;

//   const { sell, amount, from, to, minOutput } = ergo.calculateSwapParameters(
//     pool,
//     realBaseToken,
//     BigNumber(1),
//     _slippage,
//   );

//   const { baseInput, baseInputAmount } = getBaseInputParameters(pool, {
//     inputAmount: from,
//     slippage: _slippage || config.network.defaultSlippage,
//   });

//   const networkContext = await ergo.getNetworkContext();
//   const txAssembler = new DefaultTxAssembler(ergo.network === 'mainnet');

//   const utxos = await ergo.getAddressUnspentBoxes(return_address);

//   const swapVariables = ergo.calculateSwapVariables(config, minOutput);

//   const inputs = ergo.prepareInputs(
//     utxos,
//     from,
//     baseInputAmount,
//     config,
//     swapVariables[1],
//   );

//   return ergo.createTxContext(inputs, networkContext, return_address, config);
// }
// /**
//  * Constructs an add-liquidity (deposit) transaction for a given AMM pool.
//  * @param pool An existing `AmmPool` instance (the liquidity pool to deposit into).
//  * @param params Deposit parameters (`DepositParams`) specifying token amounts.
//  * @param account The user’s `ErgoAccount` (payer of ERG and signer).
//  * @param ctx Current `TransactionContext` (network height, parameters, etc.).
//  * @returns An `ErgoTx` representing the add-liquidity transaction.
//  */
// async function createAddLiquidityTx(
//   ergo: Ergo,
//   tokenX: string,
//   tokenY: string,
//   params: DepositParams<NativeExFeeType>,
//   userAccount: ErgoAccount,
// ): Promise<ErgoTx> {
//   // Wrap the pool actions for native asset fee (ERG). This prepares the AMM actions for use.
//   let poolActions = ergo.getPoolActions(
//     userAccount.address,
//     userAccount,
//     new DefaultTxAssembler(true),
//   );

//   let pool = getBestPool(ergo, tokenX, tokenY);

//   // Call deposit with the provided params and a native ERG fee.
//   // NativeExFeeType specifies fee in nano-ERG (for example, 5000000 = 0.005 ERG).
//   const tx: ErgoTx = await poolActions(pool).deposit(
//     params,
//     await createTxContext(ergo, pool, userAccount.address),
//   );

//   return tx;
// }

const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a spectrum AMM/CPMM pool',
        tags: ['spectrum/amm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            poolAddress: {
              type: 'string',
              examples: ['6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg'],
            }, // AMM RAY-USDC
            // poolAddress: { type: 'string', examples: ['7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny'] }, // CPMM SOL-USDC
            slippagePct: { type: 'number', examples: [1] },
            baseTokenAmount: { type: 'number', examples: [1] },
            quoteTokenAmount: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (_) => {
      try {
        throw fastify.httpErrors.internalServerError('not implemented !');
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
