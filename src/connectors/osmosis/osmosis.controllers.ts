import { decodeTxRaw } from '@cosmjs/proto-signing';
import { BigNumber } from 'bignumber.js';
import { Decimal } from 'decimal.js-light';
import { FastifyInstance } from 'fastify';

import { CosmosWallet } from '../../chains/cosmos/cosmos-base';
import { toCosmosBalances } from '../../chains/cosmos/cosmos.controllers';
import { CosmosBalanceRequest } from '../../chains/cosmos/cosmos.requests';
import { CosmosAsset } from '../../chains/cosmos/cosmos.universaltypes';
import {
  PoolInfo as AMMPoolInfo,
  GetPoolInfoRequestType as AMMGetPoolInfoRequestType,
  PositionInfo as AMMPositionInfo,
  GetPositionInfoRequestType as AMMGetPositionInfoRequestType,
  AddLiquidityRequestType as AMMAddLiquidityRequestType,
  AddLiquidityResponseType as AMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as AMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as AMMRemoveLiquidityResponseType,
} from '../../schemas/amm-schema';
import {
  TokensRequestType,
  TokensResponseType,
  EstimateGasResponse,
  PollResponseType,
  PollRequestType,
} from '../../schemas/chain-schema';
import {
  CollectFeesRequestType as CLMMCollectFeesRequestType,
  CollectFeesResponseType as CLMMCollectFeesResponseType,
  OpenPositionRequestType as CLMMOpenPositionRequestType,
  OpenPositionResponseType as CLMMOpenPositionResponseType,
  ClosePositionRequestType as CLMMClosePositionRequestType,
  ClosePositionResponseType as CLMMClosePositionResponseType,
  PoolInfo as CLMMPoolInfo,
  GetPoolInfoRequestType as CLMMGetPoolInfoRequestType,
  PositionInfo as CLMMPositionInfo,
  GetPositionInfoRequestType as CLMMGetPositionInfoRequestType,
  AddLiquidityRequestType as CLMMAddLiquidityRequestType,
  AddLiquidityResponseType as CLMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as CLMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as CLMMRemoveLiquidityResponseType,
  FetchPoolsRequestType,
  QuoteSwapResponseType,
  QuoteSwapRequestType,
  ExecuteSwapRequestType,
  ExecuteSwapResponseType,
} from '../../schemas/clmm-schema';
import { logger } from '../../services/logger';

import { Osmosis } from './osmosis';
import {
  PriceAndSerializableExtendedPools,
  TransactionResponse,
  TransferRequest,
  TransferResponse,
  AnyTransactionResponse,
  OsmosisExpectedTrade,
  TradeInfo,
  TransactionEvent,
  TransactionEventAttribute,
  SerializableExtendedPool,
} from './osmosis.types';

// Osmosis transaction.code values
const successfulTransaction = 0;
const unconfirmedTransaction = 0;
const lessThanMinAmountSlippage = 7;
const insufficientFunds = 5;
const outOfGas = 11;

export async function getOsmoWallet(
  osmosis: Osmosis,
  address: string,
): Promise<{
  wallet: CosmosWallet;
}> {
  let wallet: CosmosWallet;
  wallet = undefined;
  try {
    wallet = await osmosis.getWallet(address, 'osmo');
  } catch (err) {
    logger.error(`Osmosis: Wallet ${address} not available.`);
    logger.error(err);
  }
  return { wallet };
}

export class OsmosisController {
  static async getTradeInfo(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: QuoteSwapRequestType,
    poolType: string,
  ): Promise<[TradeInfo, QuoteSwapResponseType]> {
    try {
      const gasAdjustment = osmosis.gasAdjustment; //
      const feeTier = osmosis.feeTier; //
      const baseAssetSymbol = req.baseToken;
      const quoteAssetSymbol = req.quoteToken;
      const baseAmount = new Decimal(req.amount);
      const tradeSide = req.side;

      const allowedSlippage = req.slippagePct ? req.slippagePct : osmosis.getAllowedSlippage();

      const baseToken: CosmosAsset = osmosis.getTokenBySymbol(baseAssetSymbol)!;
      const quoteToken: CosmosAsset = osmosis.getTokenBySymbol(quoteAssetSymbol)!;

      if (!baseToken || !quoteToken) {
        throw _fastify.httpErrors.notFound(`Token not found: ${!baseToken ? req.baseToken : req.quoteToken}`);
      }
      logger.info(`Base token (${req.baseToken}) info: ${JSON.stringify(baseToken)}`);
      logger.info(`Quote token (${req.quoteToken}) info: ${JSON.stringify(quoteToken)}`);

      const requestAmount: BigNumber = BigNumber(baseAmount.toFixed(baseToken.decimals));

      const expectedTrade: OsmosisExpectedTrade = await osmosis.estimateTrade(
        osmosis.network,
        quoteToken,
        baseToken,
        requestAmount,
        tradeSide,
        poolType,
        req.poolAddress,
        allowedSlippage,
        feeTier,
        gasAdjustment,
      );
      const tradeInfo: TradeInfo = {
        baseToken: baseToken,
        quoteToken: quoteToken,
        expectedTrade: expectedTrade,
        requestAmount: requestAmount,
      };

      let finalPoolAddress = req.poolAddress;
      if (
        tradeInfo &&
        tradeInfo.expectedTrade &&
        tradeInfo.expectedTrade.routes &&
        tradeInfo.expectedTrade.routes.length > 1
      ) {
        // finalPoolAddress = 'multiple pool hops';
        finalPoolAddress = tradeInfo.expectedTrade.routes[0].poolId;
      } else if (
        tradeInfo &&
        tradeInfo.expectedTrade &&
        tradeInfo.expectedTrade.routes &&
        tradeInfo.expectedTrade.routes.length == 1
      ) {
        finalPoolAddress = tradeInfo.expectedTrade.routes[0].poolId;
      }

      return [
        tradeInfo,
        {
          priceImpactPct: expectedTrade.priceImpact,
          slippagePct: allowedSlippage,
          amountIn: Number(expectedTrade.tokenInAmount),
          amountOut: Number(expectedTrade.tokenOutAmount),
          tokenIn: req.baseToken,
          tokenOut: req.quoteToken,
          price: tradeInfo.expectedTrade.executionPrice.toNumber(),
          poolAddress: finalPoolAddress,
          minAmountOut: Number(expectedTrade.tokenOutAmountAfterSlippage),
          maxAmountIn: Number(expectedTrade.tokenInAmountAfterSlippage),
        },
      ];
    } catch (e) {
      throw _fastify.httpErrors.internalServerError(e);
    }
  }

  static async quoteSwap(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: QuoteSwapRequestType,
    poolType: string,
  ): Promise<QuoteSwapResponseType> {
    let swapQuoteResponse: QuoteSwapResponseType;
    try {
      const tradeInfoAndSwapQuote = await this.getTradeInfo(osmosis, _fastify, req, poolType);
      swapQuoteResponse = tradeInfoAndSwapQuote[1];
    } catch (e) {
      if (e instanceof Error) {
        logger.error(`Osmosis:  Could not get trade info. ${e.message}  ${e.stack}  ${e.stack}`);
        throw _fastify.httpErrors.internalServerError(
          `Osmosis:  Could not get trade info. ${e.message}  ${e.stack}  ${e.stack}`,
        );
      } else {
        logger.error(`Osmosis:  Could not get trade info. Reason Unknown`);
        throw _fastify.httpErrors.internalServerError(`Osmosis:  Could not get trade info.  Reason Unknown`);
      }
    }
    return swapQuoteResponse;
  }

  static async executeSwap(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: ExecuteSwapRequestType,
    poolType: string,
  ): Promise<ExecuteSwapResponseType> {
    try {
      // const limitPrice = req.limitPrice; // MISSING?
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);

      let tradeInfo: TradeInfo;
      try {
        const tradeInfoAndSwapQuote = await this.getTradeInfo(osmosis, _fastify, req, poolType);
        tradeInfo = tradeInfoAndSwapQuote[0];
      } catch (e) {
        if (e instanceof Error) {
          logger.error(`Osmosis:  Could not get trade info. ${e.message}  ${e.stack}`);
          throw _fastify.httpErrors.internalServerError(
            `Osmosis:   Could not get trade info. ${req.baseToken} : ${req.quoteToken} - ${e.message}  ${e.stack}`,
          );
        } else {
          logger.error(`Osmosis:  Could not get trade info. Reason Unknown`);
          throw _fastify.httpErrors.internalServerError(
            `Osmosis:   Could not get trade info. ${req.baseToken} : ${req.quoteToken} - Reason Unknown`,
          );
        }
      }
      const gasAdjustment = osmosis.gasAdjustment;
      const feeTier = osmosis.feeTier;

      // LOGIC FOR LIMIT_PRICE - do not remove unless there's something I'm missing...
      // const price = tradeInfo.expectedTrade.executionPrice;
      // if (req.side === 'BUY') {
      //   if (
      //     limitPrice &&
      //     new Decimal(price.toFixed(8)).gt(new Decimal(limitPrice))
      //   ) {
      //     logger.error('Osmosis:    Trade failed. Swap price exceeded limit price: ' + price.toFixed(8) + ' > ' + limitPrice);
      //     throw _fastify.httpErrors.badRequest('Osmosis:    Trade failed. Swap price exceeded limit price: ' + price.toFixed(8) + ' > ' + limitPrice);
      //   }
      // }
      // else {
      //   logger.info(
      //     `Osmosis:    Expected execution price is ${price.toFixed(6)}, ` +
      //       `limit price is ${limitPrice}.`
      //   );
      //   if (
      //     limitPrice &&
      //     new Decimal(price.toFixed(8)).lt(new Decimal(limitPrice))
      //   ) {
      //     logger.error('Osmosis:    Trade failed. Swap price lower than limit price: ' + price.toFixed(8) + ' < ' + limitPrice);
      //     throw _fastify.httpErrors.badRequest('Osmosis:    Trade failed. Swap price lower than limit price: ' + price.toFixed(8) + ' < ' + limitPrice);
      //   }
      // }

      let balance_start_baseToken = new BigNumber(0);
      let balance_start_quoteToken = new BigNumber(0);
      let balance_end_baseToken = new BigNumber(0);
      let balance_end_quoteToken = new BigNumber(0);
      let transactionResponse: TransactionResponse;

      try {
        const start_balances = await osmosis.getBalances(wallet);
        balance_start_baseToken = start_balances[req.baseToken].value;
        balance_start_quoteToken = start_balances[req.quoteToken].value;
        transactionResponse = await osmosis.executeTrade(
          osmosis.network,
          wallet,
          req,
          tradeInfo,
          feeTier,
          gasAdjustment,
        );
        const end_balances = await osmosis.getBalances(wallet);
        balance_end_baseToken = end_balances[req.baseToken].value;
        balance_end_quoteToken = end_balances[req.quoteToken].value;
      } catch (e) {
        if (e instanceof Error) {
          logger.error(`Osmosis:  Could not get trade info. ${e.message}  ${e.stack}`);
          throw _fastify.httpErrors.badRequest(
            `Osmosis:   Could not get trade info. ${req.baseToken} : ${req.quoteToken} - ${e.message}  ${e.stack}`,
          );
        } else {
          logger.error(`Osmosis:  Could not get trade info. Reason Unknown`);
          throw _fastify.httpErrors.badRequest(
            `Osmosis:   Could not get trade info. ${req.baseToken} : ${req.quoteToken} - Reason Unknown`,
          );
        }
      }

      const tx = transactionResponse;
      const txMessage = 'Trade has been executed. ';
      this.validateTxErrors(tx, txMessage);

      let finalAmountReceived_string = '';
      for (let txEvent_idx = 0; txEvent_idx < tx.events.length; txEvent_idx++) {
        const txEvent: TransactionEvent = tx.events[txEvent_idx];
        if (txEvent.type == 'coin_received') {
          for (let txEventAttribute_idx = 0; txEventAttribute_idx < txEvent.attributes.length; txEventAttribute_idx++) {
            const txEventAttribute: TransactionEventAttribute = txEvent.attributes[txEventAttribute_idx];
            if (txEventAttribute.key == 'receiver') {
              if (txEventAttribute.value == req.walletAddress) {
                const next_txEventAttribute: TransactionEventAttribute = txEvent.attributes[txEventAttribute_idx + 1];
                if (next_txEventAttribute.key == 'amount' && next_txEventAttribute.value) {
                  finalAmountReceived_string = next_txEventAttribute.value;
                }
              }
            }
          }
        }
      }
      let finalAmountReceived = new BigNumber(0);
      if (finalAmountReceived_string != '') {
        finalAmountReceived = new BigNumber(finalAmountReceived_string.replace(tradeInfo.quoteToken.base, ''))
          .shiftedBy(tradeInfo.quoteToken.decimals * -1)
          .decimalPlaces(tradeInfo.quoteToken.decimals);
      }

      const totalOutputSwapped = new BigNumber(req.amount)
        .shiftedBy(tradeInfo.baseToken.decimals)
        .decimalPlaces(tradeInfo.baseToken.decimals);

      const balanceChange_baseToken = balance_end_baseToken.minus(balance_start_baseToken).toNumber();
      const balanceChange_quoteToken = balance_end_quoteToken.minus(balance_start_quoteToken).toNumber();
      const executeSwapResponse: ExecuteSwapResponseType = {
        data: {
          tokenIn: req.baseToken,
          tokenOut: req.quoteToken,
          amountIn: finalAmountReceived.toNumber(),
          amountOut: totalOutputSwapped.toNumber(),
          fee: Number(tx.feeAmount),
          baseTokenBalanceChange: balanceChange_baseToken,
          quoteTokenBalanceChange: balanceChange_quoteToken,
        },
        signature: tx.transactionHash,
        status: 0,
      };
      return executeSwapResponse;
    } catch (e) {
      throw _fastify.httpErrors.internalServerError(e);
    }
  }

  static async addLiquidityAMM(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: AMMAddLiquidityRequestType,
  ): Promise<AMMAddLiquidityResponseType> {
    const signature: string = '';
    let addLiquidityResponse: AMMAddLiquidityResponseType = {
      signature,
      status: 1,
    };
    const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
    const gasAdjustment = osmosis.gasAdjustment; //
    const feeTier = osmosis.feeTier; //
    try {
      const txAndAddPositionResponse = await osmosis.addLiquidityAMM(wallet, req, feeTier, gasAdjustment);
      const tx = txAndAddPositionResponse[0];
      addLiquidityResponse = txAndAddPositionResponse[1];
      this.validateTxErrors(tx, 'Liquidity added. ');
      return addLiquidityResponse;
    } catch (err) {
      console.error('Osmosis:   ' + err.message);
      throw _fastify.httpErrors.internalServerError(err);
    }

    return addLiquidityResponse;
  }

  // Required before AddLiquityCLMM
  static async openPositionCLMM(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: CLMMOpenPositionRequestType,
  ): Promise<CLMMOpenPositionResponseType> {
    try {
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
      const txAndOpenPositionResponse = await osmosis.OpenPositionCLMM(wallet, req as CLMMOpenPositionRequestType);
      const openPositionTx = txAndOpenPositionResponse[0];
      const openPositionResponse: CLMMOpenPositionResponseType = txAndOpenPositionResponse[1];
      this.validateTxErrors(openPositionTx, 'CLMM Position Opened.');
      return openPositionResponse;
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  // Apparently CLMMAddLiquidityRequestType doesn't contain baseToken/quoteToken, meaning it requires an OpenPositionRequest first...
  static async addLiquidityCLMM(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: CLMMAddLiquidityRequestType,
  ): Promise<CLMMAddLiquidityResponseType> {
    try {
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
      const txAndAddLiquidityResponse = await osmosis.AddLiquidityCLMM(wallet, req as CLMMAddLiquidityRequestType);
      const tx = txAndAddLiquidityResponse[0];
      const addLiquidityResponse = txAndAddLiquidityResponse[1];
      this.validateTxErrors(tx, 'Liquidity added. ');
      return addLiquidityResponse;
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  static async removeLiquidityAMM(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: AMMRemoveLiquidityRequestType,
  ): Promise<AMMRemoveLiquidityResponseType> {
    try {
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
      const gasAdjustment = osmosis.gasAdjustment; //
      const feeTier = osmosis.feeTier; //
      const txAndReduceResponse = await osmosis.removeLiquidityAMM(wallet, req, feeTier, gasAdjustment);
      const tx = txAndReduceResponse[0];
      const reduceLiquidityResponse = txAndReduceResponse[1];

      logger.info(`Osmosis:    Liquidity removed, txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}.`);
      return reduceLiquidityResponse;
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  static async removeLiquidityCLMM(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: CLMMRemoveLiquidityRequestType,
  ): Promise<CLMMRemoveLiquidityResponseType> {
    try {
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
      const response = await osmosis.removeLiquidityCLMM(wallet, req);
      return response;
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  // this is the same as removeLiquidityCLMM but with collectFees first
  static async closePositionCLMM(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: CLMMClosePositionRequestType,
  ): Promise<CLMMClosePositionResponseType> {
    try {
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
      const responseCollect = await osmosis.collectRewardsIncentives(wallet, req);
      const req_remove: CLMMRemoveLiquidityRequestType = {
        walletAddress: req.walletAddress,
        percentageToRemove: 100,
        positionAddress: req.positionAddress,
      };

      const responseRemove: CLMMRemoveLiquidityResponseType = await osmosis.removeLiquidityCLMM(wallet, req_remove);

      let final_fee = 0;
      if (responseRemove.data.fee) {
        final_fee += responseRemove.data.fee;
      }
      if (responseCollect.data.fee) {
        final_fee += responseCollect.data.fee;
      }
      const finalResponse: CLMMClosePositionResponseType = {
        signature: responseRemove.signature,
        status: responseRemove.status,
        data: {
          fee: final_fee,
          baseTokenAmountRemoved: responseRemove.data.baseTokenAmountRemoved,
          quoteTokenAmountRemoved: responseRemove.data.quoteTokenAmountRemoved,
          baseFeeAmountCollected: responseCollect.data.baseFeeAmountCollected,
          quoteFeeAmountCollected: responseCollect.data.quoteFeeAmountCollected,
          positionRentRefunded: 0,
        },
      };

      return finalResponse;
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  static async collectFees(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: CLMMCollectFeesRequestType,
  ): Promise<CLMMCollectFeesResponseType> {
    try {
      const { wallet } = await getOsmoWallet(osmosis, req.walletAddress);
      const response = await osmosis.collectRewardsIncentives(wallet, req);
      return response;
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  // find pool by poolAddress, or both token0, token1 (support for latter option now gone in HBOT main)
  // we return multiple pools if we find for token pair but take one with highest liquidity - support lacking from hbot main
  static async poolInfoRequest(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: AMMGetPoolInfoRequestType | CLMMGetPoolInfoRequestType, // these types are actually identical... but keeping || in case of future changes
    poolType: string,
  ): Promise<AMMPoolInfo | CLMMPoolInfo> {
    let token0: CosmosAsset;
    let token1: CosmosAsset;

    const priceAndPools: PriceAndSerializableExtendedPools = await osmosis.findPoolsPrices(
      poolType,
      req.poolAddress,
      token0,
      token1,
    );

    if (!priceAndPools.pools || priceAndPools.pools.length == 0) {
      logger.error(
        `Osmosis:    Pool info request failed - no pools found for poolAddress, baseToken, quoteToken: ${req.poolAddress}`, //, ${req.baseToken}, ${req.quoteToken}.`,
      );
      throw _fastify.httpErrors.notFound(
        `Osmosis:    Pool info request failed - no pools found for poolAddress, baseToken, quoteToken: ${req.poolAddress}`, //, ${req.baseToken}, ${req.quoteToken}.`,
      );
    }
    if (!priceAndPools.prices || priceAndPools.prices.length == 0) {
      logger.error(
        `Osmosis:    Pool info request failed - no pools found for poolAddress, baseToken, quoteToken: ${req.poolAddress}`, //, ${req.baseToken}, ${req.quoteToken}.`,
      );
      throw _fastify.httpErrors.notFound(
        `Osmosis:    Pool info request failed - no pools found for poolAddress, baseToken, quoteToken: ${req.poolAddress}`, //, ${req.baseToken}, ${req.quoteToken}.`,
      );
    }

    logger.info(
      `Osmosis:    Pool Info Request completed for poolAddress, baseToken, quoteToken: ${req.poolAddress}`, //, ${req.baseToken}, ${req.quoteToken}.`,
    );

    const pool = priceAndPools.pools[0];
    const price = priceAndPools.prices[0];

    if (poolType == 'amm') {
      const poolResponseAMM: AMMPoolInfo = {
        address: pool.address,
        baseTokenAddress: pool.poolAssets[0].token.denom, // base token denom - sort of works as an address in this case
        quoteTokenAddress: pool.poolAssets[1].token.denom,
        feePct: Number(pool.swapFee),
        price: Number(price),
        baseTokenAmount: Number(pool.poolAssets[0].token.amount),
        quoteTokenAmount: Number(pool.poolAssets[1].token.amount),
      };
      return poolResponseAMM;
    } else {
      //poolType == "clmm"
      const poolResponseCLMM: CLMMPoolInfo = {
        address: pool.address,
        baseTokenAddress: pool.token0,
        quoteTokenAddress: pool.token1,
        feePct: Number(pool.swapFee),
        price: Number(price),
        baseTokenAmount: Number(pool.currentTickLiquidity),
        quoteTokenAmount: Number(pool.currentTickLiquidity),
        binStep: Number(pool.tickSpacing),
        activeBinId: Number(pool.currentTick),
      };
      return poolResponseCLMM;
    }
  }

  static async fetchPoolsForTokens(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: FetchPoolsRequestType,
    poolType: string,
  ): Promise<SerializableExtendedPool[]> {
    const token0: CosmosAsset = osmosis.getTokenBySymbol(req.tokenA)!;
    const token1: CosmosAsset = osmosis.getTokenBySymbol(req.tokenB)!;
    if (!token0) {
      logger.error('Osmosis:   baseToken not supported: ' + req.tokenA);
      throw _fastify.httpErrors.badRequest('Osmosis:   baseToken not supported: ' + req.tokenA);
    }
    if (!token1) {
      logger.error('Osmosis:   quoteToken not supported: ' + req.tokenB);
      throw _fastify.httpErrors.badRequest('Osmosis:   quoteToken not supported: ' + req.tokenB);
    }

    const priceAndPools: PriceAndSerializableExtendedPools = await osmosis.findPoolsPrices(
      poolType,
      '',
      token0,
      token1,
    );

    if (!priceAndPools.pools || priceAndPools.pools.length == 0) {
      logger.error(
        `Osmosis:    Fetch pools for tokens request failed - no pools found for baseToken, quoteToken: ${req.tokenA}, ${req.tokenB}.`,
      );
      throw _fastify.httpErrors.notFound(
        `Osmosis:    Fetch pools for tokens request failed - no pools found for baseToken, quoteToken: ${req.tokenA}, ${req.tokenB}.`,
      );
    }
    if (!priceAndPools.prices || priceAndPools.prices.length == 0) {
      logger.error(
        `Osmosis:    Fetch pools for tokens request failed - no pools found for baseToken, quoteToken: ${req.tokenA}, ${req.tokenB}.`,
      );
      throw _fastify.httpErrors.notFound(
        `Osmosis:    Fetch pools for tokens request failed - no pools found for baseToken, quoteToken: ${req.tokenA}, ${req.tokenB}.`,
      );
    }

    logger.info(
      `Osmosis:    Fetch pools for tokens request completed - no pools found for baseToken, quoteToken: ${req.tokenA}, ${req.tokenB}.`,
    );

    return priceAndPools.pools;
  }

  // find singular positionId
  static async poolPosition(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    req: AMMGetPositionInfoRequestType | CLMMGetPositionInfoRequestType,
    poolType: string,
  ): Promise<AMMPositionInfo | CLMMPositionInfo> {
    try {
      let response;
      if (poolType == 'amm') {
        response = (await osmosis.findPoolsPositionsGAMM(req as AMMGetPositionInfoRequestType)) as AMMPositionInfo[];
      } else {
        response = (await osmosis.findPoolsPositionsCLMM(req as CLMMGetPositionInfoRequestType)) as CLMMPositionInfo[];
      }

      return {
        network: osmosis.network,
        ...response[0],
      };
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  // find all pool positions for address or singular poolId if supplied
  static async allPoolPositions(
    osmosis: Osmosis,
    _fastify: FastifyInstance,
    walletAddress: string,
    poolType: string,
  ): Promise<AMMPositionInfo[] | CLMMPositionInfo[]> {
    try {
      let response;
      if (poolType == 'amm') {
        response = (await osmosis.findPoolsPositionsGAMM({
          walletAddress: walletAddress,
        } as AMMGetPositionInfoRequestType)) as AMMPositionInfo[];
      } else {
        response = (await osmosis.findPoolsPositionsCLMM(
          {
            walletAddress: walletAddress,
            positionAddress: 'NONE',
          } as CLMMGetPositionInfoRequestType,
          true,
        )) as CLMMPositionInfo[];
      }

      return {
        network: osmosis.network,
        ...response,
      };
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  static async getTokens(osmosis: Osmosis, req: TokensRequestType): Promise<TokensResponseType> {
    return await osmosis.getTokens(req);
  }

  static async transfer(osmosis: Osmosis, _fastify: FastifyInstance, req: TransferRequest): Promise<TransferResponse> {
    const { wallet } = await getOsmoWallet(osmosis, req.from);

    const token: CosmosAsset = osmosis.getTokenBySymbol(req.token)!;
    const tx = await osmosis.transfer(wallet, token, req);

    const txMessage = 'Transfer success. To: ' + req.to + ' From: ' + req.from + ' ';
    this.validateTxErrors(tx, txMessage);
    if (tx.code == successfulTransaction) {
      return (
        'Transfer success. To: ' +
        req.to +
        ' From: ' +
        req.from +
        ' Hash: ' +
        tx.transactionHash +
        ' gasUsed: ' +
        tx.gasUsed +
        ' gasWanted: ' +
        tx.gasWanted
      );
    } else {
      logger.error('Osmosis:   Transfer failed. ' + tx.rawLog);
      throw _fastify.httpErrors.badRequest('Osmosis:   Transfer failed. ' + tx.rawLog);
    }
  }

  static async estimateGas(osmosis: Osmosis, _fastify: FastifyInstance): Promise<EstimateGasResponse> {
    try {
      const gasPrice = await osmosis.getLatestBasePrice();
      const gasLimitUsed = osmosis.gasLimitTransaction;
      return {
        timestamp: Date.now(),
        denomination: osmosis.nativeTokenSymbol,
        feePerComputeUnit: gasLimitUsed,
        computeUnits: 0,
        feeAsset: 'OSMO',
        fee: gasPrice,
      };
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  static async balances(osmosis: Osmosis, _fastify: FastifyInstance, req: CosmosBalanceRequest) {
    try {
      const wallet = await osmosis.getWallet(req.address, 'osmo');
      let replyWithAllTokens = false;
      let tokenSymbols: string[] = [];
      // FILTER IF req.tokenSymbols != []
      if (req && req.tokenSymbols && req.tokenSymbols.length > 0) {
        req.tokenSymbols.forEach((sym) => {
          const tsym = osmosis.getToken(sym);
          if (!tsym || tsym == undefined) {
            throw _fastify.httpErrors.notFound('Invalid token symbol: ' + sym);
          }
        });
        tokenSymbols = req.tokenSymbols;
      } else {
        replyWithAllTokens = true;
      }

      const balances = await osmosis.getBalances(wallet);
      const filteredBalances = toCosmosBalances(balances, osmosis.storedTokenList, replyWithAllTokens);

      return {
        network: osmosis.network,
        balances: filteredBalances,
        wallet: req.address,
      };
    } catch (err) {
      throw _fastify.httpErrors.internalServerError(err);
    }
  }

  static async poll(osmosis: Osmosis, request: PollRequestType): Promise<PollResponseType> {
    try {
      const response = await osmosis.getTransaction(request.signature);
      const currentBlock = await osmosis.getCurrentBlockNumber();
      let tokenBalanceChanges: Record<string, number> = {};
      {
        const dissectRes = (await osmosis.dissectTransactionResponse(request.walletAddress, undefined, response)) as [
          Record<string, number>,
          Record<string, number>,
          string,
        ];
        tokenBalanceChanges = dissectRes[1];
      }

      let fee = 0;
      if (
        response.tx.authInfo &&
        response.tx.authInfo.fee &&
        response.tx.authInfo.fee.amount &&
        response.tx.authInfo.fee.amount[0]
      ) {
        fee = Number(response.tx.authInfo.fee.amount[0].amount.toString());
      }

      const response_out: PollResponseType = {
        tokenBalanceChanges: tokenBalanceChanges,
        currentBlock: currentBlock,
        signature: request.signature,
        txStatus: response.txResponse.code,
        txBlock: Number(response.txResponse.height.toString()),
        fee: fee,
        txData: response.txResponse.events,
      };
      return response_out;
    } catch (error) {
      if (error.statusCode) {
        throw error; // Re-throw if it's already a Fastify error
      }
      logger.error(`Error polling transaction: ${error.message}`);
    }
  }

  static validateTxErrors(tx: AnyTransactionResponse, msg: string) {
    if (tx.code != successfulTransaction) {
      if (tx.code == outOfGas) {
        logger.error(
          `Osmosis:    Failed to execute trade: Out of gas. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed} greater than gasWanted ${tx.gasWanted} . Log: ${tx.rawLog}`,
        );
        throw new Error(
          `Osmosis:    Failed to execute trade: Out of gas. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed} greater than gasWanted ${tx.gasWanted} . Log: ${tx.rawLog}`,
        );
      } else if (tx.code == lessThanMinAmountSlippage) {
        logger.error(
          `Osmosis:    Failed to execute trade. Token created less than minimum amount; increase slippage. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`,
        );
        throw new Error(
          `Osmosis:    Failed to execute trade. Token created less than minimum amount; increase slippage. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`,
        );
      } else if (tx.code == insufficientFunds) {
        logger.error(
          `Osmosis:    Failed to execute trade. Insufficient funds. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`,
        );
        throw new Error(
          `Osmosis:    Failed to execute trade. Insufficient funds. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`,
        );
      } else {
        logger.error(
          `Osmosis:    Failed to execute trade. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`,
        );
        throw new Error(
          `Osmosis:    Failed to execute trade. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`,
        );
      }
    }
    logger.info('Osmosis:    ' + msg + `txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}.`);
  }
}
