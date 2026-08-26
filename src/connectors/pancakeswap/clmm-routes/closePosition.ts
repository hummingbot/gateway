import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@pancakeswap/sdk';
import { NonfungiblePositionManager, Position, computePoolAddress } from '@pancakeswap/v3-sdk';
import { BigNumber } from 'ethers';
import { Address } from 'viem';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { ClosePositionResponseType } from '../../../schemas/clmm-schema';
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

// Default gas limit for CLMM close position operations
const CLMM_CLOSE_POSITION_GAS_LIMIT = 400000;

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
  slippagePct: number = PancakeswapConfig.config.slippagePct,
): Promise<ClosePositionResponseType> {
  if (!positionAddress) {
    throw httpErrors.badRequest('Missing required parameters');
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

  if (currentLiquidity.isZero() && position.tokensOwed0.isZero() && position.tokensOwed1.isZero()) {
    throw httpErrors.badRequest('Position has already been closed or has no liquidity/fees to collect');
  }

  const feeAmount0 = position.tokensOwed0;
  const feeAmount1 = position.tokensOwed1;

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

  const amount0 = positionSDK.amount0;
  const amount1 = positionSDK.amount1;

  // The caller's tolerance, or the connector's configured one — not a literal. This was
  // `new Percent(100, 10000)`, a flat 1% that ignored both, so an operator who had widened
  // slippagePct for a volatile pair got 1% anyway and a revert that cost gas.
  const slippageTolerance = new Percent(slippageBasisPoints(slippagePct), 10000);

  const totalAmount0 = CurrencyAmount.fromRawAmount(token0, BigInt(amount0.quotient) + BigInt(feeAmount0.toString()));
  const totalAmount1 = CurrencyAmount.fromRawAmount(token1, BigInt(amount1.quotient) + BigInt(feeAmount1.toString()));

  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage: new Percent(10000, 10000),
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    burnToken: true,
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

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_CLOSE_POSITION_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());
  const tx = await positionManagerWithSigner.multicall([calldata], txParams);
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the amounts below were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
  const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

  const positionRentRefunded = 0;

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      poolAddress,
      fee: outcome.fee,
      positionRentRefunded,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}
