import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  GetPositionInfoRequestType, 
  GetPositionInfoRequest,
  PositionInfo,
  PositionInfoSchema
} from '../../../schemas/trading-types/clmm-schema';
import { formatTokenAmount } from '../uniswap.utils';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { Token } from '@uniswap/sdk-core';
import { Position, NonfungiblePositionManager } from '@uniswap/v3-sdk';
import { tickToPrice } from '@uniswap/v3-sdk';

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

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get position information for a Uniswap V3 position',
        tags: ['uniswap/clmm'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'base' },
            positionAddress: { type: 'string', description: 'Position NFT token ID' },
            walletAddress: { type: 'string', examples: ['0x...'] }
          }
        },
        response: {
          200: PositionInfoSchema
        },
      }
    },
    async (request) => {
      try {
        const { 
          network, 
          positionAddress, // This will be the NFT token ID for Uniswap V3
          walletAddress: requestedWalletAddress 
        } = request.query;
        
        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!positionAddress) {
          throw fastify.httpErrors.badRequest('Position token ID is required');
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

        // Get the position manager contract address
        const positionManagerAddress = uniswap.config.uniswapV3NftManagerAddress(chain, networkToUse);
        
        // Create the position manager contract instance
        const positionManager = new Contract(
          positionManagerAddress,
          POSITION_MANAGER_ABI,
          ethereum.provider
        );
        
        // Get position details by token ID
        const positionDetails = await positionManager.positions(positionAddress);
        
        // Get the token addresses from the position
        const token0Address = positionDetails.token0;
        const token1Address = positionDetails.token1;
        
        // Get the tokens from addresses
        const token0 = uniswap.getTokenByAddress(token0Address);
        const token1 = uniswap.getTokenByAddress(token1Address);
        
        // Get position ticks
        const tickLower = positionDetails.tickLower;
        const tickUpper = positionDetails.tickUpper;
        const liquidity = positionDetails.liquidity;
        const fee = positionDetails.fee;
        
        // Get collected fees
        const feeAmount0 = formatTokenAmount(positionDetails.tokensOwed0.toString(), token0.decimals);
        const feeAmount1 = formatTokenAmount(positionDetails.tokensOwed1.toString(), token1.decimals);
        
        // Get the pool associated with the position
        const pool = await uniswap.getV3Pool(token0, token1, fee);
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found for position');
        }
        
        // Calculate price range
        const lowerPrice = tickToPrice(token0, token1, tickLower).toSignificant(6);
        const upperPrice = tickToPrice(token0, token1, tickUpper).toSignificant(6);
        
        // Calculate current price
        const price = pool.token0Price.toSignificant(6);
        
        // Create a Position instance to calculate token amounts
        const position = new Position({
          pool,
          tickLower,
          tickUpper,
          liquidity: liquidity.toString()
        });
        
        // Get token amounts in the position
        const token0Amount = formatTokenAmount(position.amount0.quotient.toString(), token0.decimals);
        const token1Amount = formatTokenAmount(position.amount1.quotient.toString(), token1.decimals);
        
        // Determine which token is base and which is quote
        // In Uniswap, typically the token with the lower address is token0
        const isBaseToken0 = token0.symbol === 'WETH' || 
          (token1.symbol !== 'WETH' && token0.address.toLowerCase() < token1.address.toLowerCase());
        
        const [baseTokenAddress, quoteTokenAddress] = isBaseToken0 
          ? [token0.address, token1.address]
          : [token1.address, token0.address];
          
        const [baseTokenAmount, quoteTokenAmount] = isBaseToken0
          ? [token0Amount, token1Amount]
          : [token1Amount, token0Amount];
          
        const [baseFeeAmount, quoteFeeAmount] = isBaseToken0
          ? [feeAmount0, feeAmount1]
          : [feeAmount1, feeAmount0];
        
        // For the V3 pool, we need to construct an ID since Pool objects don't have an address property
        const poolAddressStr = `${token0.address}-${token1.address}-${fee}`;
        
        return {
          address: positionAddress,
          poolAddress: poolAddressStr, // Use a constructed ID since V3 Pool doesn't expose address
          baseTokenAddress,
          quoteTokenAddress,
          baseTokenAmount,
          quoteTokenAmount,
          baseFeeAmount,
          quoteFeeAmount,
          lowerBinId: tickLower,
          upperBinId: tickUpper,
          lowerPrice: parseFloat(lowerPrice),
          upperPrice: parseFloat(upperPrice),
          price: parseFloat(price)
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get position info');
      }
    }
  );
};

export default positionInfoRoute;