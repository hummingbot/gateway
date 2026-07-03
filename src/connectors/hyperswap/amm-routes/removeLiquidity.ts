import { Contract } from '@ethersproject/contracts';
import { Percent } from '@pancakeswap/sdk';
import { Static } from '@sinclair/typebox';
import { utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { RemoveLiquidityResponseType, RemoveLiquidityResponse } from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Hyperswap } from '../hyperswap';
import { HyperswapConfig } from '../hyperswap.config';
import { getHyperswapV2RouterAddress, IHyperswapV2Router02ABI, IHyperswapV2PairABI } from '../hyperswap.contracts';
import { formatTokenAmount, getHyperswapPoolInfo } from '../hyperswap.utils';
import { HyperswapAmmRemoveLiquidityRequest } from '../schemas';

import { checkLPAllowance } from './positionInfo';

// Default gas limit for AMM remove liquidity operations
const AMM_REMOVE_LIQUIDITY_GAS_LIMIT = 400000;

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof HyperswapAmmRemoveLiquidityRequest>;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Hyperswap V2 pool',
        tags: ['/connector/hyperswap'],
        body: HyperswapAmmRemoveLiquidityRequest,
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress,
          percentageToRemove,
          slippagePct = HyperswapConfig.config.slippagePct,
          walletAddress: requestedWalletAddress,
          gasPrice,
          maxGas,
        } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (!poolAddress || !percentageToRemove) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove <= 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest('Percentage to remove must be between 0 and 100');
        }

        // Get Hyperswap and Ethereum instances
        const hyperswap = await Hyperswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await hyperswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        // Get pool information to determine tokens
        const poolInfo = await getHyperswapPoolInfo(poolAddress, networkToUse, 'amm');
        if (!poolInfo) {
          throw fastify.httpErrors.notFound(`Pool not found: ${poolAddress}`);
        }

        const baseTokenObj = await hyperswap.getToken(poolInfo.baseTokenAddress);
        const quoteTokenObj = await hyperswap.getToken(poolInfo.quoteTokenAddress);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest('Token information not found for pool');
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Check if the user has LP tokens for this pool
        const pairContract = new Contract(poolAddress, IHyperswapV2PairABI.abi, wallet);

        const lpBalance = await pairContract.balanceOf(walletAddress);
        if (lpBalance.eq(0)) {
          throw fastify.httpErrors.badRequest(`No liquidity position found for this pool`);
        }

        // Get the total supply and reserves
        const [token0, token1, totalSupply, reserves] = await Promise.all([
          pairContract.token0(),
          pairContract.token1(),
          pairContract.totalSupply(),
          pairContract.getReserves(),
        ]);

        const token0IsBase = token0.toLowerCase() === baseTokenObj.address.toLowerCase();

        // Calculate expected amounts
        const liquidityToRemove = lpBalance.mul(Math.floor(percentageToRemove * 100)).div(10000);
        const baseTokenReserve = token0IsBase ? reserves[0] : reserves[1];
        const quoteTokenReserve = token0IsBase ? reserves[1] : reserves[0];

        const expectedBaseTokenAmount = baseTokenReserve.mul(liquidityToRemove).div(totalSupply);
        const expectedQuoteTokenAmount = quoteTokenReserve.mul(liquidityToRemove).div(totalSupply);

        // Get the router contract with signer
        const routerAddress = getHyperswapV2RouterAddress(networkToUse);
        const router = new Contract(routerAddress, IHyperswapV2Router02ABI.abi, wallet);

        const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);
        const slippageMultiplier = new Percent(1).subtract(slippageTolerance);

        const baseTokenMinAmount = expectedBaseTokenAmount
          .mul(slippageMultiplier.numerator.toString())
          .div(slippageMultiplier.denominator.toString());

        const quoteTokenMinAmount = expectedQuoteTokenAmount
          .mul(slippageMultiplier.numerator.toString())
          .div(slippageMultiplier.denominator.toString());

        // Check LP token allowance
        try {
          await checkLPAllowance(ethereum, wallet, poolAddress, routerAddress, liquidityToRemove);
        } catch (error: any) {
          throw fastify.httpErrors.badRequest(error.message);
        }

        // Prepare the transaction parameters
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

        // Prepare gas options
        // Convert gasPrice from wei to gwei if provided
        const gasPriceGwei = gasPrice ? parseFloat(utils.formatUnits(gasPrice, 'gwei')) : undefined;
        const gasOptions = await ethereum.prepareGasOptions(gasPriceGwei, maxGas || AMM_REMOVE_LIQUIDITY_GAS_LIMIT);

        const tx = await router.removeLiquidity(
          token0,
          token1,
          liquidityToRemove,
          token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount,
          token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount,
          walletAddress,
          deadline,
          gasOptions,
        );

        // Wait for transaction confirmation
        const receipt = await ethereum.handleTransactionExecution(tx);

        // Format amounts for response
        const baseTokenAmountRemoved = formatTokenAmount(expectedBaseTokenAmount.toString(), baseTokenObj.decimals);

        const quoteTokenAmountRemoved = formatTokenAmount(expectedQuoteTokenAmount.toString(), quoteTokenObj.decimals);

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        return {
          signature: receipt.transactionHash,
          status: receipt.status,
          data: {
            fee: gasFee,
            baseTokenAmountRemoved,
            quoteTokenAmountRemoved,
          },
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }

        // Handle insufficient funds errors
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
