import { Contract } from '@ethersproject/contracts';
import { Token, CurrencyAmount, Percent } from '@uniswap/sdk-core';
import {
  Position,
  Pool as V3Pool,
  NonfungiblePositionManager,
  MintOptions,
  nearestUsableTick,
  tickToPrice,
  priceToClosestTick,
  FeeAmount,
} from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  OpenPositionRequestType,
  OpenPositionRequest,
  OpenPositionResponseType,
  OpenPositionResponse,
} from '../../../schemas/trading-types/clmm-schema';
import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { formatTokenAmount, parseFeeTier } from '../uniswap.utils';

// Define a minimal ABI for ERC20 tokens
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export const openPositionRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.post<{
    Body: OpenPositionRequestType;
    Reply: OpenPositionResponseType;
  }>(
    '/open-position',
    {
      schema: {
        description: 'Open a new liquidity position in a Uniswap V3 pool',
        tags: ['uniswap/clmm'],
        body: {
          ...OpenPositionRequest,
          properties: {
            ...OpenPositionRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
            lowerPrice: { type: 'number', examples: [1500] },
            upperPrice: { type: 'number', examples: [2000] },
            poolAddress: { type: 'string', examples: [''] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            baseTokenAmount: { type: 'number', examples: [0.001] },
            quoteTokenAmount: { type: 'number', examples: [2] },
            slippagePct: { type: 'number', examples: [0.5] },
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
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        } = request.body;

        const networkToUse = network || 'base';

        // Validate essential parameters
        if (
          !lowerPrice ||
          !upperPrice ||
          !baseToken ||
          !quoteToken ||
          (baseTokenAmount === undefined && quoteTokenAmount === undefined)
        ) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
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

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'clmm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No CLMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get the V3 pool
        const pool = await uniswap.getV3Pool(
          baseTokenObj,
          quoteTokenObj,
          undefined,
          poolAddress,
        );
        if (!pool) {
          throw fastify.httpErrors.notFound(
            `Pool not found for ${baseToken}-${quoteToken}`,
          );
        }

        // Calculate slippage tolerance
        // Convert slippagePct to integer basis points (0.5% -> 50 basis points)
        const slippageTolerance =
          slippagePct !== undefined
            ? new Percent(Math.floor(slippagePct * 100), 10000)
            : uniswap.getAllowedSlippage();

        // Convert price range to ticks
        // In Uniswap, ticks are log base 1.0001 of price
        // We need to convert the user's desired price range to tick range
        const token0 = pool.token0;
        const token1 = pool.token1;

        // Determine if we need to invert the price depending on which token is token0
        const isBaseToken0 =
          baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

        // Convert prices to ticks
        let lowerTick, upperTick;

        // For simplicity, we'll convert the price directly to tick
        // This isn't as accurate as using the SDK's methods, but it works for demonstration
        const getTickAtSqrtRatio = (price: number): number => {
          return Math.log(Math.sqrt(price)) / Math.log(Math.sqrt(1.0001));
        };

        if (isBaseToken0) {
          // If base token is token0, prices are in quote/base
          lowerTick = Math.floor(getTickAtSqrtRatio(lowerPrice));
          upperTick = Math.ceil(getTickAtSqrtRatio(upperPrice));
        } else {
          // If base token is token1, prices are in base/quote
          lowerTick = Math.floor(getTickAtSqrtRatio(1 / upperPrice));
          upperTick = Math.ceil(getTickAtSqrtRatio(1 / lowerPrice));
        }

        // Ensure ticks are on valid tick spacing boundaries
        const tickSpacing = pool.tickSpacing;
        lowerTick = nearestUsableTick(lowerTick, tickSpacing);
        upperTick = nearestUsableTick(upperTick, tickSpacing);

        // Ensure lower < upper
        if (lowerTick >= upperTick) {
          throw fastify.httpErrors.badRequest(
            'Lower price must be less than upper price',
          );
        }

        // Calculate token amounts for the position
        let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
        let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);

        if (baseTokenAmount !== undefined) {
          // Convert baseTokenAmount to raw amount
          const baseAmountRaw = Math.floor(
            baseTokenAmount * Math.pow(10, baseTokenObj.decimals),
          );

          if (isBaseToken0) {
            token0Amount = CurrencyAmount.fromRawAmount(
              token0,
              JSBI.BigInt(baseAmountRaw.toString()),
            );
          } else {
            token1Amount = CurrencyAmount.fromRawAmount(
              token1,
              JSBI.BigInt(baseAmountRaw.toString()),
            );
          }
        }

        if (quoteTokenAmount !== undefined) {
          // Convert quoteTokenAmount to raw amount
          const quoteAmountRaw = Math.floor(
            quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals),
          );

          if (isBaseToken0) {
            token1Amount = CurrencyAmount.fromRawAmount(
              token1,
              JSBI.BigInt(quoteAmountRaw.toString()),
            );
          } else {
            token0Amount = CurrencyAmount.fromRawAmount(
              token0,
              JSBI.BigInt(quoteAmountRaw.toString()),
            );
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
        const { calldata, value } =
          NonfungiblePositionManager.addCallParameters(position, mintOptions);

        // Approve NFT manager to use tokens
        const positionManagerAddress =
          uniswap.config.uniswapV3NftManagerAddress(networkToUse);

        // Approve token0 if needed
        if (!token0Amount.equalTo(0) && token0.symbol !== 'WETH') {
          const token0Contract = new Contract(
            token0.address,
            ERC20_ABI,
            wallet,
          );

          const approvalTx0 = await token0Contract.approve(
            positionManagerAddress,
            token0Amount.quotient.toString(),
          );

          await approvalTx0.wait();
        }

        // Approve token1 if needed
        if (!token1Amount.equalTo(0) && token1.symbol !== 'WETH') {
          const token1Contract = new Contract(
            token1.address,
            ERC20_ABI,
            wallet,
          );

          const approvalTx1 = await token1Contract.approve(
            positionManagerAddress,
            token1Amount.quotient.toString(),
          );

          await approvalTx1.wait();
        }

        // Create position manager contract
        const positionManager = new Contract(
          positionManagerAddress,
          [
            {
              inputs: [{ internalType: 'bytes', name: 'data', type: 'bytes' }],
              name: 'multicall',
              outputs: [
                { internalType: 'bytes[]', name: 'results', type: 'bytes[]' },
              ],
              stateMutability: 'payable',
              type: 'function',
            },
          ],
          wallet,
        );

        // Create the position
        const tx = await positionManager.multicall(JSON.parse(calldata), {
          value: BigNumber.from(value.toString()),
          gasLimit: 500000, // Opening a position can be gas-heavy
        });

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Find the NFT ID from the transaction logs
        let positionId = '';
        for (const log of receipt.logs) {
          // Look for the Transfer event from the NFT manager (position created)
          if (
            log.address.toLowerCase() ===
              positionManagerAddress.toLowerCase() &&
            log.topics[0] ===
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
            log.topics[1] ===
              '0x0000000000000000000000000000000000000000000000000000000000000000'
          ) {
            // This is a Transfer from address 0, which is a mint
            positionId = BigNumber.from(log.topics[3]).toString();
            break;
          }
        }

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // For position rent, we're using the estimated gas cost since Ethereum doesn't have rent like Solana
        const positionRent = 0;

        // Calculate actual token amounts added based on position
        const actualToken0Amount = formatTokenAmount(
          position.amount0.quotient.toString(),
          token0.decimals,
        );

        const actualToken1Amount = formatTokenAmount(
          position.amount1.quotient.toString(),
          token1.decimals,
        );

        // Map back to base and quote amounts
        const actualBaseAmount = isBaseToken0
          ? actualToken0Amount
          : actualToken1Amount;
        const actualQuoteAmount = isBaseToken0
          ? actualToken1Amount
          : actualToken0Amount;

        return {
          signature: receipt.transactionHash,
          fee: gasFee,
          positionAddress: positionId,
          positionRent,
          baseTokenAmountAdded: actualBaseAmount,
          quoteTokenAmountAdded: actualQuoteAmount,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to open position');
      }
    },
  );
};

export default openPositionRoute;
