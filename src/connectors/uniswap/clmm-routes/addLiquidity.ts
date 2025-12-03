import { Contract } from '@ethersproject/contracts';
import { Static } from '@sinclair/typebox';
import { CurrencyAmount, Percent } from '@uniswap/sdk-core';
import { Position, NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import JSBI from 'jsbi';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import { AddLiquidityResponseType, AddLiquidityResponse } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { UniswapClmmAddLiquidityRequest } from '../schemas';
import { Uniswap } from '../uniswap';
import { UniswapConfig } from '../uniswap.config';
import { getUniswapV3NftManagerAddress, POSITION_MANAGER_ABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

// Default gas limit for CLMM add liquidity operations
const CLMM_ADD_LIQUIDITY_GAS_LIMIT = 600000;

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = UniswapConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  if (!positionAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  const uniswap = await Uniswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  const positionManagerAddress = getUniswapV3NftManagerAddress(network);
  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const position = await positionManager.positions(positionAddress);

  const token0 = await uniswap.getToken(position.token0);
  const token1 = await uniswap.getToken(position.token1);
  const fee = position.fee;
  const tickLower = position.tickLower;
  const tickUpper = position.tickUpper;

  const pool = await uniswap.getV3Pool(token0, token1, fee);
  if (!pool) {
    throw httpErrors.notFound('Pool not found for position');
  }

  const slippageTolerance = new Percent(Math.floor(slippagePct * 100), 10000);

  const baseTokenSymbol = token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
  const isBaseToken0 = token0.symbol === baseTokenSymbol;

  let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
  let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);

  if (baseTokenAmount !== undefined) {
    const baseAmountRaw = Math.floor(baseTokenAmount * Math.pow(10, isBaseToken0 ? token0.decimals : token1.decimals));
    if (isBaseToken0) {
      token0Amount = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(baseAmountRaw.toString()));
    } else {
      token1Amount = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(baseAmountRaw.toString()));
    }
  }

  if (quoteTokenAmount !== undefined) {
    const quoteAmountRaw = Math.floor(
      quoteTokenAmount * Math.pow(10, isBaseToken0 ? token1.decimals : token0.decimals),
    );
    if (isBaseToken0) {
      token1Amount = CurrencyAmount.fromRawAmount(token1, JSBI.BigInt(quoteAmountRaw.toString()));
    } else {
      token0Amount = CurrencyAmount.fromRawAmount(token0, JSBI.BigInt(quoteAmountRaw.toString()));
    }
  }

  const newPosition = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: token0Amount.quotient,
    amount1: token1Amount.quotient,
    useFullPrecision: true,
  });

  const increaseLiquidityOptions = {
    tokenId: positionAddress,
    slippageTolerance,
    deadline: Math.floor(Date.now() / 1000) + 60 * 20,
  };

  const { calldata, value } = NonfungiblePositionManager.addCallParameters(newPosition, increaseLiquidityOptions);

  // Check allowances
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
      throw httpErrors.badRequest(
        `Insufficient ${token0.symbol} allowance. Please approve at least ${formatTokenAmount(requiredAmount0.toString(), token0.decimals)} ${token0.symbol} for the Position Manager (${positionManagerAddress})`,
      );
    }
  }

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
  fastify.post<{
    Body: Static<typeof UniswapClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing Uniswap V3 position',
        tags: ['/connector/uniswap'],
        body: UniswapClmmAddLiquidityRequest,
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
          const uniswap = await Uniswap.getInstance(network);
          walletAddress = await uniswap.getFirstWalletAddress();
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
