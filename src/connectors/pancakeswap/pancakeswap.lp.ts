import { logger } from '../../services/logger';
import { PositionInfo, UniswapLPish } from '../../services/common-interfaces';
import { PancakeSwapConfig } from './pancakeswap.config';
import { Token } from '@pancakeswap/swap-sdk-core';
import * as v3 from '@pancakeswap/v3-sdk';
import {
  BigNumber,
  Transaction,
  Wallet,
  utils,
  constants,
  providers,
} from 'ethers';
import { PancakeswapLPHelper } from './pancakeswap.lp.helper';
import { AddPosReturn } from './pancakeswap.lp.interfaces';

const MaxUint128 = BigNumber.from(2).pow(128).sub(1);

export type Overrides = {
  gasLimit: BigNumber;
  gasPrice?: BigNumber;
  value?: BigNumber;
  nonce?: BigNumber;
  maxFeePerGas?: BigNumber;
  maxPriorityFeePerGas?: BigNumber;
};

export class PancakeswapLP extends PancakeswapLPHelper implements UniswapLPish {
  private static _instances: { [name: string]: PancakeswapLP };
  private _gasLimitEstimate: number;

  private constructor(chain: string, network: string) {
    super(chain, network);
    this._gasLimitEstimate = PancakeSwapConfig.config.gasLimitEstimate;
  }

  public static getInstance(chain: string, network: string): PancakeswapLP {
    if (PancakeswapLP._instances === undefined) {
      PancakeswapLP._instances = {};
    }
    if (!(chain + network in PancakeswapLP._instances)) {
      PancakeswapLP._instances[chain + network] = new PancakeswapLP(
        chain,
        network
      );
    }

    return PancakeswapLP._instances[chain + network];
  }

  /**
   * Default gas limit for swap transactions.
   */
  public get gasLimitEstimate(): number {
    return this._gasLimitEstimate;
  }

  async getPosition(tokenId: number): Promise<PositionInfo> {
    const contract = this.getContract('nft', this.chain.provider);
    const requests = [
      contract.positions(tokenId),
      this.collectFees(this.chain.provider, tokenId), // static call to calculate earned fees
    ];
    const positionInfoReq = await Promise.allSettled(requests);
    const rejected = positionInfoReq.filter(
      (r) => r.status === 'rejected'
    ) as PromiseRejectedResult[];
    if (rejected.length > 0)
      throw new Error(`Unable to fetch position with id ${tokenId}`);
    const positionInfo = (
      positionInfoReq.filter(
        (r) => r.status === 'fulfilled'
      ) as PromiseFulfilledResult<any>[]
    ).map((r) => r.value);
    const position = positionInfo[0];
    const feeInfo = positionInfo[1];
    const token0 = this.getTokenByAddress(position.token0);
    const token1 = this.getTokenByAddress(position.token1);
    if (!token0 || !token1) {
      throw new Error(`One of the tokens in this position isn't recognized.`);
    }
    const fee = position.fee;
    const poolAddress = v3.Pool.getAddress(token0, token1, fee);
    const poolData = await this.getPoolState(poolAddress, fee);
    const positionInst = new v3.Position({
      pool: new v3.Pool(
        token0,
        token1,
        poolData.fee,
        poolData.sqrtPriceX96.toString(),
        poolData.liquidity.toString(),
        poolData.tick
      ),
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      liquidity: position.liquidity,
    });
    return {
      token0: token0.symbol,
      token1: token1.symbol,
      fee: v3.FeeAmount[position.fee],
      lowerPrice: positionInst.token0PriceLower.toFixed(8),
      upperPrice: positionInst.token0PriceUpper.toFixed(8),
      amount0: positionInst.amount0.toFixed(),
      amount1: positionInst.amount1.toFixed(),
      unclaimedToken0: utils.formatUnits(
        feeInfo.amount0.toString(),
        token0.decimals
      ),
      unclaimedToken1: utils.formatUnits(
        feeInfo.amount1.toString(),
        token1.decimals
      ),
    };
  }

  async addPosition(
    wallet: Wallet,
    token0: Token,
    token1: Token,
    amount0: string,
    amount1: string,
    fee: string,
    lowerPrice: number,
    upperPrice: number,
    tokenId: number = 0,
    gasLimit: number,
    gasPrice: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber
  ): Promise<Transaction> {
    const convertedFee = v3.FeeAmount[fee as keyof typeof v3.FeeAmount];
    const addLiquidityResponse: AddPosReturn = await this.addPositionHelper(
      wallet,
      token0,
      token1,
      amount0,
      amount1,
      convertedFee,
      lowerPrice,
      upperPrice,
      tokenId
    );

    if (nonce === undefined) {
      nonce = await this.chain.nonceManager.getNextNonce(wallet.address);
    }

    const tx = await wallet.sendTransaction({
      data: addLiquidityResponse.calldata,
      to: addLiquidityResponse.swapRequired ? this.router : this.nftManager,
      ...this.generateOverrides(
        gasLimit,
        gasPrice,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
        addLiquidityResponse.value
      ),
    });
    logger.info(`Pancakeswap V3 Add position Tx Hash: ${tx.hash}`);
    return tx;
  }

  async reducePosition(
    wallet: Wallet,
    tokenId: number,
    decreasePercent: number = 100,
    gasLimit: number,
    gasPrice: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber
  ): Promise<Transaction> {
    // Reduce position and burn
    const contract = this.getContract('nft', wallet);
    const { calldata, value } = await this.reducePositionHelper(
      wallet,
      tokenId,
      decreasePercent
    );

    if (nonce === undefined) {
      nonce = await this.chain.nonceManager.getNextNonce(wallet.address);
    }

    const tx = await contract.multicall(
      [calldata],
      this.generateOverrides(
        gasLimit,
        gasPrice,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
        value
      )
    );
    logger.info(`Pancakeswap V3 Remove position Tx Hash: ${tx.hash}`);
    return tx;
  }

  async collectFees(
    wallet: Wallet | providers.StaticJsonRpcProvider,
    tokenId: number,
    gasLimit: number = this.gasLimitEstimate,
    gasPrice: number = 0,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber
  ): Promise<Transaction | { amount0: BigNumber; amount1: BigNumber }> {
    const contract = this.getContract('nft', wallet);
    const collectData = {
      tokenId: tokenId,
      recipient: constants.AddressZero,
      amount0Max: MaxUint128,
      amount1Max: MaxUint128,
    };

    if (wallet instanceof providers.StaticJsonRpcProvider) {
      return await contract.callStatic.collect(collectData);
    } else {
      collectData.recipient = wallet.address;
      if (nonce === undefined) {
        nonce = await this.chain.nonceManager.getNextNonce(wallet.address);
      }
      return await contract.collect(
        collectData,
        this.generateOverrides(
          gasLimit,
          gasPrice,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas
        )
      );
    }
  }

  generateOverrides(
    gasLimit: number,
    gasPrice: number,
    nonce?: number,
    maxFeePerGas?: BigNumber,
    maxPriorityFeePerGas?: BigNumber,
    value?: string
  ): Overrides {
    const overrides: Overrides = {
      gasLimit: BigNumber.from(String(gasLimit.toFixed(0))),
    };
    if (maxFeePerGas && maxPriorityFeePerGas) {
      overrides.maxFeePerGas = maxFeePerGas;
      overrides.maxPriorityFeePerGas = maxPriorityFeePerGas;
    } else {
      overrides.gasPrice = BigNumber.from(String((gasPrice * 1e9).toFixed(0)));
    }
    if (nonce) overrides.nonce = BigNumber.from(String(nonce));
    if (value) overrides.value = BigNumber.from(value);
    return overrides;
  }
}
