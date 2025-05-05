import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  AddLiquidityRequestType, 
  AddLiquidityRequest,
  AddLiquidityResponseType,
  AddLiquidityResponse
} from '../../../schemas/trading-types/amm-schema';
import { formatTokenAmount } from '../uniswap.utils';
import { Contract } from '@ethersproject/contracts';
// Replace direct import with require
const IUniswapV2Router02ABI = {
  abi: [
    // Router methods for adding liquidity
    {
      inputs: [
        { internalType: 'address', name: 'tokenA', type: 'address' },
        { internalType: 'address', name: 'tokenB', type: 'address' },
        { internalType: 'uint256', name: 'amountADesired', type: 'uint256' },
        { internalType: 'uint256', name: 'amountBDesired', type: 'uint256' },
        { internalType: 'uint256', name: 'amountAMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountBMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'addLiquidity',
      outputs: [
        { internalType: 'uint256', name: 'amountA', type: 'uint256' },
        { internalType: 'uint256', name: 'amountB', type: 'uint256' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' }
      ],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'amountTokenDesired', type: 'uint256' },
        { internalType: 'uint256', name: 'amountTokenMin', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETHMin', type: 'uint256' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: 'deadline', type: 'uint256' }
      ],
      name: 'addLiquidityETH',
      outputs: [
        { internalType: 'uint256', name: 'amountToken', type: 'uint256' },
        { internalType: 'uint256', name: 'amountETH', type: 'uint256' },
        { internalType: 'uint256', name: 'liquidity', type: 'uint256' }
      ],
      stateMutability: 'payable',
      type: 'function'
    }
  ]
};
import { BigNumber } from 'ethers';
import { Percent } from '@uniswap/sdk-core';

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Uniswap V2 pool',
        tags: ['uniswap/amm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            chain: { type: 'string', default: 'ethereum' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            poolAddress: { type: 'string', examples: ['0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc'] },
            baseToken: { type: 'string', examples: ['WETH'] },
            quoteToken: { type: 'string', examples: ['USDC'] },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [100] },
            slippagePct: { type: 'number', examples: [1] }
          }
        },
        response: {
          200: AddLiquidityResponse
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
          slippagePct,
          walletAddress: requestedWalletAddress 
        } = request.body;
        
        const networkToUse = network || 'base';
        const chain = 'ethereum'; // Default to ethereum

        // Validate essential parameters
        if (!baseToken || !quoteToken || !baseTokenAmount || !quoteTokenAmount) {
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

        // Resolve tokens
        const baseTokenObj = uniswap.getTokenBySymbol(baseToken);
        const quoteTokenObj = uniswap.getTokenBySymbol(quoteToken);

        if (!baseTokenObj || !quoteTokenObj) {
          throw fastify.httpErrors.badRequest(`Token not found: ${!baseTokenObj ? baseToken : quoteToken}`);
        }

        // Find pool address if not provided
        let poolAddress = requestedPoolAddress;
        if (!poolAddress) {
          poolAddress = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
          if (!poolAddress) {
            // If no pool exists, it's okay - we'll create one
            logger.info(`No existing pool found for ${baseToken}-${quoteToken}, will create a new one`);
          }
        }

        // Get the wallet
        const wallet = await ethereum.getWallet(walletAddress);
        if (!wallet) {
          throw fastify.httpErrors.badRequest('Wallet not found');
        }

        // Get the router contract with signer
        const routerAddress = uniswap.config.uniswapV2RouterAddress(chain, networkToUse);
        const router = new Contract(
          routerAddress,
          IUniswapV2Router02ABI.abi,
          wallet
        );

        // Convert amounts to token units with decimals
        const baseTokenAmountRaw = BigNumber.from(
          Math.floor(baseTokenAmount * Math.pow(10, baseTokenObj.decimals)).toString()
        );
        
        const quoteTokenAmountRaw = BigNumber.from(
          Math.floor(quoteTokenAmount * Math.pow(10, quoteTokenObj.decimals)).toString()
        );

        // Calculate slippage-adjusted amounts
        const slippageTolerance = slippagePct 
          ? new Percent(slippagePct, 100) 
          : uniswap.getAllowedSlippage(undefined, 'amm');
          
        const slippageMultiplier = new Percent(1).subtract(slippageTolerance);
        
        const baseTokenMinAmount = baseTokenAmountRaw
          .mul(slippageMultiplier.numerator.toString())
          .div(slippageMultiplier.denominator.toString());
          
        const quoteTokenMinAmount = quoteTokenAmountRaw
          .mul(slippageMultiplier.numerator.toString())
          .div(slippageMultiplier.denominator.toString());

        // Prepare the transaction parameters
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
        
        let tx;
        
        // Check if one of the tokens is WETH
        if (baseTokenObj.symbol === 'WETH') {
          // First, approve router to spend tokens if quote token isn't ETH
          const tokenContract = new Contract(
            quoteTokenObj.address,
            [
              {
                constant: false,
                inputs: [
                  { name: '_spender', type: 'address' },
                  { name: '_value', type: 'uint256' }
                ],
                name: 'approve',
                outputs: [{ name: '', type: 'bool' }],
                payable: false,
                stateMutability: 'nonpayable',
                type: 'function'
              }
            ],
            wallet
          );
          await tokenContract.approve(routerAddress, quoteTokenAmountRaw);
          
          // Add liquidity ETH + Token
          tx = await router.addLiquidityETH(
            quoteTokenObj.address,
            quoteTokenAmountRaw,
            quoteTokenMinAmount,
            baseTokenMinAmount,
            walletAddress,
            deadline,
            { 
              value: baseTokenAmountRaw,
              gasLimit: 300000
            }
          );
        } else if (quoteTokenObj.symbol === 'WETH') {
          // First, approve router to spend tokens
          const tokenContract = new Contract(
            baseTokenObj.address,
            [
              {
                constant: false,
                inputs: [
                  { name: '_spender', type: 'address' },
                  { name: '_value', type: 'uint256' }
                ],
                name: 'approve',
                outputs: [{ name: '', type: 'bool' }],
                payable: false,
                stateMutability: 'nonpayable',
                type: 'function'
              }
            ],
            wallet
          );
          await tokenContract.approve(routerAddress, baseTokenAmountRaw);
          
          // Add liquidity Token + ETH
          tx = await router.addLiquidityETH(
            baseTokenObj.address,
            baseTokenAmountRaw,
            baseTokenMinAmount,
            quoteTokenMinAmount,
            walletAddress,
            deadline,
            { 
              value: quoteTokenAmountRaw,
              gasLimit: 300000
            }
          );
        } else {
          // Both tokens are ERC20
          // Approve router to spend both tokens
          const baseTokenContract = new Contract(
            baseTokenObj.address,
            [
              {
                constant: false,
                inputs: [
                  { name: '_spender', type: 'address' },
                  { name: '_value', type: 'uint256' }
                ],
                name: 'approve',
                outputs: [{ name: '', type: 'bool' }],
                payable: false,
                stateMutability: 'nonpayable',
                type: 'function'
              }
            ],
            wallet
          );
          await baseTokenContract.approve(routerAddress, baseTokenAmountRaw);
          
          const quoteTokenContract = new Contract(
            quoteTokenObj.address,
            [
              {
                constant: false,
                inputs: [
                  { name: '_spender', type: 'address' },
                  { name: '_value', type: 'uint256' }
                ],
                name: 'approve',
                outputs: [{ name: '', type: 'bool' }],
                payable: false,
                stateMutability: 'nonpayable',
                type: 'function'
              }
            ],
            wallet
          );
          
          // Add liquidity Token + Token
          tx = await router.addLiquidity(
            baseTokenObj.address,
            quoteTokenObj.address,
            baseTokenAmountRaw,
            quoteTokenAmountRaw,
            baseTokenMinAmount,
            quoteTokenMinAmount,
            walletAddress,
            deadline,
            { gasLimit: 300000 }
          );
        }

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18 // ETH has 18 decimals
        );

        return {
          signature: receipt.transactionHash,
          fee: gasFee,
          baseTokenAmountAdded: baseTokenAmount,
          quoteTokenAmountAdded: quoteTokenAmount
        };
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw e;
        }
        throw fastify.httpErrors.internalServerError('Failed to add liquidity');
      }
    }
  );
};

export default addLiquidityRoute;