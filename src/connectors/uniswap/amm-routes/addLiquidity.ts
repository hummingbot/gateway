import { Percent } from '@uniswap/sdk-core';
import { BigNumber, utils } from 'ethers';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { wrapEthereum } from '../../../chains/ethereum/routes/wrap';
import { AddLiquidityResponseType } from '../../../schemas/amm-schema';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { IUniswapV2Router02ABI } from '../uniswap.contracts';
import { getUniswapPoolInfo } from '../uniswap.utils';

import { getUniswapAmmLiquidityQuote } from './quoteLiquidity';

// Default gas limit for AMM add liquidity operations
const AMM_ADD_LIQUIDITY_GAS_LIMIT = 500000;

async function addLiquidityInternal(
  fastify: any,
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const networkToUse = network;

  // Handle ETH->WETH wrapping if needed for baseToken
  let actualBaseToken = baseToken;
  let baseWrapTxHash = null;
  if (baseToken === 'ETH') {
    // Declared here, as the quote-token branch below does. It used to resolve to a
    // function-scope binding declared further down, which made this branch a
    // guaranteed ReferenceError: adding liquidity with ETH as the base token could
    // never have worked. The dead-code sweep that removed the unused later binding is
    // what surfaced it.
    const uniswap = await Uniswap.getInstance(networkToUse);
    const wethToken = await uniswap.getToken('WETH');
    if (!wethToken) {
      throw new Error('WETH token not found');
    }

    logger.info(`ETH detected as base token, wrapping ${baseTokenAmount} ETH to WETH first`);

    const wrapResult = await wrapEthereum(fastify, networkToUse, walletAddress, baseTokenAmount.toString());
    baseWrapTxHash = wrapResult.signature;
    actualBaseToken = 'WETH';

    logger.info(`Successfully wrapped ${baseTokenAmount} ETH to WETH, transaction hash: ${baseWrapTxHash}`);
  }

  // Handle ETH->WETH wrapping if needed for quoteToken
  let actualQuoteToken = quoteToken;
  let quoteWrapTxHash = null;
  if (quoteToken === 'ETH') {
    const uniswap = await Uniswap.getInstance(networkToUse);
    const wethToken = await uniswap.getToken('WETH');
    if (!wethToken) {
      throw new Error('WETH token not found');
    }

    logger.info(`ETH detected as quote token, wrapping ${quoteTokenAmount} ETH to WETH first`);

    const wrapResult = await wrapEthereum(fastify, networkToUse, walletAddress, quoteTokenAmount.toString());
    quoteWrapTxHash = wrapResult.signature;
    actualQuoteToken = 'WETH';

    logger.info(`Successfully wrapped ${quoteTokenAmount} ETH to WETH, transaction hash: ${quoteWrapTxHash}`);
  }

  // Get quote first to calculate optimal amounts and get execution data
  const quote = await getUniswapAmmLiquidityQuote(
    networkToUse,
    poolAddress,
    actualBaseToken,
    actualQuoteToken,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );

  // Get Ethereum instance
  const ethereum = await Ethereum.getInstance(networkToUse);

  const router = new utils.Interface(IUniswapV2Router02ABI.abi);
  const requireRouterAllowance = (token: { address: string; symbol: string; decimals: number }, amount: BigNumber) =>
    ethereum.requireAllowance(walletAddress, token, quote.routerAddress, amount, 'uniswap/amm');

  // Calculate slippage-adjusted amounts
  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

  const slippageMultiplier = new Percent(1).subtract(slippageTolerance);

  const baseTokenMinAmount = quote.rawBaseTokenAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());

  const quoteTokenMinAmount = quote.rawQuoteTokenAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());

  // Prepare the transaction parameters
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  let data: string;
  let value = '0';
  let gasLimit = AMM_ADD_LIQUIDITY_GAS_LIMIT;

  // A WETH side is deposited as native ETH (addLiquidityETH); every ERC-20 side needs the router's allowance.
  if (quote.baseTokenObj.symbol === 'WETH') {
    await requireRouterAllowance(quote.quoteTokenObj, quote.rawQuoteTokenAmount);
    data = router.encodeFunctionData('addLiquidityETH', [
      quote.quoteTokenObj.address,
      quote.rawQuoteTokenAmount,
      quoteTokenMinAmount,
      baseTokenMinAmount,
      walletAddress,
      deadline,
    ]);
    value = quote.rawBaseTokenAmount.toString();
    gasLimit = 300000;
  } else if (quote.quoteTokenObj.symbol === 'WETH') {
    await requireRouterAllowance(quote.baseTokenObj, quote.rawBaseTokenAmount);
    data = router.encodeFunctionData('addLiquidityETH', [
      quote.baseTokenObj.address,
      quote.rawBaseTokenAmount,
      baseTokenMinAmount,
      quoteTokenMinAmount,
      walletAddress,
      deadline,
    ]);
    value = quote.rawQuoteTokenAmount.toString();
  } else {
    await requireRouterAllowance(quote.baseTokenObj, quote.rawBaseTokenAmount);
    await requireRouterAllowance(quote.quoteTokenObj, quote.rawQuoteTokenAmount);
    data = router.encodeFunctionData('addLiquidity', [
      quote.baseTokenObj.address,
      quote.quoteTokenObj.address,
      quote.rawBaseTokenAmount,
      quote.rawQuoteTokenAmount,
      baseTokenMinAmount,
      quoteTokenMinAmount,
      walletAddress,
      deadline,
    ]);
  }

  const tx = await ethereum.sendTransactionForWallet(walletAddress, {
    to: quote.routerAddress,
    data,
    value,
    gasLimit,
    description: `add liquidity to pool ${poolAddress}`,
  });

  // Wait for transaction confirmation
  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the quoted amounts were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      fee: outcome.fee,
      baseTokenAmountAdded: quote.baseTokenAmount,
      quoteTokenAmountAdded: quote.quoteTokenAmount,
      ...(baseWrapTxHash && { baseWrapTxHash }),
      ...(quoteWrapTxHash && { quoteWrapTxHash }),
    },
  };
}

/**
 * Standard AMM add-liquidity entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. Base/quote tokens are derived from the pool; gasPrice/maxGas are optional EVM extras.
 */
export async function addLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'amm');
  if (!poolInfo) throw httpErrors.notFound(`Pool not found: ${poolAddress}`);
  return await addLiquidityInternal(
    { httpErrors },
    network,
    walletAddress,
    poolAddress,
    poolInfo.baseTokenAddress,
    poolInfo.quoteTokenAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );
}
