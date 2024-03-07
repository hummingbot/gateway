
import {
  HttpException,
  LOAD_WALLET_ERROR_CODE,
  LOAD_WALLET_ERROR_MESSAGE,
  PRICE_FAILED_ERROR_CODE,
  PRICE_FAILED_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_CODE,
  TRADE_FAILED_ERROR_MESSAGE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE,
  SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE
} from '../../services/error-handler';
import { CosmosAsset, CosmosWallet } from '../../chains/cosmos/cosmos-base'; 
import { AnyTransactionResponse, OsmosisExpectedTrade, TransactionEvent, TransactionEventAttribute, } from './osmosis.types' 
import { latency } from '../../services/base';
import {
  CustomTransaction,
  Tokenish,
} from '../../services/common-interfaces';
import { logger } from '../../services/logger';
import {
  EstimateGasResponse,
  PriceRequest,
  TradeRequest,
  AddLiquidityRequest,
  AddLiquidityResponse,
  PoolPriceRequest,
  PoolPriceResponse,
  RemoveLiquidityRequest,
  RemoveLiquidityResponse,
  PositionRequest,
  PositionResponse,
  TradeResponse,
  PriceResponse,
} from '../../amm/amm.requests';
import { Osmosis } from './osmosis';

import BigNumber from 'bignumber.js';
import { Decimal } from 'decimal.js-light';
import { CosmosAsset as TokenishCosmosAsset} from '../../chains/cosmos/cosmos-base';
import { TokensRequest, TokensResponse } from '../../network/network.requests';
import { TransferRequest, TransferResponse } from '../../services/common-interfaces';
//@ts-ignore
import { validateCosmosBalanceRequest, validateCosmosPollRequest } from '../cosmos/cosmos.validators';
import { CosmosBalanceRequest, CosmosPollRequest } from '../cosmos/cosmos.requests';
import { toCosmosBalances } from '../cosmos/cosmos.controllers';
import { AllowancesRequest, ApproveRequest, CancelRequest, NonceRequest, NonceResponse } from '../chain.requests';
import { TOKEN_NOT_SUPPORTED_ERROR_MESSAGE, TOKEN_NOT_SUPPORTED_ERROR_CODE, OUT_OF_GAS_ERROR_MESSAGE, OUT_OF_GAS_ERROR_CODE, INSUFFICIENT_FUNDS_ERROR_MESSAGE, INSUFFICIENT_FUNDS_ERROR_CODE, AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE, AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE } from '../../services/error-handler';
const { decodeTxRaw } = require('@cosmjs/proto-signing');

// Osmosis transaction.code values
const successfulTransaction = 0;
const unconfirmedTransaction = 0;
const lessThanMinAmountSlippage = 7;
const insufficientFunds = 5;
const outOfGas = 11;

export interface TradeInfo {
  baseToken: TokenishCosmosAsset;
  quoteToken: TokenishCosmosAsset;
  requestAmount: BigNumber;
  expectedTrade: OsmosisExpectedTrade;
}

export async function getOsmoWallet(
  osmosis: Osmosis,
  address: string,
): Promise<{
  wallet: CosmosWallet;
}> {
  let wallet: CosmosWallet;
  try {
    wallet = await osmosis.getWallet(address, 'osmosis');
  } catch (err) {
    logger.error(`Wallet ${address} not available.`);
    throw new HttpException(
      500,
      LOAD_WALLET_ERROR_MESSAGE + err,
      LOAD_WALLET_ERROR_CODE
    );
  }
  return { wallet };
}

export class OsmosisController {

  static async getTradeInfo(
      osmosis: Osmosis,
      baseAsset: string,
      quoteAsset: string,
      baseAmount: Decimal,
      tradeSide: string,
      allowedSlippage?: string,
    ): Promise<TradeInfo> {
      const gasAdjustment = osmosis.gasPriceConstant; // 
      const feeTier = osmosis.feeTier; // 

      const baseToken: Tokenish = osmosis.getTokenBySymbol(baseAsset)!;
      const quoteToken: Tokenish = osmosis.getTokenBySymbol(quoteAsset)!;

      if (baseToken == undefined){
        throw new HttpException(
          500,
          TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + ' ' + baseAsset,
          TOKEN_NOT_SUPPORTED_ERROR_CODE
        );
      }
      if (quoteToken == undefined){
        throw new HttpException(
          500,
          TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + ' ' + quoteAsset,
          TOKEN_NOT_SUPPORTED_ERROR_CODE
        );
      }

      const requestAmount: BigNumber = BigNumber(
        baseAmount.toFixed(baseToken.decimals)
      );

      let expectedTrade: OsmosisExpectedTrade;
      expectedTrade = await osmosis.estimateTrade(
        quoteToken,
        baseToken,
        requestAmount,
        tradeSide,
        allowedSlippage,
        feeTier,
        gasAdjustment,
      );

      return {
        baseToken,
        quoteToken,
        requestAmount,
        expectedTrade,
      };
    }

    static async price(
      osmosis: Osmosis,
      req: PriceRequest
    ): Promise<PriceResponse> {
      const startTimestamp: number = Date.now();

      const gasPrice = osmosis.manualGasPrice;  // GAS PRICE PER UNIT OF WORK  
      const gasLimitTransaction = osmosis.gasLimitEstimate; // MAX uOSMO COST PER TRANSACTION 

      let tradeInfo: TradeInfo;
      try {
        tradeInfo = await this.getTradeInfo(
          osmosis,
          req.base,
          req.quote,
          new Decimal(req.amount),
          req.side,
        );
      } catch (e) {
        if (e instanceof Error) {
          throw new HttpException(
            500,
            PRICE_FAILED_ERROR_MESSAGE + e.message,
            PRICE_FAILED_ERROR_CODE
          );
        } else {
          throw new HttpException(
            500,
            UNKNOWN_ERROR_MESSAGE + ' Failed to retrive trade info.',
            UNKNOWN_ERROR_ERROR_CODE
          );
        }
      }

      const trade = tradeInfo.expectedTrade; 
      const expectedAmount = tradeInfo.expectedTrade.expectedAmount;
      const tradePrice = trade.executionPrice;


      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        base: tradeInfo.baseToken.symbol,
        quote: tradeInfo.quoteToken.symbol,
        amount: new Decimal(req.amount).toFixed(tradeInfo.baseToken.decimals),
        rawAmount: tradeInfo.requestAmount.toString(),
        expectedAmount: expectedAmount.toString(),
        price: tradePrice.toString(),
        gasPrice: Number(gasPrice),
        gasLimit: Number(gasLimitTransaction),
        gasCost: tradeInfo.expectedTrade.gasUsed,
        gasWanted: tradeInfo.expectedTrade.gasWanted,
        gasPriceToken: 'uosmo'
      };
    }

    static async trade(
      osmosis: Osmosis,
      req: TradeRequest
    ): Promise<TradeResponse> {
      const startTimestamp: number = Date.now();

      const limitPrice = req.limitPrice;
      const { wallet } =
        await getOsmoWallet(
          osmosis,
          req.address,
        );

      let tradeInfo: TradeInfo;
      try {
        tradeInfo = await this.getTradeInfo(
          osmosis,
          req.base,
          req.quote,
          new Decimal(req.amount),
          req.side,
          req.allowedSlippage
        );
      } catch (e) {
        if (e instanceof Error) {
          logger.error(`Could not get trade info. ${e.message}`);
          throw new HttpException(
            500,
            TRADE_FAILED_ERROR_MESSAGE + ' ' + e.message,
            TRADE_FAILED_ERROR_CODE
          );
        } else {
          logger.error('Unknown error trying to get trade info.');
          throw new HttpException(
            500,
            UNKNOWN_ERROR_MESSAGE + ' Failed to retrive trade info.',
            UNKNOWN_ERROR_ERROR_CODE
          );
        }
      }

      const price = tradeInfo.expectedTrade.executionPrice;

      const gasLimitTransaction = osmosis.gasLimitEstimate; // MAX uOSMO COST PER TRANSACTION 
      const gasAdjustment = osmosis.gasPriceConstant; // 
      const feeTier = osmosis.feeTier; // 

      if (req.side === 'BUY') {

        if (
          limitPrice &&
          new Decimal(price.toFixed(8)).gt(new Decimal(limitPrice))
        ) {
          logger.error('Swap price exceeded limit price.');
          throw new HttpException(
            500,
            SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_MESSAGE(
              price.toFixed(8),
              limitPrice
            ),
            SWAP_PRICE_EXCEEDS_LIMIT_PRICE_ERROR_CODE
          );
        }

      } 
      else {
        logger.info(
          `Expected execution price is ${price.toFixed(6)}, ` +
            `limit price is ${limitPrice}.`
        );
        if (
          limitPrice &&
          new Decimal(price.toFixed(8)).lt(new Decimal(limitPrice))
        ) {
          logger.error('Swap price lower than limit price.');
          throw new HttpException(
            500,
            SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_MESSAGE(
              price.toFixed(8),
              limitPrice
            ),
            SWAP_PRICE_LOWER_THAN_LIMIT_PRICE_ERROR_CODE
          );
        }
      }

      const tx = await osmosis.executeTrade(
        wallet,
        tradeInfo,
        req.address,
        req.allowedSlippage,
        feeTier,
        gasAdjustment,
      );

      const txMessage = 'Trade has been executed. '
      this.validateTxErrors(tx, txMessage);

      var finalAmountReceived_string = '';
      for (var txEvent_idx=0; txEvent_idx<tx.events.length; txEvent_idx++){
        var txEvent: TransactionEvent = tx.events[txEvent_idx];
        if (txEvent.type == 'coin_received'){
          for (var txEventAttribute_idx=0; txEventAttribute_idx<txEvent.attributes.length; txEventAttribute_idx++){
            var txEventAttribute: TransactionEventAttribute = txEvent.attributes[txEventAttribute_idx];
            if (txEventAttribute.key == 'receiver'){
              if (txEventAttribute.value == req.address){
                  var next_txEventAttribute: TransactionEventAttribute = txEvent.attributes[txEventAttribute_idx+1];
                  if (next_txEventAttribute.key == 'amount' && next_txEventAttribute.value){
                    finalAmountReceived_string = next_txEventAttribute.value;
                  }
              } 
            }
          }
        }
      }

      var finalAmountReceived = new BigNumber(0)
      if (finalAmountReceived_string != ''){
        finalAmountReceived = (new BigNumber(finalAmountReceived_string.replace(tradeInfo.quoteToken.base, ''))).shiftedBy(tradeInfo.quoteToken.decimals * -1).decimalPlaces(tradeInfo.quoteToken.decimals);
      }
      const finalExecutionPrice = finalAmountReceived.dividedBy(req.amount);

      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        base: tradeInfo.baseToken.base, // this is base denom. might want symbol tho? no address from what i see
        quote: tradeInfo.quoteToken.base,
        amount: new Decimal(req.amount).toFixed(tradeInfo.baseToken.decimals).toString(),
        rawAmount: tradeInfo.requestAmount.toString(),
        expectedOut: new BigNumber(tradeInfo.expectedTrade.expectedAmount).decimalPlaces(8).toString(),
        finalAmountReceived: finalAmountReceived.toString(),
        finalAmountReceived_basetoken: finalAmountReceived_string,
        expectedPrice: new BigNumber(price).decimalPlaces(8).toString(),
        price: finalExecutionPrice.toString(),
        gasPrice: tx.gasPrice,
        gasLimit: Number(gasLimitTransaction),
        gasCost: tx.gasUsed.toString(),
        gasWanted: tx.gasWanted.toString(),
        txHash: tx.transactionHash,
        gasPriceToken: osmosis.manualGasPriceToken
      };
    }

    static async addLiquidity(
      osmosis: Osmosis,
      req: AddLiquidityRequest 
    ): Promise<AddLiquidityResponse> {
      const startTimestamp: number = Date.now();

      const { wallet } =
        await getOsmoWallet(
          osmosis,
          req.address,
        );

      const token0: TokenishCosmosAsset = osmosis.getTokenBySymbol(req.token0)!;
      const token1: TokenishCosmosAsset = osmosis.getTokenBySymbol(req.token1)!;

      const gasLimitTransaction = osmosis.gasLimitEstimate; // MAX uOSMO COST PER TRANSACTION 
      const gasAdjustment = osmosis.gasPriceConstant; // 
      const feeTier = osmosis.feeTier; // 

      var tx = undefined;
      var out_tokenId = 0;
      if (req.lowerPrice){
        tx = await osmosis.addPositionLP(
          wallet,
          token0,
          token1,
          req,
          feeTier,
          gasAdjustment,
        );
        out_tokenId = tx.positionId!
      } else{
        tx = await osmosis.addPosition(
          wallet,
          req.address,
          token0,
          token1,
          req.amount0,
          req.amount1,
          req.tokenId,
          req.allowedSlippage,
          feeTier,
          gasAdjustment,
        );
        out_tokenId = tx.poolId
      }

      this.validateTxErrors(tx, "Liquidity added. ");
    
      // Instead of poolId for tokenId, we can return Position_id then filter our current positions to find it later, to get the poolId again.. then we'd support multiple positions for each pool
      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        token0: req.token0,
        token1: req.token1,
        fee: feeTier,
        tokenId: out_tokenId,
        gasPrice: tx.gasPrice,
        gasPriceToken: osmosis.manualGasPriceToken,
        gasLimit: Number(gasLimitTransaction),
        gasCost: tx.gasUsed.toString(),
        gasWanted: tx.gasWanted.toString(),
        txHash: tx.transactionHash,
        poolAddress: tx.poolAddress,
        poolShares: tx.poolshares,
        token0FinalAmount: tx.token0_finalamount,
        token1FinalAmount: tx.token1_finalamount,
        nonce: 0,
      };

    }

    static async removeLiquidity(
      osmosis: Osmosis,
      req: RemoveLiquidityRequest
    ): Promise<RemoveLiquidityResponse> {
      const startTimestamp: number = Date.now();

      const { wallet } =
        await getOsmoWallet(
          osmosis,
          req.address,
        );

      const gasPrice = osmosis.manualGasPrice;  // GAS PRICE PER UNIT OF WORK  
      const gasLimitTransaction = osmosis.gasLimitEstimate; // MAX uOSMO COST PER TRANSACTION 
      const gasAdjustment = osmosis.gasPriceConstant; // 
      const feeTier = osmosis.feeTier; // 

      const tx = await osmosis.reducePosition(
        wallet,
        req.decreasePercent,
        req.address,
        req.tokenId, // this is PositionID (CL) or PoolID (GAMM)
        req.allowedSlippage,
        feeTier,
        gasAdjustment,
      );

      logger.info(
        `Liquidity removed, txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}.`
      );

      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        tokenId: req.tokenId,
        balances: tx.balances,
        gasPrice: gasPrice.toString(),
        gasLimit: Number(gasLimitTransaction),
        gasCost: tx.gasUsed.toString(),
        gasWanted: tx.gasWanted.toString(),
        txHash: tx.transactionHash,
        gasPriceToken: osmosis.manualGasPriceToken,
        isCollectFees: false, // instead of collect 
      };
    } 


    static async collectFees(
      osmosis: Osmosis,
      req: RemoveLiquidityRequest
    ): Promise<RemoveLiquidityResponse> {
      const startTimestamp: number = Date.now();

      const { wallet } =
        await getOsmoWallet(
          osmosis,
          req.address,
        );

      const gasPrice = osmosis.manualGasPrice;  // GAS PRICE PER UNIT OF WORK  
      const gasLimitTransaction = osmosis.gasLimitEstimate; // MAX uOSMO COST PER TRANSACTION 
      const gasAdjustment = osmosis.gasPriceConstant; // 
      const feeTier = osmosis.feeTier; // 

      const tx = await osmosis.collectRewardsIncentives(
        wallet,
        req.address,
        req.tokenId, // this is PositionID (CL) or PoolID (GAMM)
        feeTier,
        gasAdjustment,
      );

      logger.info(
        `Collected Fees, txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}.`
      );

      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        tokenId: req.tokenId,
        balances: tx.balances,
        gasPrice: gasPrice.toString(),
        gasLimit: Number(gasLimitTransaction),
        gasCost: tx.gasUsed.toString(),
        gasWanted: tx.gasWanted.toString(),
        txHash: tx.transactionHash,
        gasPriceToken: osmosis.manualGasPriceToken,
        isCollectFees: true, // instead of collect 
      };
    } 

    // find pools containing both token0, token1
    static async poolPrice(
      osmosis: Osmosis,
      req: PoolPriceRequest
    ): Promise<PoolPriceResponse> {
      const startTimestamp: number = Date.now();

      const token0: TokenishCosmosAsset = osmosis.getTokenBySymbol(req.token0)!;
      const token1: TokenishCosmosAsset = osmosis.getTokenBySymbol(req.token1)!;

      if (token0 == undefined){
        throw new HttpException(
          500,
          TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + ' ' + req.token0,
          TOKEN_NOT_SUPPORTED_ERROR_CODE
        );
      }
      if (token1 == undefined){
        throw new HttpException(
          500,
          TOKEN_NOT_SUPPORTED_ERROR_MESSAGE + ' ' + req.token1,
          TOKEN_NOT_SUPPORTED_ERROR_CODE
        );
      }

      const priceAndPools = await osmosis.findPoolsPrices(
        token0,
        token1,
        req.address!
      );

      logger.info(
        `Found pools and prices for ${req.token0}, ${req.token1}.`
      );

      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        token0: req.token0,
        token1: req.token1,
        prices: [priceAndPools.price],
        pools: priceAndPools.pools, //CosmosExtendedPool[];
      };
    }

    // find all pool positions for address or singular poolId if supplied
    static async poolPositions(
      osmosis: Osmosis,
      req: PositionRequest
    ): Promise<PositionResponse> {
      const startTimestamp: number = Date.now();

      const response = await osmosis.findPoolsPositions(
        req.address!,
        req.tokenId
      );
      
      if (req.tokenId){
        logger.info(
          `Found pool positions for ${req.address}, ${req.tokenId!.toString()}`
        );
      }else{
        logger.info(
          `Found pools positions for ${req.address}.`
        );
      }


      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        //CosmosExtendedPool[];
        ...response
      };
    }


    static async estimateGas(
      osmosis: Osmosis,
    ): Promise<EstimateGasResponse> {
      
      const gasPrice = Number(osmosis.getLatestBasePrice());  // GAS PRICE PER UNIT OF WORK  
      const gasLimitTransaction = osmosis.gasLimitEstimate; // MAX uOSMO COST PER TRANSACTION 

      return {
        network: osmosis.chainName,
        timestamp: Date.now(),
        gasPrice: gasPrice,
        gasPriceToken: osmosis.manualGasPriceToken,
        gasLimit: Number(gasLimitTransaction),
        gasCost: gasPrice.toString(),
      };
      
    }

    static async getTokens(
      osmosis: Osmosis,
      req: TokensRequest
    ): Promise<TokensResponse> {
      return await osmosis.getTokens(req);
    }

    static async transfer(
      osmosis: Osmosis,
      req: TransferRequest
    ): Promise<TransferResponse> {

      const { wallet } =
        await getOsmoWallet(
          osmosis,
          req.from,
        );

      const token: TokenishCosmosAsset = osmosis.getTokenBySymbol(req.token)!;
    
      const tx = await osmosis.transfer(wallet, token, req);


      const txMessage = 'Transfer success. To: ' + req.to + ' From: ' + req.from + ' '
      this.validateTxErrors(tx, txMessage);
      if (tx.code == successfulTransaction){
        return 'Transfer success. To: ' + req.to + ' From: ' + req.from + ' Hash: ' + tx.transactionHash + ' gasUsed: ' + tx.gasUsed + ' gasWanted: ' + tx.gasWanted
      }
      else{
        throw new HttpException(
          500,
          UNKNOWN_ERROR_MESSAGE + ' ' + tx.rawLog,
          UNKNOWN_ERROR_ERROR_CODE
        );
      }
    }

    static async balances(osmosis: Osmosis, req: CosmosBalanceRequest) {
      const startTimestamp: number = Date.now();
      validateCosmosBalanceRequest(req);

      const wallet = await osmosis.getWallet(req.address, 'osmo');

      var tokenSymbols: string[] = [];
      // FILTER IF req.tokenSymbols != []
      if (req && req.tokenSymbols && req.tokenSymbols.length > 0){
        tokenSymbols = req.tokenSymbols;
      } else{
        const tokenAssets = osmosis.storedTokenList;
        tokenAssets.forEach((token: CosmosAsset) => {
          tokenSymbols.push(token.symbol);
        });
      }

      const balances = await osmosis.getBalances(wallet);
      const filteredBalances = toCosmosBalances(balances, tokenSymbols);

      return {
        network: osmosis.chainName,
        timestamp: startTimestamp,
        latency: latency(startTimestamp, Date.now()),
        balances: filteredBalances,
      };
    }

    static async poll(osmosis: Osmosis, req: CosmosPollRequest) {
      if (req.txHash){
        const transaction = await osmosis.getTransaction(req.txHash);
        const currentBlock = await osmosis.getCurrentBlockNumber();

        //@ts-ignore cosmojs models again
        var pool_id = undefined;
        var position_id = undefined;
        //@ts-ignore cosmojs models again
        if (transaction.txResponse.logs){
        //@ts-ignore cosmojs models again
          transaction.txResponse.logs.forEach((log) => {
        //@ts-ignore cosmojs models again
            const create_position_event = log.events.find(({ type }) => type === 'create_position');
            if (create_position_event){
        //@ts-ignore cosmojs models again
              const pool_id_attribute = create_position_event.attributes.find(({ key }) => key === 'pool_id');
              if (pool_id_attribute){
                pool_id = pool_id_attribute.value
              }
        //@ts-ignore cosmojs models again
              const position_id_attribute = create_position_event.attributes.find(({ key }) => key === 'position_id');
              if (position_id_attribute){
                position_id = position_id_attribute.value
              }
            }
          })
        }
        var tokenId = position_id ? position_id!=undefined : pool_id;

        var txStatus = unconfirmedTransaction;
        //@ts-ignore cosmojs models again
        if (transaction.txResponse.code == successfulTransaction){
          txStatus = 1; // clientside this is a successful tx
        }
        //@ts-ignore cosmojs models again
        else if (transaction.txResponse.code != unconfirmedTransaction){
        //@ts-ignore cosmojs models again
          txStatus = transaction.txResponse.code; // any other failure
        }
        return {
          txStatus: txStatus,
          txReceipt: null,
          tokenId: Number(tokenId ? tokenId != undefined : -1),
          txHash: req.txHash,
          currentBlock,
        //@ts-ignore cosmojs models again
          txBlock: Number(transaction.txResponse.height.toString()),
        //@ts-ignore cosmojs models again
          gasUsed: Number(transaction.txResponse.gasUsed.toString()),
        //@ts-ignore cosmojs models again
          gasWanted: Number(transaction.txResponse.gasWanted.toString()),
          txData: decodeTxRaw(transaction.tx),
        };
      
      }
      return {
        txHash: '',
        txStatus: 0,
        txBlock: 0,
        gasUsed: 0,
        gasWanted: 0,
        txData: '',
      };
    }

    // these below shouldn't actually be called
    static async allowances(
      osmosis: Osmosis,
      req: AllowancesRequest
    ){
      if (osmosis || req){}
      // Not applicable.
      var allowances: Record<string, string> = {}
      req.tokenSymbols.forEach((sym)=>{
        allowances[sym] = "1000000000000000000000000000000000000000000000"
      })
      return {
        spender: undefined as unknown as string,
        approvals: allowances,
      };
    }

    static async approve(
      osmosis: Osmosis,
      req: ApproveRequest
    ){
      if (osmosis || req){}
      // Not applicable.
      return {
        tokenAddress: undefined as unknown as string,
        spender: undefined as unknown as string,
        amount: undefined as unknown as string,
        nonce: undefined as unknown as number,
        approval: undefined as unknown as CustomTransaction,
      };
    }

    static async cancel(
      osmosis: Osmosis,
      req: CancelRequest
    ){
      if (osmosis || req){}
      // Not applicable.
      return {
        txHash: undefined as unknown as string,
      };
    }

    static async nonce(
      osmosis: Osmosis,
      req: NonceRequest
    ): Promise<NonceResponse> {
      if (osmosis || req){}
      // Not applicable.
      const nonce = 0;
      return { nonce };
    }
  
    static async nextNonce(
      osmosis: Osmosis,
      req: NonceRequest
    ): Promise<NonceResponse> {
      if (osmosis || req){}
      // Not applicable.
      const nonce = 0;
      return { nonce };
    }

    static validateTxErrors(tx: AnyTransactionResponse, msg: string){
      if (tx.code != successfulTransaction){
        if (tx.code == outOfGas){
        logger.error(
          `Failed to execute trade: Out of gas. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed} greater than gasWanted ${tx.gasWanted} . Log: ${tx.rawLog}`
        )
        throw new HttpException(
          500,
          OUT_OF_GAS_ERROR_MESSAGE + " : " + tx.rawLog,
          OUT_OF_GAS_ERROR_CODE
        );
      } else if (tx.code == lessThanMinAmountSlippage){
        logger.error(
          `Failed to execute trade. Token created less than minimum amount; increase slippage. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`
        )
        throw new HttpException(
          500,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE + " : " + tx.rawLog,
          AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE
        );
        }
        else if (tx.code == insufficientFunds){
          logger.error(
            `Failed to execute trade. Insufficient funds. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`
          )
          throw new HttpException(
            500,
            INSUFFICIENT_FUNDS_ERROR_MESSAGE + " : " + tx.rawLog,
            INSUFFICIENT_FUNDS_ERROR_CODE
          );

        } else {
          logger.error(
            `Failed to execute trade. txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}. Log: ${tx.rawLog}`
          )

          throw new HttpException(
            500,
            TRADE_FAILED_ERROR_MESSAGE + " : " + tx.rawLog,
            TRADE_FAILED_ERROR_CODE
          );
        }
      }
      logger.info(
        msg + `txHash is ${tx.transactionHash}, gasUsed is ${tx.gasUsed}.`
      );
    }
}