import { Contract } from '@ethersproject/contracts';
import { Percent } from '@uniswap/sdk-core';
import { Position, NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { ETCswap } from '../etcswap';
import { ETCswapConfig } from '../etcswap.config';
import { getETCswapV3NftManagerAddress, POSITION_MANAGER_ABI } from '../etcswap.contracts';
import { formatTokenAmount, toUniswapPool } from '../etcswap.utils';
import { ETCswapClmmAddLiquidityRequest } from '../schemas';

// Default gas limit for CLMM add liquidity operations
const CLMM_ADD_LIQUIDITY_GAS_LIMIT = 600000;

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = ETCswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  if (!positionAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  const etcswap = await ETCswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);

  // Check if V3 is available
  if (!etcswap.hasV3()) {
    throw httpErrors.badRequest(`V3 CLMM is not available on network: ${network}`);
  }

  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  const positionManagerAddress = getETCswapV3NftManagerAddress(network);
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const position = await positionManager.positions(positionAddress);

  const token0 = await etcswap.getToken(position.token0);
  const token1 = await etcswap.getToken(position.token1);

  if (!token0 || !token1) {
    throw httpErrors.badRequest('Token information not found for position');
  }

  const fee = position.fee;
  const tickLower = position.tickLower;
  const tickUpper = position.tickUpper;

  const etcswapPool = await etcswap.getV3Pool(token0, token1, fee);
  if (!etcswapPool) {
    throw httpErrors.notFound('Pool not found for position');
  }

  // Convert to Uniswap Pool for position management
  const pool = toUniswapPool(etcswapPool);

  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

  // Determine base token - WETC or lower address is base
  const isBaseToken0 =
    token0.symbol === 'WETC' ||
    (token1.symbol !== 'WETC' && token0.address.toLowerCase() < token1.address.toLowerCase());

  let amount0Raw = JSBI.BigInt(0);
  let amount1Raw = JSBI.BigInt(0);

  if (baseTokenAmount !== undefined) {
    const baseAmountRaw = Math.floor(baseTokenAmount * Math.pow(10, isBaseToken0 ? token0.decimals : token1.decimals));
    if (isBaseToken0) {
      amount0Raw = JSBI.BigInt(baseAmountRaw.toString());
    } else {
      amount1Raw = JSBI.BigInt(baseAmountRaw.toString());
    }
  }

  if (quoteTokenAmount !== undefined) {
    const quoteAmountRaw = Math.floor(
      quoteTokenAmount * Math.pow(10, isBaseToken0 ? token1.decimals : token0.decimals),
    );
    if (isBaseToken0) {
      amount1Raw = JSBI.BigInt(quoteAmountRaw.toString());
    } else {
      amount0Raw = JSBI.BigInt(quoteAmountRaw.toString());
    }
  }

  const newPosition = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: amount0Raw,
    amount1: amount1Raw,
    useFullPrecision: true,
  });

  const increaseLiquidityOptions = {
    tokenId: positionAddress,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
  };

  const { calldata, value } = NonfungiblePositionManager.addCallParameters(newPosition, increaseLiquidityOptions);

  // Check allowances
  if (!JSBI.equal(amount0Raw, JSBI.BigInt(0)) && token0.symbol !== 'WETC') {
    const token0Contract = ethereum.getContract(token0.address, wallet);
    const allowance0 = await ethereum.getERC20Allowance(
      token0Contract,
      wallet,
      positionManagerAddress,
      token0.decimals,
    );
    const currentAllowance0 = BigNumber.from(allowance0.value);
    const requiredAmount0 = BigNumber.from(amount0Raw.toString());

    if (currentAllowance0.lt(requiredAmount0)) {
      throw httpErrors.badRequest(
        `Insufficient ${token0.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)} ${token0.symbol} for the Position Manager (${positionManagerAddress})`,
      );
    }
  }

  if (!JSBI.equal(amount1Raw, JSBI.BigInt(0)) && token1.symbol !== 'WETC') {
    const token1Contract = ethereum.getContract(token1.address, wallet);
    const allowance1 = await ethereum.getERC20Allowance(
      token1Contract,
      wallet,
      positionManagerAddress,
      token1.decimals,
    );
    const currentAllowance1 = BigNumber.from(allowance1.value);
    const requiredAmount1 = BigNumber.from(amount1Raw.toString());

    if (currentAllowance1.lt(requiredAmount1)) {
      throw httpErrors.badRequest(
        `Insufficient ${token1.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount1.toString(), token1.decimals)} ${token1.symbol} for the Position Manager (${positionManagerAddress})`,
      );
    }
  }

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

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_ADD_LIQUIDITY_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());
  const tx = await positionManagerWithSigner.multicall([calldata], txParams);
  const receipt = await ethereum.handleTransactionExecution(tx);

  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);
  const actualToken0Amount = formatTokenAmount(newPosition.mintAmounts.amount0.toString(), token0.decimals);
  const actualToken1Amount = formatTokenAmount(newPosition.mintAmounts.amount1.toString(), token1.decimals);

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
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: typeof ETCswapClmmAddLiquidityRequest.static;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing ETCswap V3 position',
        tags: ['/connector/etcswap'],
        body: {
          ...ETCswapClmmAddLiquidityRequest,
          properties: {
            ...ETCswapClmmAddLiquidityRequest.properties,
            network: { type: 'string', default: 'classic' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: { type: 'string', examples: ['1234'] },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [10] },
            slippagePct: { type: 'number', examples: [1] },
          },
        },
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
        } = request.body;

        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          const etcswap = await ETCswap.getInstance(network);
          walletAddress = await etcswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        return await addLiquidity(
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
        );
      } catch (e: any) {
        logger.error('Failed to add liquidity:', e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to add liquidity');
      }
    },
  );
};

export default addLiquidityRoute;
