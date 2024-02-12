import {
    BigNumber,
    ContractTransaction,
    Transaction,
    Wallet,
    ContractInterface,
  } from 'ethers';
  import { percentRegexp } from '../../services/config-manager-v2';
  import {
    InitializationError,
    SERVICE_UNITIALIZED_ERROR_CODE,
    SERVICE_UNITIALIZED_ERROR_MESSAGE,
    UniswapishPriceError,
  } from '../../services/error-handler';
  import { logger } from '../../services/logger';
  import { isFractionString } from '../../services/validators';
  import { BalancerConfig } from './balancer.config';
  import { getAddress } from 'ethers/lib/utils';
  import { Polygon } from '../../chains/polygon/polygon';
  import { Ethereum } from '../../chains/ethereum/ethereum';
  import { EVMTxBroadcaster } from '../../chains/ethereum/evm.broadcaster';
  import { Fraction, Token } from '@uniswap/sdk';
  import { BalancerSDK, SwapInfo, SwapType } from '@balancer-labs/sdk'
  import { Uniswapish, UniswapishTrade } from '../../services/common-interfaces';
  import { Avalanche } from '../../chains/avalanche/avalanche';
import { Currency, CurrencyAmount } from '@uniswap/sdk-core';
import * as math from 'mathjs';
  
export interface BalancerSwap {
    swapInfo: SwapInfo;
    maxSlippage: number;
    deadline: string;
    kind: SwapType;
}
export interface BalancerTrade {
    swap : BalancerSwap;
    executionPrice: Fraction;
}

  export class Balancer implements Uniswapish {
    private static _instances: { [name: string]: Balancer };
    private _chain: Ethereum | Polygon | Avalanche;
    private _config: typeof BalancerConfig.config;
    private tokenList: Record<string, Token> = {};
    private _ready: boolean = false;
    public gasLimitEstimate: any;
    public router: any;
    public balancer: BalancerSDK;
    public routerAbi: any[];
    public ttl: any;
  
    private constructor(chain: string, network: string) {
      this._config = BalancerConfig.config;
      if (chain === 'ethereum') {
        this._chain = Ethereum.getInstance(network);
      } else if (chain === 'avalanche') {
        this._chain = Avalanche.getInstance(network);
      } else if (chain === 'polygon') {
        this._chain = Polygon.getInstance(network);
      } else throw Error('Chain not supported.');
      this.balancer = new BalancerSDK({
        network: this._chain.chainId,
        rpcUrl: this._chain.rpcUrl
      });
      this.routerAbi = [];
      this.ttl = this._config.ttl;
      this.gasLimitEstimate = this._config.gasLimitEstimate;
    }
  
    public static getInstance(chain: string, network: string): Balancer {
      if (Balancer._instances === undefined) {
        Balancer._instances = {};
      }
      if (!(chain + network in Balancer._instances)) {
        Balancer._instances[chain + network] = new Balancer(chain, network);
      }
  
      return Balancer._instances[chain + network];
    }
  
    public async init() {
      if (!this._chain.ready())
        throw new InitializationError(
          SERVICE_UNITIALIZED_ERROR_MESSAGE(this._chain.chainName),
          SERVICE_UNITIALIZED_ERROR_CODE
        );
      for (const token of this._chain.storedTokenList) {
        this.tokenList[token.address] = new Token(
          this._chain.chainId,
          token.address,
          token.decimals,
          token.symbol,
          token.name
        );
      }
      this._ready = true;
    }
  
    /*
     * Given a token's address, return the connector's native representation of
     * the token.
     *
     * @param address Token address
     */
    public getTokenByAddress(address: string): Token {
      return this.tokenList[getAddress(address)];
    }
  
    /**
     * Determines if the connector is ready.
     */
    public ready(): boolean {
      return this._ready;
    }
  
    /**
     * Gets the allowed slippage percent from the optional parameter or the value
     * in the configuration.
     *
     * @param allowedSlippageStr (Optional) should be of the form '1/10'.
     */
    public getAllowedSlippage(allowedSlippageStr?: string): number {
      if (allowedSlippageStr != null && isFractionString(allowedSlippageStr)) {
        const fractionSplit = allowedSlippageStr.split('/');
        return Number((Number(fractionSplit[0]) / Number(fractionSplit[1]) * 100).toFixed(0));
      }
  
      const allowedSlippage = this._config.allowedSlippage;
      const matches = allowedSlippage.match(percentRegexp);
      if (matches) return Number((Number(matches[1]) / Number(matches[2]) * 100).toFixed(0));
      throw new Error(
        'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.'
      );
    }
  
    /**
     * Given the amount of `baseToken` desired to acquire from a transaction,
     * calculate the amount of `quoteToken` needed for the transaction.
     *
     * This is typically used for calculating token buy prices.
     *
     * @param quoteToken Token input for the transaction
     * @param baseToken Token output from the transaction
     * @param amount Amount of `baseToken` desired from the transaction
     * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
     */
    async estimateBuyTrade(
      quoteToken: Token,
      baseToken: Token,
      amount: BigNumber,
      allowedSlippage?: string
    ) {
        logger.info(
            `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
          );
    
          await this.balancer.swaps.fetchPools();
    
          const info = await this.balancer.swaps.findRouteGivenOut(
            {
                tokenIn: quoteToken.address,
                tokenOut: baseToken.address,
                amount: amount,
                gasPrice: BigNumber.from(this._chain.gasPrice.toFixed(0)),
            }
          );
          if (info.swaps.length === 0) {
            throw new UniswapishPriceError(
              `No pool found for ${quoteToken.address} to ${baseToken.address}.`
            );
          }
          const marketSp = math.fraction(info.marketSp) as math.Fraction;
          const executionPrice = new Fraction(marketSp.n.toString(), marketSp.d.toString())
          console.log(this.getAllowedSlippage(allowedSlippage));
          return {
            trade: {
                swap: {
                    swapInfo: info,
                    maxSlippage: this.getAllowedSlippage(allowedSlippage),
                    deadline: '0',  // updated before trade execution
                    kind: SwapType.SwapExactOut,
                },
                executionPrice
            },
            expectedAmount: CurrencyAmount.fromRawAmount(<Currency>quoteToken, info.returnAmount.toString()),
          };
    }
  
    /**
     * Given the amount of `baseToken` to put into a transaction, calculate the
     * amount of `quoteToken` that can be expected from the transaction.
     *
     * This is typically used for calculating token sell prices.
     *
     * @param baseToken Token input for the transaction
     * @param quoteToken Output from the transaction
     * @param amount Amount of `baseToken` to put into the transaction
     * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
     */
    async estimateSellTrade(
      baseToken: Token,
      quoteToken: Token,
      amount: BigNumber,
      allowedSlippage?: string
    ) {
      logger.info(
        `Fetching pair data for ${quoteToken.address}-${baseToken.address}.`
      );

      await this.balancer.swaps.fetchPools();

      const info = await this.balancer.swaps.findRouteGivenIn(
        {
            tokenIn: baseToken.address,
            tokenOut: quoteToken.address,
            amount: amount,
            gasPrice: BigNumber.from(this._chain.gasPrice.toFixed(0)),
        }
      );
      if (info.swaps.length === 0) {
        throw new UniswapishPriceError(
          `No pool found for ${quoteToken.address} to ${baseToken.address}.`
        );
      }
      const marketSp = math.fraction(info.marketSp) as math.Fraction;
      const executionPrice = new Fraction(marketSp.n.toString(), marketSp.d.toString());
      return {
        trade: {
            swap: {
                swapInfo: info,
                maxSlippage: this.getAllowedSlippage(allowedSlippage),
                deadline: '0',  // updated before trade execution
                kind: SwapType.SwapExactIn,
            },
            executionPrice
        },
        expectedAmount: CurrencyAmount.fromRawAmount(<Currency>quoteToken, info.returnAmount.toString()),
      };
    }
  
    /**
     * Given a wallet and a Uniswap trade, try to execute it on blockchain.
     *
     * @param wallet Wallet
     * @param trade Expected trade
     * @param gasPrice Base gas price, for pre-EIP1559 transactions
     * @param _router Router smart contract address
     * @param _ttl How long the swap is valid before expiry, in seconds
     * @param _abi Router contract ABI
     * @param gasLimit Gas limit
     * @param nonce (Optional) EVM transaction nonce
     * @param maxFeePerGas (Optional) Maximum total fee per gas you want to pay
     * @param maxPriorityFeePerGas (Optional) Maximum tip per gas you want to pay
     * @param allowedSlippage (Optional) Fraction in string representing the allowed slippage for this transaction
     */
    async executeTrade(
      wallet: Wallet,
      trade: UniswapishTrade,
      _gasPrice: number,
      _uniswapRouter: string,
      ttl: number,
      _abi: ContractInterface,
      gasLimit: number,
      nonce?: number,
      maxFeePerGas?: BigNumber,
      maxPriorityFeePerGas?: BigNumber
    ): Promise<Transaction> {
      let overrideParams: {
        gasLimit: string | number;
        value: number;
        nonce: number | undefined;
        maxFeePerGas?: BigNumber | undefined;
        maxPriorityFeePerGas?: BigNumber | undefined;
        gasPrice?: string;
      };
      if (maxFeePerGas || maxPriorityFeePerGas) {
        overrideParams = {
          gasLimit: gasLimit,
          value: 0,
          nonce: nonce,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };
      } else {
        overrideParams = {
          // gasPrice: (gasPrice * 1e9).toFixed(0),
          gasLimit: gasLimit.toFixed(0),
          value: 0,
          nonce: nonce,
        };
      }
      console.log(overrideParams);
      const t: BalancerTrade = <BalancerTrade>trade;
      const txDataRaw = this.balancer.swaps.buildSwap({
        ...t.swap,
        ...{userAddress: wallet.address,
        deadline: Math.floor(Date.now() / 1000 + ttl).toString()}
    })
    const txData = {
      to: txDataRaw.to,
      data: txDataRaw.data,
      value: txDataRaw.value
    }

      const txResponse: ContractTransaction = await EVMTxBroadcaster.getInstance(
        this._chain,
        wallet.address
      ).broadcast({...txData, ...overrideParams});
  
      logger.info(`Transaction Details: ${JSON.stringify(txResponse.hash)}`);
      return txResponse;
    }
  }
  