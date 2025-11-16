import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import { FastifyPluginAsync } from 'fastify';

import { Ethereum } from '../../../chains/ethereum/ethereum';
import {
  GetPositionInfoRequestType,
  GetPositionInfoRequest,
  PositionInfo,
  PositionInfoSchema,
} from '../../../schemas/amm-schema';
import { logger } from '../../../services/logger';
import { Pancakeswap } from '../pancakeswap';
import { IPancakeswapV2PairABI } from '../pancakeswap.contracts';
import { formatTokenAmount } from '../pancakeswap.utils';

export async function checkLPAllowance(
  ethereum: any,
  wallet: any,
  poolAddress: string,
  routerAddress: string,
  requiredAmount: BigNumber,
): Promise<void> {
  const lpTokenContract = ethereum.getContract(poolAddress, wallet);
  const lpAllowance = await ethereum.getERC20Allowance(
    lpTokenContract,
    wallet,
    routerAddress,
    18, // LP tokens typically have 18 decimals
  );
  const currentLpAllowance = BigNumber.from(lpAllowance.value);
  if (currentLpAllowance.lt(requiredAmount)) {
    throw new Error(
      `Insufficient LP token allowance. Please approve at least ${formatTokenAmount(requiredAmount.toString(), 18)} LP tokens (${poolAddress}) for the Pancakeswap router (${routerAddress})`,
    );
  }
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Ethereum.getWalletAddressExample();

  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get position information for a Pancakeswap V2 pool',
        tags: ['/connector/pancakeswap'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
          },
        },
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, walletAddress: requestedWalletAddress } = request.query;

        const networkToUse = network;

        // Validate essential parameters
        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address is required');
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

        // Get the pair contract
        const pairContract = new Contract(poolAddress, IPancakeswapV2PairABI.abi, ethereum.provider);

        // Get LP token balance for the wallet
        const lpBalance = await pairContract.balanceOf(walletAddress);

        // Get token addresses from the pair
        const [token0, token1] = await Promise.all([pairContract.token0(), pairContract.token1()]);

        // Get token objects by address
        const baseTokenObj = await pancakeswap.getToken(token0);
        const quoteTokenObj = await pancakeswap.getToken(token1);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest('Token information not found for pool');
        }

        // If no position, return early
        if (lpBalance.isZero()) {
          return {
            poolAddress,
            walletAddress,
            baseTokenAddress: baseTokenObj.address,
            quoteTokenAddress: quoteTokenObj.address,
            lpTokenAmount: 0,
            baseTokenAmount: 0,
            quoteTokenAmount: 0,
            price: 0,
          };
        }

        // Get total supply and reserves
        const [totalSupply, reserves] = await Promise.all([pairContract.totalSupply(), pairContract.getReserves()]);

        // Determine which token is base and which is quote
        const token0IsBase = token0.toLowerCase() === baseTokenObj.address.toLowerCase();

        // Calculate token amounts
        const baseTokenReserve = token0IsBase ? reserves[0] : reserves[1];
        const quoteTokenReserve = token0IsBase ? reserves[1] : reserves[0];

        const userBaseTokenAmount = baseTokenReserve.mul(lpBalance).div(totalSupply);
        const userQuoteTokenAmount = quoteTokenReserve.mul(lpBalance).div(totalSupply);

        // Calculate price (quoteToken per baseToken)
        const baseTokenAmountFloat = formatTokenAmount(baseTokenReserve.toString(), baseTokenObj.decimals);
        const quoteTokenAmountFloat = formatTokenAmount(quoteTokenReserve.toString(), quoteTokenObj.decimals);
        const price = quoteTokenAmountFloat / baseTokenAmountFloat;

        // Format for response
        logger.info(`Raw LP balance: ${lpBalance.toString()}`);
        logger.info(`Total supply: ${totalSupply.toString()}`);

        const formattedLpAmount = formatTokenAmount(lpBalance.toString(), 18); // LP tokens have 18 decimals
        const formattedBaseAmount = formatTokenAmount(userBaseTokenAmount.toString(), baseTokenObj.decimals);
        const formattedQuoteAmount = formatTokenAmount(userQuoteTokenAmount.toString(), quoteTokenObj.decimals);

        logger.info(`Formatted LP amount: ${formattedLpAmount}`);
        logger.info(`Formatted base amount: ${formattedBaseAmount}`);
        logger.info(`Formatted quote amount: ${formattedQuoteAmount}`);

        return {
          poolAddress,
          walletAddress,
          baseTokenAddress: baseTokenObj.address,
          quoteTokenAddress: quoteTokenObj.address,
          lpTokenAmount: formattedLpAmount,
          baseTokenAmount: formattedBaseAmount,
          quoteTokenAmount: formattedQuoteAmount,
          price,
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to get position info');
      }
    },
  );
};

export default positionInfoRoute;
