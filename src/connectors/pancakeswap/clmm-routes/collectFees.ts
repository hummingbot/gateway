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
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { POSITION_MANAGER_ABI, getPancakeswapV3NftManagerAddress } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

// Default gas limit for CLMM collect fees operations
const CLMM_COLLECT_FEES_GAS_LIMIT = 200000;

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
            network: { type: 'string', default: 'base' },
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

        const networkToUse = network;

        // Validate essential parameters
        if (!positionAddress) {
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

        // Check NFT ownership
        try {
          await pancakeswap.checkNFTOwnership(positionAddress, walletAddress);
        } catch (error: any) {
          if (error.message.includes('is not owned by')) {
            throw fastify.httpErrors.forbidden(error.message);
          }
          throw fastify.httpErrors.badRequest(error.message);
        }

        // Create position manager contract for reading position data
        const positionManager = new Contract(positionManagerAddress, POSITION_MANAGER_ABI, ethereum.provider);

        // Get position details
        const position = await positionManager.positions(positionAddress);

        // Get tokens by address
        const token0 = pancakeswap.getTokenByAddress(position.token0);
        const token1 = pancakeswap.getTokenByAddress(position.token1);

        // Determine base and quote tokens - WETH or lower address is base
        const isBaseToken0 =
          token0.symbol === 'WETH' ||
          (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());

        // Get fees owned
        const feeAmount0 = position.tokensOwed0;
        const feeAmount1 = position.tokensOwed1;

        // If no fees to collect, throw an error
        if (feeAmount0.eq(0) && feeAmount1.eq(0)) {
          throw fastify.httpErrors.badRequest('No fees to collect');
        }

        // Create CurrencyAmount objects for fees
        const expectedCurrencyOwed0 = CurrencyAmount.fromRawAmount(token0, feeAmount0.toString());
        const expectedCurrencyOwed1 = CurrencyAmount.fromRawAmount(token1, feeAmount1.toString());

        // Create parameters for collecting fees
        const collectParams = {
          tokenId: positionAddress,
          expectedCurrencyOwed0,
          expectedCurrencyOwed1,
          recipient: walletAddress as Address,
        };

        // Get calldata for collecting fees
        const { calldata, value } = NonfungiblePositionManager.collectCallParameters(collectParams);

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

        // Execute the transaction to collect fees
        // Use Ethereum's prepareGasOptions method
        const txParams = await ethereum.prepareGasOptions(undefined, CLMM_COLLECT_FEES_GAS_LIMIT);
        txParams.value = BigNumber.from(value.toString());

        const tx = await positionManagerWithSigner.multicall([calldata], txParams);

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18, // ETH has 18 decimals
        );

        // Calculate fee amounts collected
        const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
        const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);

        // Map back to base and quote amounts
        const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
        const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

        return {
          signature: receipt.transactionHash,
          status: 1, // CONFIRMED
          data: {
            fee: gasFee,
            baseFeeAmountCollected,
            quoteFeeAmountCollected,
          },
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to collect fees');
      }
    },
  );
};

export default collectFeesRoute;
