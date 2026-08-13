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
import {
  POSITION_MANAGER_ABI,
  getPancakeswapV3MasterchefAddress,
  getPancakeswapV3NftManagerAddress,
} from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

import { getPositionInfo } from './positionInfo';

// Collect on some fee-on-transfer tokens can exceed 200k due transfer hooks.
const CLMM_COLLECT_FEES_GAS_LIMIT = 500000;
const UINT128_MAX = BigNumber.from('0xffffffffffffffffffffffffffffffff');

const NPM_OWNER_OF_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function collectFeesFromMasterChef(
  network: string,
  walletAddress: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const pancakeswap = await Pancakeswap.getInstance(network);
  let collectResult: CollectFeesResponseType | null = null;
  let collectError: any = null;
  let restakeError: any = null;

  logger.info(`Collecting CLMM trading fees for staked NFT ${positionAddress}: unstake -> collect -> restake`);
  await pancakeswap.unstakeNft(positionAddress, walletAddress);

  try {
    collectResult = await collectFees(network, walletAddress, positionAddress);
  } catch (error: any) {
    collectError = error;
  } finally {
    try {
      await pancakeswap.stakeNft(positionAddress, walletAddress);
    } catch (error: any) {
      restakeError = error;
      logger.error(`Failed to restake NFT ${positionAddress} after fee collection: ${error.message}`, error);
    }
  }

  if (restakeError && collectResult) {
    throw httpErrors.internalServerError(
      `Collected trading fees for staked NFT ${positionAddress}, but failed to restake it: ${restakeError.message}`,
    );
  }

  if (collectError) {
    throw collectError;
  }

  if (!collectResult) {
    throw httpErrors.internalServerError(`Failed to collect trading fees for staked NFT ${positionAddress}`);
  }

  return collectResult;
}

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
  const masterChefAddress = getPancakeswapV3MasterchefAddress(network);
  const ownerReader = new Contract(positionManagerAddress, NPM_OWNER_OF_ABI, ethereum.provider);
  const nftOwner = (await ownerReader.ownerOf(positionAddress)).toLowerCase();
  const walletOwner = walletAddress.toLowerCase();
  const isStakedInMasterChef = nftOwner === masterChefAddress.toLowerCase();

  if (nftOwner !== walletOwner && !isStakedInMasterChef) {
    throw httpErrors.forbidden(`Position ${positionAddress} is not owned by wallet ${walletAddress}`);
  }

  const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);
  const position = await positionManager.positions(positionAddress);

  const token0 = await pancakeswap.getToken(position.token0);
  const token1 = await pancakeswap.getToken(position.token1);

  const isBaseToken0 =
    token0.symbol === 'WETH' ||
    (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

  if (isStakedInMasterChef) {
    return await collectFeesFromMasterChef(network, walletAddress, positionAddress);
  }

  const livePositionInfo = await getPositionInfo({ httpErrors } as any, network, positionAddress);
  const feeAmount0 = BigNumber.from(position.tokensOwed0.toString());
  const feeAmount1 = BigNumber.from(position.tokensOwed1.toString());

  if (
    feeAmount0.eq(0) &&
    feeAmount1.eq(0) &&
    Number(livePositionInfo.baseFeeAmount || 0) <= 0 &&
    Number(livePositionInfo.quoteFeeAmount || 0) <= 0
  ) {
    throw httpErrors.badRequest('No fees to collect');
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

  const collectCalldataCandidates = [
    {
      expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, UINT128_MAX.toString()),
      expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, UINT128_MAX.toString()),
      mode: 'both' as const,
    },
    {
      expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, UINT128_MAX.toString()),
      expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, '0'),
      mode: 'token0-only' as const,
    },
    {
      expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(token0, '0'),
      expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(token1, UINT128_MAX.toString()),
      mode: 'token1-only' as const,
    },
  ];

  let selectedCalldata: string | null = null;
  let selectedValue = BigNumber.from(0);
  let selectedMode: 'both' | 'token0-only' | 'token1-only' = 'both';

  const txParams = await ethereum.prepareGasOptions(undefined, CLMM_COLLECT_FEES_GAS_LIMIT);
  for (const candidate of collectCalldataCandidates) {
    const collectParams = {
      tokenId: positionAddress,
      expectedCurrencyOwed0: candidate.expectedCurrencyOwed0,
      expectedCurrencyOwed1: candidate.expectedCurrencyOwed1,
      recipient: walletAddress as Address,
    };

    const { calldata, value } = NonfungiblePositionManager.collectCallParameters(collectParams);
    const probeParams = { ...txParams, value: BigNumber.from(value.toString()) };

    try {
      await positionManagerWithSigner.callStatic.multicall([calldata], probeParams);
      selectedCalldata = calldata;
      selectedValue = BigNumber.from(value.toString());
      selectedMode = candidate.mode;
      break;
    } catch (probeError: any) {
      logger.warn(
        `Collect fees probe failed for ${candidate.mode} on position ${positionAddress}: ${probeError?.message || probeError}`,
      );
    }
  }

  if (!selectedCalldata) {
    throw httpErrors.badRequest(`Unable to collect fees for position ${positionAddress}: all collect modes reverted`);
  }

  txParams.value = selectedValue;
  const tx = await positionManagerWithSigner.multicall([selectedCalldata], txParams);
  const receipt = await ethereum.handleTransactionExecution(tx);

  const gasFee = formatTokenAmount(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(), 18);
  const liveBaseFeeAmount = Number(livePositionInfo.baseFeeAmount || 0);
  const liveQuoteFeeAmount = Number(livePositionInfo.quoteFeeAmount || 0);
  const estimatedToken0Collected =
    selectedMode === 'token1-only' ? 0 : isBaseToken0 ? liveBaseFeeAmount : liveQuoteFeeAmount;
  const estimatedToken1Collected =
    selectedMode === 'token0-only' ? 0 : isBaseToken0 ? liveQuoteFeeAmount : liveBaseFeeAmount;

  const collectedToken0FeeAmount = estimatedToken0Collected;
  const collectedToken1FeeAmount = estimatedToken1Collected;

  const baseFeeAmountCollected = isBaseToken0 ? collectedToken0FeeAmount : collectedToken1FeeAmount;
  const quoteFeeAmountCollected = isBaseToken0 ? collectedToken1FeeAmount : collectedToken0FeeAmount;

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
