import { CurrencyAmount, Token } from '@pancakeswap/sdk';
import { Pair as V2Pair } from '@pancakeswap/v2-sdk';
import { Contract, constants } from 'ethers';
import { Address } from 'viem';

import { Ethereum, TokenInfo } from '../../chains/ethereum/ethereum';
import { logger } from '../../services/logger';

import { HyperswapConfig } from './hyperswap.config';
import {
  IHyperswapV2FactoryABI,
  IHyperswapV2PairABI,
  IHyperswapV2Router02ABI,
  getHyperswapV2FactoryAddress,
  getHyperswapV2RouterAddress,
} from './hyperswap.contracts';

export class Hyperswap {
  private static _instances: { [name: string]: Hyperswap };

  private ethereum: Ethereum;
  public config: HyperswapConfig.RootConfig;
  private _ready: boolean = false;
  private v2Factory: Contract;
  private v2Router: Contract;
  private networkName: string;

  private constructor(network: string) {
    this.networkName = network;
    this.config = HyperswapConfig.config;
  }

  public static async getInstance(network: string): Promise<Hyperswap> {
    if (Hyperswap._instances === undefined) {
      Hyperswap._instances = {};
    }

    if (!(network in Hyperswap._instances)) {
      Hyperswap._instances[network] = new Hyperswap(network);
      await Hyperswap._instances[network].init();
    }

    return Hyperswap._instances[network];
  }

  public async init() {
    try {
      this.ethereum = await Ethereum.getInstance(this.networkName);

      this.v2Factory = new Contract(
        getHyperswapV2FactoryAddress(this.networkName),
        IHyperswapV2FactoryABI.abi,
        this.ethereum.provider,
      );

      this.v2Router = new Contract(
        getHyperswapV2RouterAddress(this.networkName),
        IHyperswapV2Router02ABI.abi,
        this.ethereum.provider,
      );

      if (!this.ethereum.ready()) {
        await this.ethereum.init();
      }

      this._ready = true;
      logger.info(`Hyperswap AMM connector initialized for network: ${this.networkName}`);
    } catch (error) {
      logger.error(`Error initializing Hyperswap: ${error.message}`);
      throw error;
    }
  }

  public ready(): boolean {
    return this._ready;
  }

  public async getToken(symbolOrAddress: string): Promise<Token | null> {
    const tokenInfo = await this.ethereum.getToken(symbolOrAddress);
    return tokenInfo ? this.getHyperswapToken(tokenInfo) : null;
  }

  public getHyperswapToken(tokenInfo: TokenInfo): Token {
    return new Token(
      this.ethereum.chainId,
      tokenInfo.address as Address,
      tokenInfo.decimals,
      tokenInfo.symbol,
      tokenInfo.name,
    );
  }

  public async getV2Pool(tokenA: Token, tokenB: Token, poolAddress?: string): Promise<V2Pair | null> {
    try {
      const pairAddress = poolAddress || (await this.v2Factory.getPair(tokenA.address, tokenB.address));
      if (!pairAddress || pairAddress === constants.AddressZero) {
        return null;
      }

      const pairContract = new Contract(pairAddress, IHyperswapV2PairABI.abi, this.ethereum.provider);
      const reserves = await pairContract.getReserves();
      const token0Address = await pairContract.token0();

      const [reserve0, reserve1] = reserves;
      const [token0, token1] =
        tokenA.address.toLowerCase() === token0Address.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

      return new V2Pair(
        TokenAmountFromRaw(token0, reserve0.toString()),
        TokenAmountFromRaw(token1, reserve1.toString()),
      );
    } catch (error) {
      logger.error(`Error getting Hyperswap V2 pool: ${error.message}`);
      return null;
    }
  }

  public async findDefaultPool(
    baseToken: string,
    quoteToken: string,
    poolType: 'amm' | 'clmm',
  ): Promise<string | null> {
    if (poolType !== 'amm') {
      return null;
    }

    const baseTokenObj = await this.getToken(baseToken);
    const quoteTokenObj = await this.getToken(quoteToken);
    if (!baseTokenObj || !quoteTokenObj) {
      return null;
    }

    const pairAddress = await this.v2Factory.getPair(baseTokenObj.address, quoteTokenObj.address);
    return pairAddress && pairAddress !== constants.AddressZero ? pairAddress : null;
  }

  public getRouter(): Contract {
    return this.v2Router;
  }

  public async getFirstWalletAddress(): Promise<string | null> {
    try {
      return await Ethereum.getFirstWalletAddress();
    } catch (error) {
      logger.error(`Error getting first wallet address: ${error.message}`);
      return null;
    }
  }
}

function TokenAmountFromRaw(token: Token, rawAmount: string) {
  return CurrencyAmount.fromRawAmount(token, rawAmount);
}
