import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@uniswap/sdk-core';
import { NonfungiblePositionManager, Position } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { ClosePositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { Uniswap } from '../uniswap';
import { POSITION_MANAGER_ABI, getUniswapV3NftManagerAddress } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

// Default gas limit for CLMM close position operations
const CLMM_CLOSE_POSITION_GAS_LIMIT = 400000;

export async function closePosition(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  // Validate essential parameters
  if (!positionAddress) {
    throw httpErrors.badRequest('Missing required parameters');
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

  // Create position manager contract
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

  // Get position details
  const position = await positionManager.positions(positionAddress);

  // Get tokens by address
  const token0 = await uniswap.getToken(position.token0);
  const token1 = await uniswap.getToken(position.token1);

  // Determine base and quote tokens - WETH or lower address is base
  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  // Get current liquidity
  const currentLiquidity = position.liquidity;

  // Check if position has already been closed
  if (currentLiquidity.isZero() && position.tokensOwed0.isZero() && position.tokensOwed1.isZero()) {
    throw httpErrors.badRequest('Position has already been closed or has no liquidity/fees to collect');
  }

  // Get fees owned
  const feeAmount0 = position.tokensOwed0;
  const feeAmount1 = position.tokensOwed1;

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

  // Get the expected amounts for 100% removal
  const amount0 = positionSDK.amount0;
  const amount1 = positionSDK.amount1;

  // Apply slippage tolerance
  const slippageTolerance = new Percent(100, 10000); // 1% slippage
  const amount0Min = amount0.multiply(new Percent(1).subtract(slippageTolerance)).quotient;
  const amount1Min = amount1.multiply(new Percent(1).subtract(slippageTolerance)).quotient;

  // Add any fees that have been collected to the expected amounts
  const totalAmount0 = CurrencyAmount.fromRawAmount(
    token0,
    JSBI.add(amount0.quotient, JSBI.BigInt(feeAmount0.toString())),
  );
  const totalAmount1 = CurrencyAmount.fromRawAmount(
    token1,
    JSBI.add(amount1.quotient, JSBI.BigInt(feeAmount1.toString())),
  );

  // Create parameters for removing all liquidity
  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage: new Percent(10000, 10000), // 100% of liquidity
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
    burnToken: true, // Burn the position token since we're closing it
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

  // Execute the transaction to remove liquidity and burn the position
  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_CLOSE_POSITION_GAS_LIMIT);
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

  // Calculate fee amounts collected
  const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
  const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

  // Map back to base and quote amounts
  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

  // In Ethereum there's no position rent to refund, but we include it for API compatibility
  const positionRentRefunded = 0;

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      fee: outcome.fee,
      positionRentRefunded,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}
