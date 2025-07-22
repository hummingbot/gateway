import { CurrencyAmount, Percent } from '@_etcswap/sdk-core';
import { Position, NonfungiblePositionManager, MintOptions, nearestUsableTick } from '@_etcswap/v3-sdk';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  OpenPositionRequestType,
  OpenPositionRequest,
  OpenPositionResponseType,
  OpenPositionResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { ETCSwap } from '../etcSwap';
import { getETCSwapV3NftManagerAddress } from '../etcSwap.contracts';
import { formatTokenAmount, getETCSwapPoolInfo } from '../etcSwap.utils';

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: OpenPositionRequestType;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new liquidity position in a ETCSwap V3 pool',
        tags: ['/connector/etcSwap'],
        body: {
          ...OpenPositionRequest,
          properties: {
            ...OpenPositionRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            lowerPrice: { type: 'number', examples: [1000] },
            upperPrice: { type: 'number', examples: [4000] },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['WETC'] },
            quoteToken: { type: 'string', examples: ['USC'] },
            baseTokenAmount: { type: 'number', examples: [0.001] },
            quoteTokenAmount: { type: 'number', examples: [3] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
        response: {
          200: OpenPositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          walletAddress: requestedWalletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          priorityFeePerCU,
          computeUnits,
        } = request.body;

        const networkToUse = network;

        // Validate essential parameters
        if (
          !lowerPrice ||
          !upperPrice ||
          !poolAddress ||
          (baseTokenAmount === undefined && quoteTokenAmount === undefined)
        ) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get ETCSwap and Ethereum instances
        const etcSwap = await ETCSwap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await etcSwap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get pool information to determine tokens
        const poolInfo = await getETCSwapPoolInfo(poolAddress, networkToUse, 'clmm');
        if (!poolInfo) {
          throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
        }

        const baseTokenObj = etcSwap.getTokenByAddress(poolInfo.baseTokenAddress);
        const quoteTokenObj = etcSwap.getTokenByAddress(poolInfo.quoteTokenAddress);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest('Token information not found for pool');
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get the V3 pool
        const pool = await etcSwap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
        if (!pool) {
          throw fastify.httpErrors.notFound(`Pool not found for ${baseTokenObj.symbol}-${quoteTokenObj.symbol}`);
        }

        // Calculate slippage tolerance
        // Convert slippagePct to integer basis points (0.5% -> 50 basis points)
        const slippageTolerance = new Percent(Math.floor((slippagePct ?? etcSwap.config.slippagePct) * 100), 10000);

        // Convert price range to ticks
        // In ETCSwap, ticks are log base 1.0001 of price
        // We need to convert the user's desired price range to tick range
        const token0 = pool.token0;
        const token1 = pool.token1;

        // Determine if we need to invert the price depending on which token is token0
        const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

        // Convert prices to ticks
        let lowerTick, upperTick;

        // IMPORTANT: Ticks represent prices in RAW TOKEN UNITS, not human-readable prices
        // For WETC (18 decimals) and USC (6 decimals), we need to adjust for the decimal difference
        const priceToTickWithDecimals = (humanPrice: number): number => {
          // Convert human price (USC per WETC) to raw price (USC units per WETC unit)
          const rawPrice = humanPrice * Math.pow(10, token1.decimals - token0.decimals);
          return Math.floor(Math.log(rawPrice) / Math.log(1.0001));
        };

        lowerTick = priceToTickWithDecimals(lowerPrice);
        upperTick = priceToTickWithDecimals(upperPrice);

        logger.info(`Calculated ticks - Lower: ${lowerTick}, Upper: ${upperTick}`);
        logger.info(`Current pool tick: ${pool.tickCurrent}`);

        // Ensure ticks are on valid tick spacing boundaries
        const tickSpacing = pool.tickSpacing;
        lowerTick = nearestUsableTick(lowerTick, tickSpacing);
        upperTick = nearestUsableTick(upperTick, tickSpacing);

        // Ensure lower < upper
        if (lowerTick >= upperTick) {
          throw fastify.httpErrors.badRequest('Lower price must be less than upper price');
        }

        // Calculate token amounts for the position
        let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
        let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);

        if (baseTokenAmount !== undefined) {
          // Convert baseTokenAmount to raw amount
          const baseAmountRaw = Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals));

          if (isBaseToken0) {
            token0Amount = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(baseAmountRaw.toString()));
          } else {
            token1Amount = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(baseAmountRaw.toString()));
          }
        }

        if (quoteTokenAmount !== undefined) {
          // Convert quoteTokenAmount to raw amount
          const quoteAmountRaw = Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals));

          if (isBaseToken0) {
            token1Amount = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(quoteAmountRaw.toString()));
          } else {
            token0Amount = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(quoteAmountRaw.toString()));
          }
        }

        // Create the position
        const position = Position.fromAmounts({
          pool,
          tickLower: lowerTick,
          tickUpper: upperTick,
          amount0: token0Amount.quotient,
          amount1: token1Amount.quotient,
          useFullPrecision: true,
        });

        // Get the mintOptions for creating the position
        const mintOptions: MintOptions = {
          recipient: walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
          slippageTolerance,
        };

        // Get the calldata for creating the position
        logger.info('Creating position with parameters:');
        logger.info(`  Token0: ${token0.symbol} (${token0.address})`);
        logger.info(`  Token1: ${token1.symbol} (${token1.address})`);
        logger.info(`  Fee: ${pool.fee}`);
        logger.info(`  Tick Lower: ${lowerTick}`);
        logger.info(`  Tick Upper: ${upperTick}`);
        logger.info(`  Amount0: ${position.amount0.toSignificant(18)}`);
        logger.info(`  Amount1: ${position.amount1.toSignificant(18)}`);
        logger.info(`  Liquidity: ${position.liquidity.toString()}`);

        const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, mintOptions);

        logger.info(`  Value (ETC): ${value}`);
        logger.info(`  Recipient: ${walletAddress}`);
        logger.info(`  Deadline: ${mintOptions.deadline}`);

        // Get position manager address for allowance checks
        const positionManagerAddress = getETCSwapV3NftManagerAddress(networkToUse);

        // Check token0 allowance if needed (including WETC)
        if (!token0Amount.equalTo(0)) {
          const token0Contract = ethereum.getContract(token0.address, wallet);
          const allowance0 = await ethereum.getERC20Allowance(
            token0Contract,
            wallet,
            positionManagerAddress,
            token0.decimals,
          );

          const currentAllowance0 = BigNumber.from(allowance0.value);
          const requiredAmount0 = BigNumber.from(token0Amount.quotient.toString());

          logger.info(
            `${token0.symbol} allowance: ${formatTokenAmount(currentAllowance0.toString(), token0.decimals)}`,
          );
          logger.info(`${token0.symbol} required: ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)}`);

          if (currentAllowance0.lt(requiredAmount0)) {
            throw fastify.httpErrors.badRequest(
              `Insufficient ${token0.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)} ${token0.symbol} (${token0.address}) for the Position Manager (${positionManagerAddress})`,
            );
          }
        }

        // Check token1 allowance if needed (including WETC)
        if (!token1Amount.equalTo(0)) {
          const token1Contract = ethereum.getContract(token1.address, wallet);
          const allowance1 = await ethereum.getERC20Allowance(
            token1Contract,
            wallet,
            positionManagerAddress,
            token1.decimals,
          );

          const currentAllowance1 = BigNumber.from(allowance1.value);
          const requiredAmount1 = BigNumber.from(token1Amount.quotient.toString());

          logger.info(
            `${token1.symbol} allowance: ${formatTokenAmount(currentAllowance1.toString(), token1.decimals)}`,
          );
          logger.info(`${token1.symbol} required: ${formatTokenAmount(requiredAmount1.toString(), token1.decimals)}`);

          if (currentAllowance1.lt(requiredAmount1)) {
            throw fastify.httpErrors.badRequest(
              `Insufficient ${token1.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount1.toString(), token1.decimals)} ${token1.symbol} (${token1.address}) for the Position Manager (${positionManagerAddress})`,
            );
          }
        }

        // Create position manager contract with proper multicall interface
        const positionManager = new Contract(
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

        // Create the position
        logger.info('Sending transaction to create position...');
        logger.info(`Calldata length: ${calldata.length}`);
        logger.info(`Value: ${value.toString()}`);

        let tx;
        try {
          // Use Ethereum's prepareGasOptions method
          const txParams = await ethereum.prepareGasOptions(priorityFeePerCU, computeUnits);
          txParams.value = BigNumber.from(value.toString());

          tx = await positionManager.multicall([calldata], txParams);
        } catch (txError: any) {
          logger.error('Transaction failed:', txError);
          throw txError;
        }

        return {
          signature: tx.hash,
          status: 0, // UNCONFIRMED
          data: undefined,
        };
      } catch (e: any) {
        logger.error('Failed to open position:', e);

        // Log transaction details if available
        if (e.transaction) {
          logger.error('Transaction data:', e.transaction.data);
          logger.error('Transaction to:', e.transaction.to);
        }

        // If error already has statusCode, re-throw it
        if (e.statusCode) {
          throw e;
        }

        // Check for specific error types
        if (e.code === 'CALL_EXCEPTION') {
          // Transaction reverted
          logger.error('Transaction reverted. This could be due to:');
          logger.error('- Insufficient token balance');
          logger.error('- Lack of token approval');
          logger.error('- Invalid tick range');
          logger.error('- Slippage tolerance exceeded');

          throw fastify.httpErrors.badRequest(
            'Transaction failed. Please check token balances, approvals, and position parameters.',
          );
        }

        // Handle insufficient allowance errors
        if (e.message && e.message.includes('Insufficient') && e.message.includes('allowance')) {
          logger.error('Request error:', e);
          throw fastify.httpErrors.badRequest('Invalid request');
        }

        // Handle insufficient funds errors
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest('Insufficient funds to complete the transaction');
        }

        // Generic error
        logger.error('Unexpected error opening position:', e);
        throw fastify.httpErrors.internalServerError('Failed to open position');
      }
    },
  );
};

export default openPositionRoute;
