import { Contract } from '@ethersproject/contracts';
import { CurrencyAmount, Percent } from '@uniswap/sdk-core';
import { Position, NonfungiblePositionManager, MintOptions, nearestUsableTick } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import JSBI from 'jsbi';

// Default gas limit for CLMM open position operations
const CLMM_OPEN_POSITION_GAS_LIMIT = 600000;

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  OpenPositionRequestType,
  OpenPositionRequest,
  OpenPositionResponseType,
  OpenPositionResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { getUniswapV3NftManagerAddress } from '../uniswap.contracts';
import { formatTokenAmount, getUniswapPoolInfo } from '../uniswap.utils';

export async function openPosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  lowerPrice: number,
  upperPrice: number,
  poolAddress: string,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<OpenPositionResponseType> {
  // Validate essential parameters
  if (!lowerPrice || !upperPrice || !poolAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
    throw fastify.httpErrors.badRequest('Missing required parameters');
  }

  // Get Uniswap and Ethereum instances
  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Get pool information to determine tokens
  const poolInfo = await getUniswapPoolInfo(poolAddress, network, 'clmm');
  if (!poolInfo) {
    throw fastify.httpErrors.notFound(sanitizeErrorMessage('Pool not found: {}', poolAddress));
  }

  const baseTokenObj = await uniswap.getToken(poolInfo.baseTokenAddress);
  const quoteTokenObj = await uniswap.getToken(poolInfo.quoteTokenAddress);

  if (!baseTokenObj || !quoteTokenObj) {
    throw fastify.httpErrors.badRequest('Token information not found for pool');
  }

  // Get the wallet
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw fastify.httpErrors.badRequest('Wallet not found');
  }

  // Get the V3 pool
  const pool = await uniswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
  if (!pool) {
    throw fastify.httpErrors.notFound(`Pool not found for ${baseTokenObj.symbol}-${quoteTokenObj.symbol}`);
  }

  // Calculate slippage tolerance
  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

  // Convert price range to ticks
  const token0 = pool.token0;
  const token1 = pool.token1;

  // Determine if we need to invert the price depending on which token is token0
  const isBaseToken0 = baseTokenObj.address.toLowerCase() === token0.address.toLowerCase();

  // Convert prices to ticks
  const priceToTickWithDecimals = (humanPrice: number): number => {
    const rawPrice = humanPrice * Math.pow(10, token1.decimals - token0.decimals);
    return Math.floor(Math.log(rawPrice) / Math.log(1.0001));
  };

  let lowerTick = priceToTickWithDecimals(lowerPrice);
  let upperTick = priceToTickWithDecimals(upperPrice);

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
    const baseAmountRaw = Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals));
    if (isBaseToken0) {
      token0Amount = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(baseAmountRaw.toString()));
    } else {
      token1Amount = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(baseAmountRaw.toString()));
    }
  }

  if (quoteTokenAmount !== undefined) {
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
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
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

  logger.info(`  Value (ETH): ${value}`);
  logger.info(`  Recipient: ${walletAddress}`);
  logger.info(`  Deadline: ${mintOptions.deadline}`);

  // Get position manager address for allowance checks
  const positionManagerAddress = getUniswapV3NftManagerAddress(network);

  // Check token0 allowance if needed (including WETH)
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

    logger.info(`${token0.symbol} allowance: ${formatTokenAmount(currentAllowance0.toString(), token0.decimals)}`);
    logger.info(`${token0.symbol} required: ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)}`);

    if (currentAllowance0.lt(requiredAmount0)) {
      throw fastify.httpErrors.badRequest(
        `Insufficient ${token0.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)} ${token0.symbol} (${token0.address}) for the Position Manager (${positionManagerAddress})`,
      );
    }
  }

  // Check token1 allowance if needed (including WETH)
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

    logger.info(`${token1.symbol} allowance: ${formatTokenAmount(currentAllowance1.toString(), token1.decimals)}`);
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
    const txParams = await ethereum.prepareGasOptions(undefined, CLMM_OPEN_POSITION_GAS_LIMIT);
    txParams.value = BigNumber.from(value.toString());
    tx = await positionManager.multicall([calldata], txParams);
  } catch (txError: any) {
    logger.error('Transaction failed:', txError);
    throw txError;
  }

  // Wait for transaction confirmation
  const receipt = await ethereum.handleTransactionExecution(tx);

  // Find the NFT ID from the transaction logs
  let positionId = '';
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === positionManagerAddress.toLowerCase() &&
      log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' &&
      log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
    ) {
      positionId = BigNumber.from(log.topics[3]).toString();
      break;
    }
  }

  // Calculate gas fee
  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);

  // For position rent, we're using the estimated gas cost since Ethereum doesn't have rent like Solana
  const positionRent = 0;

  // Calculate actual token amounts added based on position
  const actualToken0Amount = formatTokenAmount(position.amount0.quotient.toString(), token0.decimals);
  const actualToken1Amount = formatTokenAmount(position.amount1.quotient.toString(), token1.decimals);

  // Map back to base and quote amounts
  const baseAmountUsed = isBaseToken0 ? actualToken0Amount : actualToken1Amount;
  const quoteAmountUsed = isBaseToken0 ? actualToken1Amount : actualToken0Amount;

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      positionAddress: positionId,
      positionRent,
      baseTokenAmountAdded: baseAmountUsed,
      quoteTokenAmountAdded: quoteAmountUsed,
    },
  };
}

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
        description: 'Open a new liquidity position in a Uniswap V3 pool',
        tags: ['/connector/uniswap'],
        body: {
          ...OpenPositionRequest,
          properties: {
            ...OpenPositionRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            lowerPrice: { type: 'number', examples: [1000] },
            upperPrice: { type: 'number', examples: [4000] },
            poolAddress: { type: 'string', examples: ['0xd0b53d9277642d899df5c87a3966a349a798f224'] },
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
        } = request.body;

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const uniswap = await Uniswap.getInstance(network);
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        return await openPosition(
          fastify,
          network,
          walletAddress,
          lowerPrice,
          upperPrice,
          poolAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Failed to open position:', e);

        // If error already has statusCode, re-throw it
        if (e.statusCode) {
          throw e;
        }

        // Check for specific error types
        if (e.code === 'CALL_EXCEPTION') {
          throw fastify.httpErrors.badRequest(
            'Transaction failed. Please check token balances, approvals, and position parameters.',
          );
        }

        // Handle insufficient funds errors
        if (e.code === 'INSUFFICIENT_FUNDS' || (e.message && e.message.includes('insufficient funds'))) {
          throw fastify.httpErrors.badRequest('Insufficient funds to complete the transaction');
        }

        // Generic error
        throw fastify.httpErrors.internalServerError('Failed to open position');
      }
    },
  );
};

export default openPositionRoute;
