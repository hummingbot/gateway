import { Contract } from '@ethersproject/contracts';
import { CurrencyAmount } from '@pancakeswap/sdk';
import { NonfungiblePositionManager } from '@pancakeswap/v3-sdk';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';
import { Address } from 'viem';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  CollectFeesRequestType,
  CollectFeesRequest,
  CollectFeesResponseType,
  CollectFeesResponse,
} from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { POSITION_MANAGER_ABI, getPancakeswapV3NftManagerAddress } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM collect fees operations
const CLMM_COLLECT_FEES_GAS_LIMIT = 200000;

export async function collectFees(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  if (!positionAddress) {
    throw httpErrors.badRequest('Missing required parameters');
  }

  const pancakeswap = await Pancakeswap.getInstance(network);
  const ethereum = await Ethereum.getInstance(network);
  const wallet = await ethereum.getWallet(walletAddress);
  if (!wallet) {
    throw httpErrors.badRequest('Wallet not found');
  }

  const positionManagerAddress = getPancakeswapV3NftManagerAddress(network);

  try {
    await pancakeswap.checkNFTOwnership(positionAddress, walletAddress);
  } catch (error: any) {
    if (error.message.includes('is not owned by')) {
      throw httpErrors.forbidden(error.message);
    }
    throw httpErrors.badRequest(error.message);
  }

  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const position = await positionManager.positions(positionAddress);

  const token0 = await pancakeswap.getToken(position.token0);
  const token1 = await pancakeswap.getToken(position.token1);

  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  const feeAmount0 = position.tokensOwed0;
  const feeAmount1 = position.tokensOwed1;

  if (feeAmount0.eq(0) && feeAmount1.eq(0)) {
    throw httpErrors.badRequest('No fees to collect');
  }

  const expectedCurrencyOwed0 = CurrencyAmount.fromRawAmount(token0, feeAmount0.toString());
  const expectedCurrencyOwed1 = CurrencyAmount.fromRawAmount(token1, feeAmount1.toString());

  const collectParams = {
    tokenId: positionAddress,
    expectedCurrencyOwed0,
    expectedCurrencyOwed1,
    recipient: walletAddress as Address,
  };

  const { calldata, value } = NonfungiblePositionManager.collectCallParameters(collectParams);

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

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_COLLECT_FEES_GAS_LIMIT);
  txParams.value = BigNumber.from(value.toString());
  const tx = await positionManagerWithSigner.multicall([calldata], txParams);
  const receipt = await ethereum.handleTransactionExecution(tx);

  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);
  const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
  const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

  const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

  return {
    signature: receipt.transactionHash,
    status: receipt.status,
    data: {
      fee: gasFee,
      baseFeeAmountCollected,
      quoteFeeAmountCollected,
    },
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  await fastify.register(require('@fastify/sensible'));
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Pancakeswap V3 position',
        tags: ['/connector/pancakeswap'],
        body: {
          ...CollectFeesRequest,
          properties: {
            ...CollectFeesRequest.properties,
            network: { type: 'string', default: 'bsc', examples: ['bsc'] },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            positionAddress: {
              type: 'string',
              description: 'Position NFT token ID',
              examples: ['1234'],
            },
          },
        },
        response: {
          200: CollectFeesResponse,
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
            throw httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
        }

        return await collectFees(network, walletAddress, positionAddress);
      } catch (e: any) {
        logger.error('Failed to collect fees:', e);
        if (e.statusCode) {
          throw e;
        }
        throw httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;
