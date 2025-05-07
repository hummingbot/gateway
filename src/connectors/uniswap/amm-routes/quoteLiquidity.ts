import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  QuoteLiquidityRequestType, 
  QuoteLiquidityRequest,
  QuoteLiquidityResponseType,
  QuoteLiquidityResponse
} from '../../../schemas/trading-types/amm-schema';
import { formatTokenAmount } from '../uniswap.utils';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';

// Define a minimal ABI for the Uniswap V2 Pair contract
const IUniswapV2PairABI = {
  abi: [
    { constant: true, inputs: [], name: 'getReserves', outputs: [{ internalType: 'uint112', name: '_reserve0', type: 'uint112' }, { internalType: 'uint112', name: '_reserve1', type: 'uint112' }, { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [], name: 'token0', outputs: [{ internalType: 'address', name: '', type: 'address' }], payable: false, stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [], name: 'token1', outputs: [{ internalType: 'address', name: '', type: 'address' }], payable: false, stateMutability: 'view', type: 'function' }
  ]
};

export const quoteLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: QuoteLiquidityRequestType;
    Reply: QuoteLiquidityResponseType;
  }>(
    '/quote-liquidity',
    {
      schema: {
        description: 'Get liquidity quote for a Uniswap V2 pool',
        tags: ['uniswap/amm'],
        querystring: {
          ...QuoteLiquidityRequest,
          properties: {
            ...QuoteLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            chain: { type: 'string', default: 'ethereum' },
            poolAddress: { type: 'string', examples: ['0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [100] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: QuoteLiquidityResponse
        },
      }
    },
    async (request) => {
      try {
        const { 
          network, 
          poolAddress: requestedPoolAddress, 
          baseToken, 
          quoteToken,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.query;
        
        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!baseToken || !quoteToken) {
          throw fastify.httpErrors.badRequest('Base token and quote token are required');
        }
        
        if (baseTokenAmount === undefined && quoteTokenAmount === undefined) {
          throw fastify.httpErrors.badRequest('At least one token amount must be provided');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(chain, networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        let existingPool = true;
        
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
          
          if (!poolAddress) {
            existingPool = false;
            logger.info(`No existing pool found for ${baseToken}-${quoteToken}, providing theoretical quote`);
          }
        }

        let baseTokenAmountOptimal = baseTokenAmount;
        let quoteTokenAmountOptimal = quoteTokenAmount;
        let baseLimited = false;
        
        if (existingPool) {
          // Get existing pool data to calculate optimal amounts
          const pairContract = new Contract(
            poolAddress,
            IUniswapV2PairABI.abi,
            ethereum.provider
          );
          
          // Get token addresses and reserves
          const [token0, token1, reserves] = await Promise.all([
            pairContract.token0(),
            pairContract.token1(),
            pairContract.getReserves()
          ]);
          
          // Determine which token is base and which is quote
          const token0IsBase = token0.toLowerCase() === baseTokenObj.address.toLowerCase();
          
          const reserve0 = reserves[0];
          const reserve1 = reserves[1];
          
          const baseReserve = token0IsBase ? reserve0 : reserve1;
          const quoteReserve = token0IsBase ? reserve1 : reserve0;
          
          // Convert amounts to BigNumber with proper decimals
          const baseAmountRaw = baseTokenAmount 
            ? BigNumber.from(Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString())
            : null;
            
          const quoteAmountRaw = quoteTokenAmount
            ? BigNumber.from(Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString())
            : null;
          
          // Calculate optimal amounts based on the reserves ratio
          if (baseAmountRaw && quoteAmountRaw) {
            // Both amounts provided, check which one is limiting
            const baseToQuoteRatio = baseReserve.isZero() ? BigNumber.from(0) : baseReserve.mul(Math.pow(10, 18)).div(quoteReserve);
            const quoteToBaseRatio = quoteReserve.isZero() ? BigNumber.from(0) : quoteReserve.mul(Math.pow(10, 18)).div(baseReserve);
            
            const quoteOptimal = baseAmountRaw.mul(quoteReserve).div(baseReserve);
            
            if (quoteOptimal.lte(quoteAmountRaw)) {
              // Base token is the limiting factor
              baseLimited = true;
              quoteTokenAmountOptimal = formatTokenAmount(quoteOptimal.toString(), quoteTokenObj.decimals);
            } else {
              // Quote token is the limiting factor
              baseLimited = false;
              const baseOptimal = quoteAmountRaw.mul(baseReserve).div(quoteReserve);
              baseTokenAmountOptimal = formatTokenAmount(baseOptimal.toString(), baseTokenObj.decimals);
            }
          } else if (baseAmountRaw) {
            // Only base amount provided, calculate quote amount
            const quoteOptimal = baseReserve.isZero() 
              ? BigNumber.from(0) 
              : baseAmountRaw.mul(quoteReserve).div(baseReserve);
              
            quoteTokenAmountOptimal = formatTokenAmount(quoteOptimal.toString(), quoteTokenObj.decimals);
            baseLimited = true;
          } else if (quoteAmountRaw) {
            // Only quote amount provided, calculate base amount
            const baseOptimal = quoteReserve.isZero() 
              ? BigNumber.from(0) 
              : quoteAmountRaw.mul(baseReserve).div(quoteReserve);
              
            baseTokenAmountOptimal = formatTokenAmount(baseOptimal.toString(), baseTokenObj.decimals);
            baseLimited = false;
          }
        } else {
          // No existing pool, the ratio will be set by the first liquidity provider
          if (baseTokenAmount && quoteTokenAmount) {
            // Both amounts provided, keeping them as is
            baseLimited = false;
          } else if (baseTokenAmount) {
            // Only base amount provided, need quote amount
            throw fastify.httpErrors.badRequest('For new pools, both base and quote token amounts must be provided');
          } else if (quoteTokenAmount) {
            // Only quote amount provided, need base amount
            throw fastify.httpErrors.badRequest('For new pools, both base and quote token amounts must be provided');
          }
        }
        
        return {
          baseLimited,
          baseTokenAmount: baseTokenAmountOptimal,
          quoteTokenAmount: quoteTokenAmountOptimal,
          baseTokenAmountMax: baseTokenAmount || baseTokenAmountOptimal,
          quoteTokenAmountMax: quoteTokenAmount || quoteTokenAmountOptimal
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get liquidity quote');
      }
    }
  );
};

export default quoteLiquidityRoute;