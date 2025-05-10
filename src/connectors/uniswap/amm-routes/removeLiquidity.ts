import { Contract } from '@ethersproject/contracts';
import { Percent } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityRequest,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/trading-types/amm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { formatTokenAmount } from '../uniswap.utils';

// Define the necessary ABIs
const IUniswapV2Router02ABI = {
  abi: [
    {
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountAMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountBMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'removeLiquidity',
      outputs: [
        { internalType: 'uint256', name: 'amountA', type: 'uint256' },
        { internalType: 'uint256', name: 'amountB', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      ],
      name: 'removeLiquidityETH',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETH', type: 'uint256' },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};

const IUniswapV2PairABI = {
  abi: [
    {
      constant: true,
      inputs: [],
      name: 'getReserves',
      outputs: [
        { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
        { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
        { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'token0',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'token1',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'totalSupply',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: false,
      inputs: [
        { internalType: 'address', name: 'spender', type: 'address' },
        { internalType: 'uint256', name: 'value', type: 'uint256' },
      ],
      name: 'approve',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Uniswap V2 pool',
        tags: ['uniswap/amm'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            chain: { type: 'string', default: 'ethereum' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            poolAddress: {
              type: 'string',
              examples: ['0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'],
            },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            percentageToRemove: { type: 'number', examples: [50] },
          },
        },
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          percentageToRemove,
          walletAddress: requestedWalletAddress,
        } = request.body;

        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!baseToken || !quoteToken || !percentageToRemove) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        if (percentageToRemove <= 0 || percentageToRemove > 100) {
          throw fastify.httpErrors.badRequest(
            'Percentage to remove must be between 0 and 100',
          );
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(
            `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
          );
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Check if the user has LP tokens for this pool
        const pairContract = new Contract(
          poolAddress,
          IUniswapV2PairABI.abi,
          wallet,
        );

        const lpBalance = await pairContract.balanceOf(walletAddress);
        if (lpBalance.eq(0)) {
          throw fastify.httpErrors.badRequest(
            `No liquidity position found for this pool`,
          );
        }

        // Get the total supply and reserves
        const [token0, token1, totalSupply, reserves] = await Promise.all([
          pairContract.token0(),
          pairContract.token1(),
          pairContract.totalSupply(),
          pairContract.getReserves(),
        ]);

        const token0IsBase =
          token0.toLowerCase() === baseTokenObj.address.toLowerCase();

        // Calculate expected amounts
        const liquidityToRemove = lpBalance
          .mul(Math.floor(percentageToRemove * 100))
          .div(10000);
        const baseTokenReserve = token0IsBase ? reserves[0] : reserves[1];
        const quoteTokenReserve = token0IsBase ? reserves[1] : reserves[0];

        const expectedBaseTokenAmount = baseTokenReserve
          .mul(liquidityToRemove)
          .div(totalSupply);
        const expectedQuoteTokenAmount = quoteTokenReserve
          .mul(liquidityToRemove)
          .div(totalSupply);

        // Get the router contract with signer
        const routerAddress =
          uniswap.config.uniswapV2RouterAddress(networkToUse);
        const router = new Contract(
          routerAddress,
          IUniswapV2Router02ABI.abi,
          wallet,
        );

        // Calculate slippage-adjusted amounts (0.5% slippage by default)
        const slippageTolerance = new Percent(5, 1000); // 0.5%
        const slippageMultiplier = new Percent(1).subtract(slippageTolerance);

        const baseTokenMinAmount = expectedBaseTokenAmount
          .mul(slippageMultiplier.numerator.toString())
          .div(slippageMultiplier.denominator.toString());

        const quoteTokenMinAmount = expectedQuoteTokenAmount
          .mul(slippageMultiplier.numerator.toString())
          .div(slippageMultiplier.denominator.toString());

        // Prepare the transaction parameters
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

        // Approve router to spend LP tokens
        await pairContract.approve(routerAddress, liquidityToRemove);

        let tx;

        // Check if one of the tokens is WETH
        if (baseTokenObj.symbol === 'WETH') {
          // Remove liquidity WETH + Token
          tx = await router.removeLiquidityETH(
            token0IsBase ? token1 : token0, // The non-WETH token
            liquidityToRemove,
            token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount, // Min amount of the token
            token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount, // Min amount of WETH
            walletAddress,
            deadline,
            { gasLimit: 300000 },
          );
        } else if (quoteTokenObj.symbol === 'WETH') {
          // Remove liquidity Token + WETH
          tx = await router.removeLiquidityETH(
            token0IsBase ? token0 : token1, // The non-WETH token
            liquidityToRemove,
            token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount, // Min amount of the token
            token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount, // Min amount of WETH
            walletAddress,
            deadline,
            { gasLimit: 300000 },
          );
        } else {
          // Remove liquidity Token + Token
          tx = await router.removeLiquidity(
            token0,
            token1,
            liquidityToRemove,
            token0IsBase ? baseTokenMinAmount : quoteTokenMinAmount, // Min amount of token0
            token0IsBase ? quoteTokenMinAmount : baseTokenMinAmount, // Min amount of token1
            walletAddress,
            deadline,
            { gasLimit: 300000 },
          );
        }

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Format amounts for response
        const baseTokenAmountRemoved = formatTokenAmount(
          expectedBaseTokenAmount.toString(),
          baseTokenObj.decimals,
        );

        const quoteTokenAmountRemoved = formatTokenAmount(
          expectedQuoteTokenAmount.toString(),
          quoteTokenObj.decimals,
        );

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        return {
          signature: receipt.transactionHash,
          fee: gasFee,
          baseTokenAmountRemoved,
          quoteTokenAmountRemoved,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError(
          'Failed to remove liquidity',
        );
      }
    },
  );
};

export default removeLiquidityRoute;
