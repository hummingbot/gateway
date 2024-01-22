import ws from 'ws';
import { BigNumber } from 'bignumber.js';
import { ParamsWithKind, TezosToolkit } from '@taquito/taquito';
import { getTokens, toAtomic, toReal } from './shared/helpers';
import { QSNetwork, SupportedNetwork } from './shared/types';
import { STABLESWAP_REFERRAL, networkInfo } from './config/config';
import { QUIPUSWAP_REFERRAL_CODE } from './config/constants';
import { SwapPair } from './shared/types';
import { getWhitelistedPairs } from './api';
import { getRoutePairsCombinations } from './swap.router.sdk.adapters';
import { Trade, getBestTradeExactInput, getBestTradeExactOutput, getTradeInputAmount, getTradeOpParams, getTradeOutputAmount, parseTransferParamsToParamsWithKind } from 'swap-router-sdk';
import { ResponseInterface } from 'swap-router-sdk/dist/interface/response.interface';
import { RoutePair } from 'swap-router-sdk/dist/interface/route-pair.interface';
import { WhitelistedPair } from 'swap-router-sdk/dist/interface/whitelisted-pair.interface';
import { calculateTradeExactInput, calculateTradeExactOutput } from './trade';


export class QuipuBase {
  private readonly _network: QSNetwork;
  private _api: ws.WebSocket;
  private _routePairs: RoutePair[] = [];
  private _whitelistedPairs: WhitelistedPair[] = [];
  private _ready: boolean = false;
  private initialized: Promise<boolean> = Promise.resolve(false);


  constructor(apiUrl: string, network: SupportedNetwork) {
    this._network = networkInfo(network);
    this._api = new ws(apiUrl);

    this.initialized = new Promise((resolve, reject) => {
      this._api.onmessage = (event: ws.MessageEvent) => {
        this.parseMessage(event.data.toString());
        this._ready = true;
        if (this._routePairs.length > 0)
          resolve(true);
      };
      this._api.onerror = (error: ws.ErrorEvent) => {
        this._ready = false;
        reject(error);
      };
      this._api.onclose = () => {
        this._ready = false;
        resolve(false);
      }
    });
  }


  public ready = (): boolean => {
    return this._ready;
  }


  public init = async () => {
    return await this.initialized;
  };


  public getTokenFromSymbol = (symbol: string) => {
    const tokens = getTokens(this._network);
    const token = tokens.find(token => token.metadata.symbol === symbol);
    if (!token) {
      throw new Error(`Token: ${symbol} not found`);
    }
    return token;
  }


  private parseMessage = (message: string) => {
    const rawResponse: ResponseInterface = JSON.parse(message);
    const { routePairs, whitelistedPairs } = getWhitelistedPairs(rawResponse, this._network.id);
    this._routePairs = routePairs;
    this._whitelistedPairs = whitelistedPairs;
  };


  private getOutputTrade = (
    inputAmount: BigNumber,
    swapPair: SwapPair
  ) => {
    const routePairsCombinations = getRoutePairsCombinations(swapPair, this._routePairs, this._whitelistedPairs);
    const atomic = toAtomic(inputAmount, swapPair.inputToken);
    const bestTradeExact = getBestTradeExactInput(atomic, routePairsCombinations);
    const atomicOutputAmount = getTradeOutputAmount(bestTradeExact);
    return {
      outputAmount: toReal(atomicOutputAmount ?? BigNumber(0), swapPair.outputToken),
      trade: bestTradeExact,
    };
  };


  private getInputTrade = (
    outputAmount: BigNumber,
    swapPair: SwapPair
  ) => {
    const routePairsCombinations = getRoutePairsCombinations(swapPair, this._routePairs, this._whitelistedPairs);
    const atomic = toAtomic(outputAmount, swapPair.outputToken);
    const bestTradeExact = getBestTradeExactOutput(atomic, routePairsCombinations);
    const atomicInputAmount = getTradeInputAmount(bestTradeExact);
    return {
      inputAmount: toReal(atomicInputAmount ?? BigNumber(0), swapPair.inputToken),
      trade: bestTradeExact
    };
  };


  protected getSellingInfo = (inputTokenSymbol: string, outputTokenSymbol: string, inputAmount: BigNumber, slippageTolerance: BigNumber) => {
    const inputToken = this.getTokenFromSymbol(inputTokenSymbol);
    const outputToken = this.getTokenFromSymbol(outputTokenSymbol);

    const swapPair: SwapPair = { inputToken, outputToken };
    const { outputAmount, trade } = this.getOutputTrade(inputAmount, swapPair);

    if (!trade) {
      throw new Error('No trade found');
    }

    const bestTradeWithSlippageTolerance = calculateTradeExactInput(
      toAtomic(inputAmount, inputToken),
      trade,
      slippageTolerance.toNumber()
    );

    const lastBestTrade = bestTradeWithSlippageTolerance[bestTradeWithSlippageTolerance.length - 1];
    const outputTokenDecimalPower = BigNumber(10).pow(outputToken.metadata.decimals);
    const outputAmountWithSlippage = BigNumber(lastBestTrade.bTokenAmount).div(outputTokenDecimalPower);

    return {
      trade: bestTradeWithSlippageTolerance,
      inputToken: inputToken,
      inputAmount: inputAmount,
      outputToken: outputToken,
      outputAmount: outputAmountWithSlippage,
      price: outputAmount.div(inputAmount),
    };
  };


  protected getBuyingInfo = (outputTokenSymbol: string, inputTokenSymbol: string, outputAmount: BigNumber) => {
    const inputToken = this.getTokenFromSymbol(inputTokenSymbol);
    const outputToken = this.getTokenFromSymbol(outputTokenSymbol);

    const swapPair: SwapPair = { inputToken, outputToken };
    const { inputAmount, trade } = this.getInputTrade(outputAmount, swapPair);

    if (!trade) {
      throw new Error('No trade found');
    }

    const bestTradeWithSlippageTolerance = calculateTradeExactOutput(
      toAtomic(outputAmount, outputToken),
      trade
    );

    const firstBestTrade = bestTradeWithSlippageTolerance[0];
    const inputTokenDecimalPower = BigNumber(10).pow(inputToken.metadata.decimals);
    const inputAmountWithSlippage = BigNumber(firstBestTrade.aTokenAmount).div(inputTokenDecimalPower);

    return {
      trade: bestTradeWithSlippageTolerance,
      inputToken: inputToken,
      inputAmount: inputAmountWithSlippage,
      outputToken: outputToken,
      outputAmount: outputAmount,
      price: inputAmount.div(outputAmount),
    };
  };


  public getSwapParams = async (
    tezos: TezosToolkit,
    trade: Trade
  ) => {
    const accountPkh = await tezos.signer.publicKeyHash();

    type TTK = Parameters<typeof getTradeOpParams>[2];
    const tradeTransferParams = await getTradeOpParams(
      trade,
      accountPkh,
      tezos as unknown as TTK,
      STABLESWAP_REFERRAL,
      accountPkh,
      QUIPUSWAP_REFERRAL_CODE.toNumber()
    );

    const walletParamsWithKind = tradeTransferParams.map(tradeTransferParam =>
      parseTransferParamsToParamsWithKind(tradeTransferParam) as ParamsWithKind
    );

    return walletParamsWithKind;
  };


  public close = () => {
    this._api.close();
  };
}