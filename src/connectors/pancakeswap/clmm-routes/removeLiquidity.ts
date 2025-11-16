import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@pancakeswap/sdk';
import { NonfungiblePositionManager, Position } from '@pancakeswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import JSBI from 'jsbi';
import { Address } from 'viem';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  RemoveLiquidityRequestType,
  RemoveLiquidityRequest,
  RemoveLiquidityResponseType,
  RemoveLiquidityResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { POSITION_MANAGER_ABI, getPancakeswapV3NftManagerAddress } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM remove liquidity operations
const CLMM_REMOVE_LIQUIDITY_GAS_LIMIT = 500000;

export async function removeLiquidity(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
): Promise<RemoveLiquidityResponseType> {
  if (!positionAddress || percentageToRemove === undefined) {
    throw fastify.httpErrors.badRequest('Missing required parameters');
  }

  if (percentageToRemove < 0 || percentageToRemove > 100) {
    throw fastify.httpErrors.badRequest('Percentage to remove must be between 0 and 100');
  }

  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw fastify.httpErrors.badRequest('Wallet not found');
  }

  const positionManagerAddress = getPancakeswapV3NftManagerAddress(network);

  try {
    await pancakeswap.checkNFTOwnership(positionAddress, walletAddress);
  } catch (error: any) {
    if (error.message.includes('is not owned by')) {
      throw fastify.httpErrors.forbidden(error.message);
    }
    throw fastify.httpErrors.badRequest(error.message);
  }

  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const position = await positionManager.positions(positionAddress);

  const token0 = await pancakeswap.getToken(position.token0);
  const token1 = await pancakeswap.getToken(position.token1);

  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  const currentLiquidity = position.liquidity;
  const pool = await pancakeswap.getV3Pool(token0, token1, position.fee);
  if (!pool) {
    throw fastify.httpErrors.notFound('Pool not found for position');
  }

  const positionSDK = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: currentLiquidity.toString(),
  });

  const liquidityPercentage = new Percent(Math.floor(percentageToRemove * 100), 10000);
  const partialPosition = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: JSBI.divide(
      JSBI.multiply(JSBI.BigInt(currentLiquidity.toString()), JSBI.BigInt(liquidityPercentage.numerator.toString())),
      JSBI.BigInt(liquidityPercentage.denominator.toString()),
    ).toString(),
  });

  const amount0 = partialPosition.amount0;
  const amount1 = partialPosition.amount1;
  const slippageTolerance = new Percent(100, 10000);

  const totalAmount0 = CurrencyAmount.fromRawAmount(
    token0,
    JSBI.add(JSBI.BigInt(amount0.quotient.toString()), JSBI.BigInt(position.tokensOwed0.toString())).toString(),
  );
  const totalAmount1 = CurrencyAmount.fromRawAmount(
    token1,
    JSBI.add(JSBI.BigInt(amount1.quotient.toString()), JSBI.BigInt(position.tokensOwed1.toString())).toString(),
  );

  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    burnToken: false,
    collectOptions: {
      expectedCurrencyOwed0: totalAmount0,
      expectedCurrencyOwed1: totalAmount1,
      recipient: walletAddress as Address,
    },
  };

  const { calldata, value } = NonfungiblePositionManager.removeCallParameters(positionSDK, removeParams);

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

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_REMOVE_LIQUIDITY_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());
  const tx = await positionManagerWithSigner.multicall([calldata], txParams);
  const receipt = await ethereum.handleTransactionExecution(tx);

  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);
  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
    },
  };
}

export const removeLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));

  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: RemoveLiquidityRequestType;
    Reply: RemoveLiquidityResponseType;
  }>(
    '/remove-liquidity',
    {
      schema: {
        description: 'Remove liquidity from a Pancakeswap V3 position',
        tags: ['/connector/pancakeswap'],
        body: {
          ...RemoveLiquidityRequest,
          properties: {
            ...RemoveLiquidityRequest.properties,
            network: { type: 'string', default: 'bsc', examples: ['bsc'] },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
              examples: ['1234'],
            },
            percentageToRemove: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              examples: [50],
            },
          },
        },
        response: {
          200: RemoveLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress: requestedWalletAddress, positionAddress, percentageToRemove } = request.body;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const pancakeswap = await Pancakeswap.getInstance(network);
          walletAddress = await pancakeswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        return await removeLiquidity(fastify, network, walletAddress, positionAddress, percentageToRemove);
      } catch (e: any) {
        logger.error('Failed to remove liquidity:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to remove liquidity');
      }
    },
  );
};

export default removeLiquidityRoute;
