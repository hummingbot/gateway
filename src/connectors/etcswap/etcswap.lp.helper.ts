import {
  InitializationError,
  SERVICE_UNITIALIZED_ERROR_CODE,
  SERVICE_UNITIALIZED_ERROR_MESSAGE,
} from '../../services/error-handler';
import { Contract, ContractInterface } from '@ethersproject/contracts';
import { Token, CurrencyAmount, Percent, Price } from '@uniswap/sdk-core';
import * as v3 from '@uniswap/v3-sdk';
import { providers, Wallet, Signer, utils } from 'ethers';
import { percentRegexp } from '../../services/config-manager-v2';
import {
  PoolState,
  RawPosition,
  AddPosReturn,
} from '../uniswap/uniswap.lp.interfaces';
import * as math from 'mathjs';
import { getAddress } from 'ethers/lib/utils';
import { ETCSwapConfig } from './etcswap.config';
import { EthereumClassicChain } from '../../chains/ethereum-classic/ethereum-classic';

export const FACTORY = "0x2624E907BcC04f93C8f29d7C7149a8700Ceb8cDC";
export const POOL_INIT = "0x7ea2da342810af3c5a9b47258f990aaac829fe1385a1398feb77d0126a85dbef";

export class ETCSwapLPHelper {
  protected chain: EthereumClassicChain;
  protected chainId;
  private _router: string;
  private _nftManager: string;
  private _ttl: number;
  private _routerAbi: ContractInterface;
  private _nftAbi: ContractInterface;
  private _poolAbi: ContractInterface;
  private tokenList: Record<string, Token> = {};
  private _ready: boolean = false;
  public abiDecoder: any;

  constructor(chain: string, network: string) {
    this.chain = EthereumClassicChain.getInstance(network);
    this.chainId = this.getChainId(chain, network);
    this._router =
      ETCSwapConfig.config.etcswapV3SmartOrderRouterAddress(network);
    this._nftManager =
      ETCSwapConfig.config.etcswapV3NftManagerAddress(network);
    this._ttl = ETCSwapConfig.config.ttl;
    this._routerAbi =
      require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json').abi;
    this._nftAbi =
      require('@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json').abi;
    this._poolAbi =
      require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json').abi;
    this.abiDecoder = require('abi-decoder');
    this.abiDecoder.addABI(this._nftAbi);
    this.abiDecoder.addABI(this._routerAbi);
  }

  public ready(): boolean {
    return this._ready;
  }

  public get router(): string {
    return this._router;
  }

  public get nftManager(): string {
    return this._nftManager;
  }

  public get ttl(): number {
    return parseInt(String(Date.now() / 1000)) + this._ttl;
  }

  public get routerAbi(): ContractInterface {
    return this._routerAbi;
  }

  public get nftAbi(): ContractInterface {
    return this._nftAbi;
  }

  public get poolAbi(): ContractInterface {
    return this._poolAbi;
  }

  /**
   * Given a token's address, return the connector's native representation of
   * the token.
   *
   * @param address Token address
   */
  public getTokenByAddress(address: string): Token {
    return this.tokenList[getAddress(address)];
  }

  public async init() {
    const chainName = this.chain.toString();
    if (!this.chain.ready())
      throw new InitializationError(
        SERVICE_UNITIALIZED_ERROR_MESSAGE(chainName),
        SERVICE_UNITIALIZED_ERROR_CODE,
      );
    for (const token of this.chain.storedTokenList) {
      this.tokenList[token.address] = new Token(
        this.chainId,
        token.address,
        token.decimals,
        token.symbol,
        token.name,
      );
    }
    this._ready = true;
  }

  public getChainId(_chain: string, network: string): number {
    return EthereumClassicChain.getInstance(network).chainId;
  }

  getPercentage(rawPercent: number | string): Percent {
    const slippage = math.fraction(rawPercent) as math.Fraction;
    return new Percent(slippage.n, slippage.d * 100);
  }

  getSlippagePercentage(): Percent {
    const allowedSlippage = ETCSwapConfig.config.allowedSlippage;
    const nd = allowedSlippage.match(percentRegexp);
    if (nd) return new Percent(nd[1], nd[2]);
    throw new Error(
      'Encountered a malformed percent string in the config for ALLOWED_SLIPPAGE.',
    );
  }

  getContract(
    contract: string,
    signer: providers.StaticJsonRpcProvider | Signer,
  ): Contract {
    if (contract === 'router') {
      return new Contract(this.router, this.routerAbi, signer);
    } else {
      return new Contract(this.nftManager, this.nftAbi, signer);
    }
  }

  getPoolContract(
    pool: string,
    wallet: providers.StaticJsonRpcProvider | Signer,
  ): Contract {
    return new Contract(pool, this.poolAbi, wallet);
  }

  async getPoolState(
    poolAddress: string,
    fee: v3.FeeAmount,
  ): Promise<PoolState> {
    const poolContract = this.getPoolContract(poolAddress, this.chain.provider);
    const minTick = v3.nearestUsableTick(
      v3.TickMath.MIN_TICK,
      v3.TICK_SPACINGS[fee],
    );
    const maxTick = v3.nearestUsableTick(
      v3.TickMath.MAX_TICK,
      v3.TICK_SPACINGS[fee],
    );
    const poolDataReq = await Promise.allSettled([
      poolContract.liquidity(),
      poolContract.slot0(),
      poolContract.ticks(minTick),
      poolContract.ticks(maxTick),
    ]);

    const rejected = poolDataReq.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    if (rejected.length > 0) throw new Error('Unable to fetch pool state');

    const poolData = (
      poolDataReq.filter(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<any>[]
    ).map((r) => r.value);

    return {
      liquidity: poolData[0],
      sqrtPriceX96: poolData[1][0],
      tick: poolData[1][1],
      observationIndex: poolData[1][2],
      observationCardinality: poolData[1][3],
      observationCardinalityNext: poolData[1][4],
      feeProtocol: poolData[1][5],
      unlocked: poolData[1][6],
      fee: fee,
      tickProvider: [
        {
          index: minTick,
          liquidityNet: poolData[2][1],
          liquidityGross: poolData[2][0],
        },
        {
          index: maxTick,
          liquidityNet: poolData[3][1],
          liquidityGross: poolData[3][0],
        },
      ],
    };
  }

  async poolPrice(
    token0: Token,
    token1: Token,
    tier: string,
    period: number = 1,
    interval: number = 1,
  ): Promise<string[]> {
    const fetchPriceTime = [];
    const prices = [];
    const fee = v3.FeeAmount[tier as keyof typeof v3.FeeAmount];
    const poolContract = new Contract(
      v3.Pool.getAddress(token0, token1, fee, POOL_INIT, FACTORY),
      this.poolAbi,
      this.chain.provider,
    );
    for (
      let x = Math.ceil(period / interval) * interval;
      x >= 0;
      x -= interval
    ) {
      fetchPriceTime.push(x);
    }
    try {
      const response = await poolContract.observe(fetchPriceTime);
      for (let twap = 0; twap < response.tickCumulatives.length - 1; twap++) {
        prices.push(
          v3
            .tickToPrice(
              token0,
              token1,
              Math.ceil(
                response.tickCumulatives[twap + 1].sub(
                  response.tickCumulatives[twap].toNumber(),
                ) / interval,
              ),
            )
            .toFixed(8),
        );
      }
    } catch (e) {
      return ['0'];
    }
    return prices;
  }

  async getRawPosition(wallet: Wallet, tokenId: number): Promise<RawPosition> {
    const contract = this.getContract('nft', wallet);
    const requests = [contract.positions(tokenId)];
    const positionInfoReq = await Promise.allSettled(requests);
    const rejected = positionInfoReq.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];
    if (rejected.length > 0) throw new Error('Unable to fetch position');
    const positionInfo = (
      positionInfoReq.filter(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<any>[]
    ).map((r) => r.value);
    return positionInfo[0];
  }

  getReduceLiquidityData(
    percent: number,
    tokenId: number,
    token0: Token,
    token1: Token,
    wallet: Wallet,
  ): v3.RemoveLiquidityOptions {
    //   }; //     recipient: string; //     expectedCurrencyOwed1: CurrencyAmount<Token>; //     expectedCurrencyOwed0: CurrencyAmount<Token>; //   collectOptions: { //   burnToken: boolean; //   deadline: number; //   slippageTolerance: Percent; //   liquidityPercentage: Percent; //   tokenId: number; // {
    return {
      tokenId: tokenId,
      liquidityPercentage: this.getPercentage(percent),
      slippageTolerance: this.getSlippagePercentage(),
      deadline: this.ttl,
      burnToken: false,
      collectOptions: {
        expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, '0'),
        expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, '0'),
        recipient: <`0x${string}`>wallet.address,
      },
    };
  }

  async addPositionHelper(
    wallet: Wallet,
    token0: Token,
    token1: Token,
    amount0: string,
    amount1: string,
    fee: v3.FeeAmount,
    lowerPrice: number,
    upperPrice: number,
    tokenId: number = 0,
  ): Promise<AddPosReturn> {
    if (token1.sortsBefore(token0)) {
      [token0, token1] = [token1, token0];
      [amount0, amount1] = [amount1, amount0];
      [lowerPrice, upperPrice] = [1 / upperPrice, 1 / lowerPrice];
    }
    const lowerPriceInFraction = math.fraction(lowerPrice) as math.Fraction;
    const upperPriceInFraction = math.fraction(upperPrice) as math.Fraction;
    const poolData = await this.getPoolState(
      v3.Pool.getAddress(token0, token1, fee, POOL_INIT, FACTORY),
      fee,
    );
    const pool = new v3.Pool(
      token0,
      token1,
      poolData.fee,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick,
    );

    const addLiquidityOptions = {
      recipient: wallet.address,
      tokenId: tokenId ? tokenId : 0,
    };

    const swapOptions = {
      recipient: wallet.address,
      slippageTolerance: this.getSlippagePercentage(),
      deadline: this.ttl,
    };

    const tickLower = v3.nearestUsableTick(
      v3.priceToClosestTick(
        new Price(
          token0,
          token1,
          utils
            .parseUnits(lowerPriceInFraction.d.toString(), token0.decimals)
            .toString(),
          utils
            .parseUnits(lowerPriceInFraction.n.toString(), token1.decimals)
            .toString(),
        ),
      ),
      v3.TICK_SPACINGS[fee],
    );

    const tickUpper = v3.nearestUsableTick(
      v3.priceToClosestTick(
        new Price(
          token0,
          token1,
          utils
            .parseUnits(upperPriceInFraction.d.toString(), token0.decimals)
            .toString(),
          utils
            .parseUnits(upperPriceInFraction.n.toString(), token1.decimals)
            .toString(),
        ),
      ),
      v3.TICK_SPACINGS[fee],
    );

    const position = v3.Position.fromAmounts({
      pool: pool,
      tickLower:
        tickLower === tickUpper ? tickLower - v3.TICK_SPACINGS[fee] : tickLower,
      tickUpper: tickUpper,
      amount0: utils.parseUnits(amount0, token0.decimals).toString(),
      amount1: utils.parseUnits(amount1, token1.decimals).toString(),
      useFullPrecision: true,
    });

    const methodParameters = v3.NonfungiblePositionManager.addCallParameters(
      position,
      { ...swapOptions, ...addLiquidityOptions },
    );
    return { ...methodParameters, swapRequired: false };
  }

  async reducePositionHelper(
    wallet: Wallet,
    tokenId: number,
    decreasePercent: number,
  ): Promise<v3.MethodParameters> {
    // Reduce position and burn
    const positionData = await this.getRawPosition(wallet, tokenId);
    const token0 = this.getTokenByAddress(positionData.token0);
    const token1 = this.getTokenByAddress(positionData.token1);
    const fee = positionData.fee;
    if (!token0 || !token1) {
      throw new Error(
        `One of the tokens in this position isn't recognized. $token0: ${token0}, $token1: ${token1}`,
      );
    }
    const poolAddress = v3.Pool.getAddress(token0, token1, fee, POOL_INIT, FACTORY);
    const poolData = await this.getPoolState(poolAddress, fee);
    const position = new v3.Position({
      pool: new v3.Pool(
        token0,
        token1,
        poolData.fee,
        poolData.sqrtPriceX96.toString(),
        poolData.liquidity.toString(),
        poolData.tick,
      ),
      tickLower: positionData.tickLower,
      tickUpper: positionData.tickUpper,
      liquidity: positionData.liquidity,
    });
    return v3.NonfungiblePositionManager.removeCallParameters(
      position,
      this.getReduceLiquidityData(
        decreasePercent,
        tokenId,
        token0,
        token1,
        wallet,
      ),
    );
  }
}
