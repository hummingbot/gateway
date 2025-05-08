import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { Type } from '@sinclair/typebox';
import { Contract } from '@ethersproject/contracts';

// Define the request and response types
const PositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ examples: ['base'], default: 'base' })),
  walletAddress: Type.String({ examples: ['<ethereum-wallet-address>'] }),
});

const PositionsOwnedResponse = Type.Array(
  Type.Object({
    tokenId: Type.String(),
    token0: Type.String(),
    token1: Type.String(),
    fee: Type.Number(),
    tickLower: Type.Number(),
    tickUpper: Type.Number(),
    liquidity: Type.String(),
  })
);

// Define minimal ABI for the NonfungiblePositionManager
const POSITION_MANAGER_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' }
    ],
    name: 'balanceOf',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'uint256', name: 'index', type: 'uint256' }
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
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

export const positionsOwnedRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';
  
  try {
    firstWalletAddress = await ethereum.getFirstWalletAddress() || firstWalletAddress;
    // Update the example in the schema
    PositionsOwnedRequest.properties.walletAddress.examples = [firstWalletAddress];
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.get<{
    Querystring: typeof PositionsOwnedRequest.static;
    Reply: typeof PositionsOwnedResponse.static;
  }>(
    '/positions-owned',
    {
      schema: {
        description: 'Get all Uniswap V3 positions owned by a wallet',
        tags: ['uniswap/clmm'],
        querystring: PositionsOwnedRequest,
        response: {
          200: PositionsOwnedResponse
        },
      }
    },
    async (request) => {
      try {
        const { walletAddress: requestedWalletAddress } = request.query;
        const network = request.query.network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Get instances
        const uniswap = await Uniswap.getInstance(network);
        const ethereum = await Ethereum.getInstance(network);
        
        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get position manager address
        const positionManagerAddress = uniswap.config.uniswapV3NftManagerAddress(network);
        
        // Create position manager contract
        const positionManager = new Contract(
          positionManagerAddress,
          POSITION_MANAGER_ABI,
          ethereum.provider
        );
        
        // Get number of positions owned by the wallet
        const balanceOf = await positionManager.balanceOf(walletAddress);
        const numPositions = balanceOf.toNumber();
        
        if (numPositions === 0) {
          return [];
        }
        
        // Get all position token IDs
        const positions = [];
        for (let i = 0; i < numPositions; i++) {
          try {
            const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
            
            // Get position details
            const position = await positionManager.positions(tokenId);
            
            // Get tokens by address
            const token0 = uniswap.getTokenByAddress(position.token0);
            const token1 = uniswap.getTokenByAddress(position.token1);
            
            positions.push({
              tokenId: tokenId.toString(),
              token0: token0.symbol,
              token1: token1.symbol,
              fee: position.fee / 10000, // Convert fee to percentage
              tickLower: position.tickLower,
              tickUpper: position.tickUpper,
              liquidity: position.liquidity.toString()
            });
          } catch (err) {
            logger.warn(`Error fetching position ${i} for wallet ${walletAddress}: ${err.message}`);
          }
        }
        
        return positions;
      } catch (e) {
        logger.error(e);
        throw fastify.httpErrors.internalServerError('Failed to fetch positions');
      }
    }
  );
};

export default positionsOwnedRoute;