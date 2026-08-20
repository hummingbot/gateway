import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@pancakeswap/sdk';
import { NonfungiblePositionManager, Position, computePoolAddress } from '@pancakeswap/v3-sdk';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';
import { Address } from 'viem';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { slippageBasisPoints } from '../../evm-slippage';
import { Pancakeswap } from '../pancakeswap';
import { PancakeswapConfig } from '../pancakeswap.config';
import {
  POSITION_MANAGER_ABI,
  getPancakeswapV3NftManagerAddress,
  getPancakeswapV3PoolDeployerAddress,
} from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM remove liquidity operations
const CLMM_REMOVE_LIQUIDITY_GAS_LIMIT = 500000;

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<RemoveLiquidityResponseType> {
  if (!positionAddress || percentageToRemove === undefined) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  if (percentageToRemove < 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('Percentage to remove must be between 0 and 100');
  }

  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  const positionManagerAddress = getPancakeswapV3NftManagerAddress(network);

  try {
    await pancakeswap.checkNFTOwnership(positionAddress, walletAddress);
  } catch (error: any) {
    if (error.message.includes('is not owned by')) {
      throw httpErrors.forbidden(error.message);
    }
    throw httpErrors.badRequest(error.message);
  }

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

  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  const currentLiquidity = position.liquidity;
  const pool = await pancakeswap.getV3Pool(token0, token1, position.fee);
  if (!pool) {
    throw httpErrors.notFound('Pool not found for position');
  }

  const positionSDK = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: currentLiquidity.toString(),
  });

  const liquidityPercentage = new Percent(Math.floor(percentageToRemove * 100), 10000);
  const partialPosition = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: JSBI.divide(
      JSBI.multiply(JSBI.BigInt(currentLiquidity.toString()), JSBI.BigInt(liquidityPercentage.numerator.toString())),
      JSBI.BigInt(liquidityPercentage.denominator.toString()),
    ).toString(),
  });

  const amount0 = partialPosition.amount0;
  const amount1 = partialPosition.amount1;
  // The caller's tolerance, or the connector's configured one — not a literal. This was
  // `new Percent(100, 10000)`, a flat 1% that ignored both, so an operator who had widened
  // slippagePct for a volatile pair got 1% anyway and a revert that cost gas.
  const slippageTolerance = new Percent(slippageBasisPoints(slippagePct), 10000);

  const totalAmount0 = CurrencyAmount.fromRawAmount(
    token0,
    JSBI.add(JSBI.BigInt(amount0.quotient.toString()), JSBI.BigInt(position.tokensOwed0.toString())).toString(),
  );
  const totalAmount1 = CurrencyAmount.fromRawAmount(
    token1,
    JSBI.add(JSBI.BigInt(amount1.quotient.toString()), JSBI.BigInt(position.tokensOwed1.toString())).toString(),
  );

  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    burnToken: false,
    collectOptions: {
      expectedCurrencyOwed0: totalAmount0,
      expectedCurrencyOwed1: totalAmount1,
      recipient: walletAddress as Address,
    },
  };

  const { calldata, value } = NonfungiblePositionManager.removeCallParameters(positionSDK, removeParams);

  const positionManagerWithSigner = new Contract(
    positionManagerAddress,
    [
      {
        inputs: [{ internalType: 'bytes[]', name: 'data', type: 'bytes[]' }],
        name: 'multicall',
        outputs: [{ internalType: 'bytes[]', name: 'results', type: 'bytes[]' }],
        stateMutability: 'payable',
        type: 'function',
      },
    ],
    wallet,
  );

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_REMOVE_LIQUIDITY_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());
  const tx = await positionManagerWithSigner.multicall([calldata], txParams);
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the amounts below were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      poolAddress,
      fee: outcome.fee,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
    },
  };
}
