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
import { ETCswap } from '../etcswap';
import { IUniswapV2PairABI } from '../etcswap.contracts';
import { formatTokenAmount } from '../etcswap.utils';

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
      `Insufficient LP token allowance. Please approve at least ${formatTokenAmount(requiredAmount.toString(), 18)} LP tokens (${poolAddress}) for the ETCswap router (${routerAddress})`,
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
        description: 'Get position information for an ETCswap V2 pool',
        tags: ['/connector/etcswap'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'classic' },
            walletAddress: { type: 'string', examples: [walletAddressExample] },
            poolAddress: {
              type: 'string',
              examples: ['0x8B48dE7cCE180ad32A51d8aB5ab28B27c4787aaf'],
            },
            baseToken: { type: 'string', examples: ['WETC'] },
            quoteToken: { type: 'string', examples: ['USC'] },
          },
        },
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const { network = 'classic', poolAddress, walletAddress: requestedWalletAddress } = request.query;

        const networkToUse = network;

        // Validate essential parameters
        if (!poolAddress) {
          throw fastify.httpErrors.badRequest('Pool address is required');
        }

        // Get ETCswap and Ethereum instances
        const etcswap = await ETCswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await etcswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet found');
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Get the pair contract
        const pairContract = new Contract(poolAddress, IUniswapV2PairABI.abi, ethereum.provider);

        // Get LP token balance for the wallet
        const lpBalance = await pairContract.balanceOf(walletAddress);

        // Get token addresses from the pair
        const [token0, token1] = await Promise.all([pairContract.token0(), pairContract.token1()]);

        // Get token objects by address
        const baseTokenObj = await etcswap.getToken(token0);
        const quoteTokenObj = await etcswap.getToken(token1);

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

        // Calculate user's share of the pool
        const userShare = lpBalance.mul(10000).div(totalSupply).toNumber() / 10000; // Convert to percentage

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
