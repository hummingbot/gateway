import { Contract } from '@ethersproject/contracts';
import { CurrencyAmount, Percent } from '@pancakeswap/sdk';
import { Position, NonfungiblePositionManager } from '@pancakeswap/v3-sdk';
import { Static } from '@sinclair/typebox';
import { BigNumber, utils } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { getPancakeswapV3NftManagerAddress, POSITION_MANAGER_ABI } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';
import { PancakeswapClmmAddLiquidityRequest } from '../schemas';

// Default gas limit for CLMM add liquidity operations
const CLMM_ADD_LIQUIDITY_GAS_LIMIT = 600000;

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof PancakeswapClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing Pancakeswap V3 position',
        tags: ['/connector/pancakeswap'],
        body: PancakeswapClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress: requestedWalletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          gasPrice,
          maxGas,
        } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (!positionAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Pancakeswap and Ethereum instances
        const pancakeswap = await Pancakeswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await pancakeswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get position manager address
        const positionManagerAddress = getPancakeswapV3NftManagerAddress(networkToUse);

        // Create position manager contract
        const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

        // Get position details
        const position = await positionManager.positions(positionAddress);

        // Get tokens by address
        const token0 = pancakeswap.getTokenByAddress(position.token0);
        const token1 = pancakeswap.getTokenByAddress(position.token1);
        const fee = position.fee;
        const tickLower = position.tickLower;
        const tickUpper = position.tickUpper;

        // Get the pool
        const pool = await pancakeswap.getV3Pool(token0, token1, fee);
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found for position');
        }

        // Calculate slippage tolerance
        // Convert slippagePct to integer basis points (0.5% -> 50 basis points)
        const slippageTolerance = new Percent(Math.floor((slippagePct ?? pancakeswap.config.slippagePct) * 100), 10000);

        // Determine base and quote tokens
        const baseTokenSymbol = token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
        const isBaseToken0 = token0.symbol === baseTokenSymbol;

        // Calculate token amounts to add
        let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
        let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);

        if (baseTokenAmount !== undefined) {
          // Convert baseTokenAmount to raw amount
          const baseAmountRaw = Math.floor(
            baseTokenAmount * Math.pow(10, isBaseToken0 ? token0.decimals : token1.decimals),
          );

          if (isBaseToken0) {
            token0Amount = CurrencyAmount.fromRawAmount(token0, baseAmountRaw.toString());
          } else {
            token1Amount = CurrencyAmount.fromRawAmount(token1, baseAmountRaw.toString());
          }
        }

        if (quoteTokenAmount !== undefined) {
          // Convert quoteTokenAmount to raw amount
          const quoteAmountRaw = Math.floor(
            quoteTokenAmount * Math.pow(10, isBaseToken0 ? token1.decimals : token0.decimals),
          );

          if (isBaseToken0) {
            token1Amount = CurrencyAmount.fromRawAmount(token1, quoteAmountRaw.toString());
          } else {
            token0Amount = CurrencyAmount.fromRawAmount(token0, quoteAmountRaw.toString());
          }
        }

        // Create a new Position to represent the added liquidity
        const newPosition = Position.fromAmounts({
          pool,
          tickLower,
          tickUpper,
          amount0: token0Amount.quotient,
          amount1: token1Amount.quotient,
          useFullPrecision: true,
        });

        // Create increase liquidity options
        const increaseLiquidityOptions = {
          tokenId: positionAddress,
          slippageTolerance,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
        };

        // Get calldata for increasing liquidity
        const { calldata, value } = NonfungiblePositionManager.addCallParameters(newPosition, increaseLiquidityOptions);

        // Check allowances instead of approving
        // Check token0 allowance if needed
        if (!token0Amount.equalTo(0) && token0.symbol !== 'WETH') {
          const token0Contract = ethereum.getContract(token0.address, wallet);
          const allowance0 = await ethereum.getERC20Allowance(
            token0Contract,
            wallet,
            positionManagerAddress,
            token0.decimals,
          );

          const currentAllowance0 = BigNumber.from(allowance0.value);
          const requiredAmount0 = BigNumber.from(token0Amount.quotient.toString());

          if (currentAllowance0.lt(requiredAmount0)) {
            throw fastify.httpErrors.badRequest(
              `Insufficient ${token0.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)} ${token0.symbol} for the Position Manager (${positionManagerAddress})`,
            );
          }
        }

        // Check token1 allowance if needed
        if (!token1Amount.equalTo(0) && token1.symbol !== 'WETH') {
          const token1Contract = ethereum.getContract(token1.address, wallet);
          const allowance1 = await ethereum.getERC20Allowance(
            token1Contract,
            wallet,
            positionManagerAddress,
            token1.decimals,
          );

          const currentAllowance1 = BigNumber.from(allowance1.value);
          const requiredAmount1 = BigNumber.from(token1Amount.quotient.toString());

          if (currentAllowance1.lt(requiredAmount1)) {
            throw fastify.httpErrors.badRequest(
              `Insufficient ${token1.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount1.toString(), token1.decimals)} ${token1.symbol} for the Position Manager (${positionManagerAddress})`,
            );
          }
        }

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

        // Execute the transaction to increase liquidity
        // Use Ethereum's prepareGasOptions method
        const gasPriceGwei = gasPrice ? parseFloat(utils.formatUnits(gasPrice, 'gwei')) : undefined;
        const txParams = await ethereum.prepareGasOptions(gasPriceGwei, maxGas || CLMM_ADD_LIQUIDITY_GAS_LIMIT);
        txParams.value = BigNumber.from(value.toString());

        const tx = await positionManagerWithSigner.multicall([calldata], txParams);

        // Wait for transaction confirmation
        const receipt = await ethereum.handleTransactionExecution(tx);

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // Calculate actual token amounts added from the position's mint amounts
        const actualToken0Amount = formatTokenAmount(newPosition.mintAmounts.amount0.toString(), token0.decimals);

        const actualToken1Amount = formatTokenAmount(newPosition.mintAmounts.amount1.toString(), token1.decimals);

        // Map back to base and quote amounts
        const actualBaseAmount = isBaseToken0 ? actualToken0Amount : actualToken1Amount;
        const actualQuoteAmount = isBaseToken0 ? actualToken1Amount : actualToken0Amount;

        return {
          signature: receipt.transactionHash,
          status: receipt.status,
          data: {
            fee: gasFee,
            baseTokenAmountAdded: actualBaseAmount,
            quoteTokenAmountAdded: actualQuoteAmount,
          },
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
