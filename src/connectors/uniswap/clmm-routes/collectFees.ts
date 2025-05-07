import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  CollectFeesRequestType, 
  CollectFeesRequest,
  CollectFeesResponseType,
  CollectFeesResponse
} from '../../../schemas/trading-types/clmm-schema';
import { formatTokenAmount } from '../uniswap.utils';
import {
  NonfungiblePositionManager,
} from '@uniswap/v3-sdk';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';

// Define minimal ABI for the NonfungiblePositionManager
const POSITION_MANAGER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' }
    ],
    name: 'positions',
    outputs: [
      { internalType: 'uint96', name: 'nonce', type: 'uint96' },
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      { internalType: 'uint256', name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { internalType: 'uint256', name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { internalType: 'uint128', name: 'tokensOwed0', type: 'uint128' },
      { internalType: 'uint128', name: 'tokensOwed1', type: 'uint128' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
];

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: CollectFeesRequestType;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from a Uniswap V3 position',
        tags: ['uniswap/clmm'],
        body: {
          ...CollectFeesRequest,
          properties: {
            ...CollectFeesRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            positionAddress: { type: 'string', description: 'Position NFT token ID' }
          }
        },
        response: {
          200: CollectFeesResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network,
          walletAddress: requestedWalletAddress,
          positionAddress
        } = request.body;
        
        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(chain, networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);
        
        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
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
        const positionManagerAddress = uniswap.config.uniswapV3NftManagerAddress(chain, networkToUse);
        
        // Create position manager contract
        const positionManager = new Contract(
          positionManagerAddress,
          POSITION_MANAGER_ABI,
          ethereum.provider
        );
        
        // Get position details
        const position = await positionManager.positions(positionAddress);
        
        // Get tokens by address
        const token0 = uniswap.getTokenByAddress(position.token0);
        const token1 = uniswap.getTokenByAddress(position.token1);
        
        // Determine base and quote tokens
        const baseTokenSymbol = token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
        const isBaseToken0 = token0.symbol === baseTokenSymbol;
        
        // Get fees owned
        const feeAmount0 = position.tokensOwed0;
        const feeAmount1 = position.tokensOwed1;
        
        // If no fees to collect, throw an error
        if (feeAmount0.eq(0) && feeAmount1.eq(0)) {
          throw fastify.httpErrors.badRequest('No fees to collect');
        }
        
        // Create parameters for collecting fees
        const collectParams = {
          tokenId: positionAddress,
          expectedCurrencyOwed0: feeAmount0,
          expectedCurrencyOwed1: feeAmount1,
          recipient: walletAddress
        };
        
        // Get calldata for collecting fees
        const { calldata, value } = NonfungiblePositionManager.collectCallParameters(collectParams);
        
        // Initialize position manager with multicall interface
        const positionManagerWithSigner = new Contract(
          positionManagerAddress,
          [
            {
              inputs: [
                { internalType: 'bytes', name: 'data', type: 'bytes' }
              ],
              name: 'multicall',
              outputs: [
                { internalType: 'bytes[]', name: 'results', type: 'bytes[]' }
              ],
              stateMutability: 'payable',
              type: 'function'
            }
          ],
          wallet
        );
        
        // Execute the transaction to collect fees
        const tx = await positionManagerWithSigner.multicall(
          [calldata], 
          { 
            value: BigNumber.from(value.toString()),
            gasLimit: 300000
          }
        );
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18 // ETH has 18 decimals
        );
        
        // Calculate fee amounts collected
        const token0FeeAmount = formatTokenAmount(feeAmount0.toString(), token0.decimals);
        const token1FeeAmount = formatTokenAmount(feeAmount1.toString(), token1.decimals);
        
        // Map back to base and quote amounts
        const baseFeeAmountCollected = isBaseToken0 ? token0FeeAmount : token1FeeAmount;
        const quoteFeeAmountCollected = isBaseToken0 ? token1FeeAmount : token0FeeAmount;

        return {
          signature: receipt.transactionHash,
          fee: gasFee,
          baseFeeAmountCollected,
          quoteFeeAmountCollected
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to collect fees');
      }
    }
  );
};

export default collectFeesRoute;