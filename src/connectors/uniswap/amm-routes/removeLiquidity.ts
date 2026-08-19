import { Contract } from '@ethersproject/contracts';
import { Static } from '@sinclair/typebox';
import { Percent } from '@uniswap/sdk-core';
import { utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { RemoveLiquidityResponseType, RemoveLiquidityResponse } from '../../../schemas/amm-schema';
import { TransactionStatus } from '../../../schemas/chain-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { UniswapAmmRemoveLiquidityRequest } from '../schemas';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { getUniswapV2RouterAddress, IUniswapV2Router02ABI, IUniswapV2PairABI } from '../uniswap.contracts';
import { formatTokenAmount, getUniswapPoolInfo } from '../uniswap.utils';

import { checkLPAllowance } from './positionInfo';

// Default gas limit for AMM remove liquidity operations
const AMM_REMOVE_LIQUIDITY_GAS_LIMIT = 400000;

/**
 * Standard AMM remove-liquidity entry point (network-based) — consumed by the unified /trading/amm
 * dispatcher. Removes `percentageToRemove` of the wallet's LP position; base/quote follow the pair.
 */
export async function removeLiquidity(
  network: string,
  walletAddress: string,
  poolAddress: string,
  percentageToRemove: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<RemoveLiquidityResponseType> {
  if (!poolAddress || !percentageToRemove) throw httpErrors.badRequest('Missing required parameters');
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('Percentage to remove must be between 0 and 100');
  }

  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'amm');
  if (!poolInfo) throw httpErrors.notFound(`Pool not found: ${poolAddress}`);

  const baseTokenObj = await uniswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await uniswap.getToken(poolInfo.quoteTokenAddress);
  if (!baseTokenObj || !quoteTokenObj) throw httpErrors.badRequest('Token information not found for pool');

  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) throw httpErrors.badRequest('Wallet not found');

  const pairContract = new Contract(poolAddress, IUniswapV2PairABI.abi, wallet);
  const lpBalance = await pairContract.balanceOf(walletAddress);
  if (lpBalance.eq(0)) throw httpErrors.badRequest('No liquidity position found for this pool');

  const [token0, token1, totalSupply, reserves] = await Promise.all([
    pairContract.token0(),
    pairContract.token1(),
    pairContract.totalSupply(),
    pairContract.getReserves(),
  ]);

  const token0IsBase = token0.toLowerCase() === baseTokenObj.address.toLowerCase();

  const liquidityToRemove = lpBalance.mul(Math.floor(percentageToRemove * 100)).div(10000);
  const baseTokenReserve = token0IsBase ? reserves[0] : reserves[1];
  const quoteTokenReserve = token0IsBase ? reserves[1] : reserves[0];

  const expectedBaseTokenAmount = baseTokenReserve.mul(liquidityToRemove).div(totalSupply);
  const expectedQuoteTokenAmount = quoteTokenReserve.mul(liquidityToRemove).div(totalSupply);

  const routerAddress = getUniswapV2RouterAddress(network);
  const router = new Contract(routerAddress, IUniswapV2Router02ABI.abi, wallet);

  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);
  const slippageMultiplier = new Percent(1).subtract(slippageTolerance);
  const baseTokenMinAmount = expectedBaseTokenAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());
  const quoteTokenMinAmount = expectedQuoteTokenAmount
    .mul(slippageMultiplier.numerator.toString())
    .div(slippageMultiplier.denominator.toString());

  await checkLPAllowance(ethereum, wallet, poolAddress, routerAddress, liquidityToRemove);

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
  const gasOptions = await ethereum.prepareGasOptions(undefined, AMM_REMOVE_LIQUIDITY_GAS_LIMIT);

  let tx;
  if (baseTokenObj.symbol === 'WETH') {
    tx = await router.removeLiquidityETH(
      token0IsBase ? token1 : token0,
      liquidityToRemove,
      token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount,
      token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount,
      walletAddress,
      deadline,
      gasOptions,
    );
  } else if (quoteTokenObj.symbol === 'WETH') {
    tx = await router.removeLiquidityETH(
      token0IsBase ? token0 : token1,
      liquidityToRemove,
      token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount,
      token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount,
      walletAddress,
      deadline,
      gasOptions,
    );
  } else {
    tx = await router.removeLiquidity(
      token0,
      token1,
      liquidityToRemove,
      token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount,
      token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount,
      walletAddress,
      deadline,
      gasOptions,
    );
  }

  const outcome = await ethereum.handleTransactionConfirmation(tx);
  if (!outcome.confirmed) {
    // Still pending — the expected amounts were computed before sending and have not moved.
    return { signature: outcome.signature, status: TransactionStatus.PENDING };
  }

  const baseTokenAmountRemoved = formatTokenAmount(expectedBaseTokenAmount.toString(), baseTokenObj.decimals);
  const quoteTokenAmountRemoved = formatTokenAmount(expectedQuoteTokenAmount.toString(), quoteTokenObj.decimals);

  return {
    signature: outcome.signature,
    status: TransactionStatus.CONFIRMED,
    data: {
      fee: outcome.fee,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
    },
  };
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof UniswapAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Uniswap V2 pool',
        tags: ['/connector/uniswap'],
        body: UniswapAmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, percentageToRemove, walletAddress: requestedWalletAddress } = request.body;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await Ethereum.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        return await removeLiquidity(network, walletAddress, poolAddress, percentageToRemove, undefined);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest(
            'Insufficient ETH balance to pay for gas fees. Please add more ETH to your wallet.',
          );
        }
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;
