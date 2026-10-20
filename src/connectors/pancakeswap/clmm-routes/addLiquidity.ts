import { Contract } from '@ethersproject/contracts';
import { CurrencyAmount, Percent } from '@pancakeswap/sdk';
import { Position, NonfungiblePositionManager, computePoolAddress } from '@pancakeswap/v3-sdk';
import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { positionManagerCall } from '../../clmm-v3-utils';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import {
  getPancakeswapV3NftManagerAddress,
  POSITION_MANAGER_ABI,
  getPancakeswapV3PoolDeployerAddress,
} from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM add liquidity operations
const CLMM_ADD_LIQUIDITY_GAS_LIMIT = 600000;

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  if (!positionAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  const positionManagerAddress = getPancakeswapV3NftManagerAddress(network);
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const position = await positionManager.positions(positionAddress);

  const token0 = await pancakeswap.getToken(position.token0);
  const token1 = await pancakeswap.getToken(position.token1);

  // The pool this position belongs to, derived from the same inputs position-info
  // uses. The unified route is position-addressed and never receives a pool, so
  // deriving it here is what lets the response name the venue it acted on.
  const poolAddress = computePoolAddress({
    deployerAddress: getPancakeswapV3PoolDeployerAddress(network),
    tokenA: token0,
    tokenB: token1,
    fee: position.fee,
  });
  const fee = position.fee;
  const tickLower = position.tickLower;
  const tickUpper = position.tickUpper;

  const pool = await pancakeswap.getV3Pool(token0, token1, fee);
  if (!pool) {
    throw httpErrors.notFound('Pool not found for position');
  }

  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

  const baseTokenSymbol = token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
  const isBaseToken0 = token0.symbol === baseTokenSymbol;

  let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
  let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);

  if (baseTokenAmount !== undefined) {
    // Use parseUnits to avoid scientific notation issues with large numbers
    const baseAmountRaw = utils.parseUnits(
      baseTokenAmount.toString(),
      isBaseToken0 ? token0.decimals : token1.decimals,
    );
    if (isBaseToken0) {
      token0Amount = CurrencyAmount.fromRawAmount(token0, baseAmountRaw.toString());
    } else {
      token1Amount = CurrencyAmount.fromRawAmount(token1, baseAmountRaw.toString());
    }
  }

  if (quoteTokenAmount !== undefined) {
    // Use parseUnits to avoid scientific notation issues with large numbers
    const quoteAmountRaw = utils.parseUnits(
      quoteTokenAmount.toString(),
      isBaseToken0 ? token1.decimals : token0.decimals,
    );
    if (isBaseToken0) {
      token1Amount = CurrencyAmount.fromRawAmount(token1, quoteAmountRaw.toString());
    } else {
      token0Amount = CurrencyAmount.fromRawAmount(token0, quoteAmountRaw.toString());
    }
  }

  const newPosition = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: token0Amount.quotient,
    amount1: token1Amount.quotient,
    useFullPrecision: true,
  });

  const increaseLiquidityOptions = {
    tokenId: positionAddress,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
  };

  const { calldata, value } = NonfungiblePositionManager.addCallParameters(newPosition, increaseLiquidityOptions);

  // The position manager spends both tokens (spender "pancakeswap/clmm"). WETH is exempt, as before.
  for (const [token, amount] of [
    [token0, token0Amount],
    [token1, token1Amount],
  ] as const) {
    if (token.symbol === 'WETH') continue;
    await ethereum.requireAllowance(
      walletAddress,
      { address: token.address, symbol: token.symbol ?? token.address, decimals: token.decimals },
      positionManagerAddress,
      BigNumber.from(amount.quotient.toString()),
      'pancakeswap/clmm',
    );
  }

  const tx = await ethereum.sendTransactionForWallet(
    walletAddress,
    positionManagerCall(
      positionManagerAddress,
      calldata,
      value,
      CLMM_ADD_LIQUIDITY_GAS_LIMIT,
      `add liquidity to position ${positionAddress}`,
    ),
  );
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the mint amounts below were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  const actualToken0Amount = formatTokenAmount(newPosition.mintAmounts.amount0.toString(), token0.decimals);
  const actualToken1Amount = formatTokenAmount(newPosition.mintAmounts.amount1.toString(), token1.decimals);

  const actualBaseAmount = isBaseToken0 ? actualToken0Amount : actualToken1Amount;
  const actualQuoteAmount = isBaseToken0 ? actualToken1Amount : actualToken0Amount;

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      poolAddress,
      fee: outcome.fee,
      baseTokenAmountAdded: actualBaseAmount,
      quoteTokenAmountAdded: actualQuoteAmount,
    },
  };
}
