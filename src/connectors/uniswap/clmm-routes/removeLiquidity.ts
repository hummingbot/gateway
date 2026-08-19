import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@uniswap/sdk-core';
import { NonfungiblePositionManager, Position, computePoolAddress } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Uniswap } from '../uniswap';
import { POSITION_MANAGER_ABI, getUniswapV3NftManagerAddress, getUniswapV3FactoryAddress } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

// Default gas limit for CLMM remove liquidity operations
const CLMM_REMOVE_LIQUIDITY_GAS_LIMIT = 500000;

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  // Validate essential parameters
  if (!positionAddress || percentageToRemove === undefined) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  if (percentageToRemove < 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('Percentage to remove must be between 0 and 100');
  }

  // Get Uniswap and Ethereum instances
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Get the wallet
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  // Get position manager address
  const positionManagerAddress = getUniswapV3NftManagerAddress(network);

  // Check NFT ownership
  try {
    await uniswap.checkNFTOwnership(positionAddress, walletAddress);
  } catch (error: any) {
    if (error.message.includes('is not owned by')) {
      throw httpErrors.forbidden(error.message);
    }
    throw httpErrors.badRequest(error.message);
  }

  // Create position manager contract for reading position data
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

  // Get position details
  const position = await positionManager.positions(positionAddress);

  // Get tokens by address
  const token0 = await uniswap.getToken(position.token0);
  const token1 = await uniswap.getToken(position.token1);

  // The pool this position belongs to, derived from the same inputs position-info
  // uses. The unified route is position-addressed and never receives a pool, so
  // deriving it here is what lets the response name the venue it acted on.
  const poolAddress = computePoolAddress({
    factoryAddress: getUniswapV3FactoryAddress(network),
    tokenA: token0,
    tokenB: token1,
    fee: position.fee,
  });

  // Determine base and quote tokens - WETH or lower address is base
  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  // Get current liquidity
  const currentLiquidity = position.liquidity;

  // Calculate liquidity to remove based on percentage
  const liquidityToRemove = currentLiquidity.mul(Math.floor(percentageToRemove * 100)).div(10000);

  // Get the pool
  const pool = await uniswap.getV3Pool(token0, token1, position.fee);
  if (!pool) {
    throw httpErrors.notFound('Pool not found for position');
  }

  // Create a Position instance to calculate expected amounts
  const positionSDK = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: currentLiquidity.toString(),
  });

  // Calculate the amounts that will be withdrawn
  const liquidityPercentage = new Percent(Math.floor(percentageToRemove * 100), 10000);
  const partialPosition = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: JSBI.divide(
      JSBI.multiply(JSBI.BigInt(currentLiquidity.toString()), JSBI.BigInt(liquidityPercentage.numerator.toString())),
      JSBI.BigInt(liquidityPercentage.denominator.toString()),
    ),
  });

  // Get the expected amounts
  const amount0 = partialPosition.amount0;
  const amount1 = partialPosition.amount1;

  // Apply slippage tolerance
  const slippageTolerance = new Percent(100, 10000); // 1% slippage
  const amount0Min = amount0.multiply(new Percent(1).subtract(slippageTolerance)).quotient;
  const amount1Min = amount1.multiply(new Percent(1).subtract(slippageTolerance)).quotient;

  // Also add any fees that have been collected to the expected amounts
  const totalAmount0 = CurrencyAmount.fromRawAmount(
    token0,
    JSBI.add(amount0.quotient, JSBI.BigInt(position.tokensOwed0.toString())),
  );
  const totalAmount1 = CurrencyAmount.fromRawAmount(
    token1,
    JSBI.add(amount1.quotient, JSBI.BigInt(position.tokensOwed1.toString())),
  );

  // Create parameters for removing liquidity
  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
    burnToken: false,
    collectOptions: {
      expectedCurrencyOwed0: totalAmount0,
      expectedCurrencyOwed1: totalAmount1,
      recipient: walletAddress,
    },
  };

  // Get the calldata using the SDK
  const { calldata, value } = NonfungiblePositionManager.removeCallParameters(positionSDK, removeParams);

  // Initialize position manager with multicall interface
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

  // Execute the transaction to remove liquidity
  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_REMOVE_LIQUIDITY_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());

  const tx = await positionManagerWithSigner.multicall([calldata], txParams);

  // Wait for transaction confirmation
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the amounts below were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  // Calculate token amounts removed including fees
  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  // Map back to base and quote amounts
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
