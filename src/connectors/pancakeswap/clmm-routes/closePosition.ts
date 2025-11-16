import { Contract } from '@ethersproject/contracts';
import { Percent, CurrencyAmount } from '@pancakeswap/sdk';
import { NonfungiblePositionManager, Position } from '@pancakeswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import { Address } from 'viem';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  ClosePositionRequestType,
  ClosePositionRequest,
  ClosePositionResponseType,
  ClosePositionResponse,
} from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { POSITION_MANAGER_ABI, getPancakeswapV3NftManagerAddress } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM close position operations
const CLMM_CLOSE_POSITION_GAS_LIMIT = 400000;

export async function closePosition(
  fastify: FastifyInstance,
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<ClosePositionResponseType> {
  if (!positionAddress) {
    throw fastify.httpErrors.badRequest('Missing required parameters');
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

  if (currentLiquidity.isZero() && position.tokensOwed0.isZero() && position.tokensOwed1.isZero()) {
    throw fastify.httpErrors.badRequest('Position has already been closed or has no liquidity/fees to collect');
  }

  const feeAmount0 = position.tokensOwed0;
  const feeAmount1 = position.tokensOwed1;

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

  const amount0 = positionSDK.amount0;
  const amount1 = positionSDK.amount1;

  const slippageTolerance = new Percent(100, 10000);

  const totalAmount0 = CurrencyAmount.fromRawAmount(token0, BigInt(amount0.quotient) + BigInt(feeAmount0.toString()));
  const totalAmount1 = CurrencyAmount.fromRawAmount(token1, BigInt(amount1.quotient) + BigInt(feeAmount1.toString()));

  const removeParams = {
    tokenId: positionAddress,
    liquidityPercentage: new Percent(10000, 10000),
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    burnToken: true,
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

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_CLOSE_POSITION_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());
  const tx = await positionManagerWithSigner.multicall([calldata], txParams);
  const receipt = await ethereum.handleTransactionExecution(tx);

  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);
  const token0AmountRemoved = formatTokenAmount(totalAmount0.quotient.toString(), token0.decimals);
  const token1AmountRemoved = formatTokenAmount(totalAmount1.quotient.toString(), token1.decimals);

  const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
  const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

  const baseTokenAmountRemoved = isBaseToken0 ? token0AmountRemoved : token1AmountRemoved;
  const quoteTokenAmountRemoved = isBaseToken0 ? token1AmountRemoved : token0AmountRemoved;

  const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

  const positionRentRefunded = 0;

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      positionRentRefunded,
      baseTokenAmountRemoved,
      quoteTokenAmountRemoved,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}

export const closePositionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: ClosePositionRequestType;
    Reply: ClosePositionResponseType;
  }>(
    '/close-position',
    {
      schema: {
        description: 'Close a Pancakeswap V3 position by removing all liquidity and collecting fees',
        tags: ['/connector/pancakeswap'],
        body: ClosePositionRequest,
        response: {
          200: ClosePositionResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, walletAddress: requestedWalletAddress, positionAddress } = request.body;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const pancakeswap = await Pancakeswap.getInstance(network);
          walletAddress = await pancakeswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        return await closePosition(fastify, network, walletAddress, positionAddress);
      } catch (e: any) {
        logger.error('Failed to close position:', e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to close position');
      }
    },
  );
};

export default closePositionRoute;
