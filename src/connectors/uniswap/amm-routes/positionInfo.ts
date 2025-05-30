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
import { Uniswap } from '../uniswap';
import { IUniswapV2PairABI } from '../uniswap.contracts';
import { formatTokenAmount } from '../uniswap.utils';

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
      `Insufficient LP token allowance. Please approve at least ${formatTokenAmount(requiredAmount.toString(), 18)} LP tokens for the Uniswap router (${routerAddress})`,
    );
  }
}

export const positionInfoRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const ethereum = await Ethereum.getInstance('base');
  let firstWalletAddress = '<ethereum-wallet-address>';

  try {
    firstWalletAddress =
      (await ethereum.getFirstWalletAddress()) || firstWalletAddress;
  } catch (error) {
    logger.warn('No wallets found for examples in schema');
  }

  fastify.get<{
    Querystring: GetPositionInfoRequestType;
    Reply: PositionInfo;
  }>(
    '/position-info',
    {
      schema: {
        description: 'Get position information for a Uniswap V2 pool',
        tags: ['uniswap/amm'],
        querystring: {
          ...GetPositionInfoRequest,
          properties: {
            network: { type: 'string', default: 'base' },
            poolAddress: {
              type: 'string',
              examples: [''],
            },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            walletAddress: { type: 'string', examples: [firstWalletAddress] },
          },
        },
        response: {
          200: PositionInfoSchema,
        },
      },
    },
    async (request) => {
      try {
        const {
          network,
          poolAddress: requestedPoolAddress,
          baseToken,
          quoteToken,
          walletAddress: requestedWalletAddress,
        } = request.query;

        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!requestedPoolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest(
            'Either pool address or both base token and quote token must be provided',
          );
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
        const ethereum = await Ethereum.getInstance(networkToUse);

        // Get wallet address - either from request or first available
        let walletAddress = requestedWalletAddress;
        if (!walletAddress) {
          walletAddress = await uniswap.getFirstWalletAddress();
          if (!walletAddress) {
            throw fastify.httpErrors.badRequest(
              'No wallet address provided and no default wallet found',
            );
          }
          logger.info(`Using first available wallet address: ${walletAddress}`);
        }

        // Resolve tokens if provided
        let baseTokenObj, quoteTokenObj;
        if (baseToken && quoteToken) {
          baseTokenObj = uniswap.getTokenBySymbol(baseToken);
          quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

          if (!baseTokenObj || !quoteTokenObj) {
            throw fastify.httpErrors.badRequest(
              `Token not found: ${!baseTokenObj ? baseToken : quoteToken}`,
            );
          }
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress && baseTokenObj && quoteTokenObj) {
          poolAddress = await uniswap.findDefaultPool(
            baseToken,
            quoteToken,
            'amm',
          );

          if (!poolAddress) {
            throw fastify.httpErrors.notFound(
              `No AMM pool found for pair ${baseToken}-${quoteToken}`,
            );
          }
        }

        // Get the pair contract
        const pairContract = new Contract(
          poolAddress,
          IUniswapV2PairABI.abi,
          ethereum.provider,
        );

        // Get LP token balance for the wallet
        const lpBalance = await pairContract.balanceOf(walletAddress);

        // If no position, return early
        if (lpBalance.isZero()) {
          return {
            poolAddress,
            walletAddress,
            baseTokenAddress: '',
            quoteTokenAddress: '',
            lpTokenAmount: 0,
            baseTokenAmount: 0,
            quoteTokenAmount: 0,
            price: 0,
          };
        }

        // Get token addresses and reserves
        const [token0, token1, totalSupply, reserves] = await Promise.all([
          pairContract.token0(),
          pairContract.token1(),
          pairContract.totalSupply(),
          pairContract.getReserves(),
        ]);

        // If tokens were not provided, get them by address
        if (!baseTokenObj) {
          baseTokenObj = uniswap.getTokenByAddress(token0);
        }

        if (!quoteTokenObj) {
          quoteTokenObj = uniswap.getTokenByAddress(token1);
        }

        // Determine which token is base and which is quote
        const token0IsBase =
          token0.toLowerCase() === baseTokenObj.address.toLowerCase();

        // Calculate user's share of the pool
        const userShare =
          lpBalance.mul(10000).div(totalSupply).toNumber() / 10000; // Convert to percentage

        // Calculate token amounts
        const baseTokenReserve = token0IsBase ? reserves[0] : reserves[1];
        const quoteTokenReserve = token0IsBase ? reserves[1] : reserves[0];

        const userBaseTokenAmount = baseTokenReserve
          .mul(lpBalance)
          .div(totalSupply);
        const userQuoteTokenAmount = quoteTokenReserve
          .mul(lpBalance)
          .div(totalSupply);

        // Calculate price (quoteToken per baseToken)
        const baseTokenAmountFloat = formatTokenAmount(
          baseTokenReserve.toString(),
          baseTokenObj.decimals,
        );
        const quoteTokenAmountFloat = formatTokenAmount(
          quoteTokenReserve.toString(),
          quoteTokenObj.decimals,
        );
        const price = quoteTokenAmountFloat / baseTokenAmountFloat;

        // Format for response
        logger.info(`Raw LP balance: ${lpBalance.toString()}`);
        logger.info(`Total supply: ${totalSupply.toString()}`);

        const formattedLpAmount = formatTokenAmount(lpBalance.toString(), 18); // LP tokens have 18 decimals
        const formattedBaseAmount = formatTokenAmount(
          userBaseTokenAmount.toString(),
          baseTokenObj.decimals,
        );
        const formattedQuoteAmount = formatTokenAmount(
          userQuoteTokenAmount.toString(),
          quoteTokenObj.decimals,
        );

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
        throw fastify.httpErrors.internalServerError(
          'Failed to get position info',
        );
      }
    },
  );
};

export default positionInfoRoute;
