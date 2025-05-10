import { FastifyPluginAsync } from 'fastify';
import { Uniswap } from '../uniswap';
import { Ethereum } from '../../../chains/ethereum/ethereum';
import { logger } from '../../../services/logger';
import { 
  AddLiquidityRequestType, 
  AddLiquidityRequest,
  AddLiquidityResponseType,
  AddLiquidityResponse
} from '../../../schemas/trading-types/clmm-schema';
import { formatTokenAmount } from '../uniswap.utils';
import {
  Token,
  CurrencyAmount,
  Percent,
} from '@uniswap/sdk-core';
import {
  Position,
  Pool as V3Pool,
  NonfungiblePositionManager,
  MintOptions,
  FeeAmount,
} from '@uniswap/v3-sdk';
import { Contract } from '@ethersproject/contracts';
import { BigNumber } from 'ethers';
import JSBI from 'jsbi';

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

// Define a minimal ABI for ERC20 tokens
const ERC20_ABI = [
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
];

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: AddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to an existing Uniswap V3 position',
        tags: ['uniswap/clmm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'base' },
            walletAddress: { type: 'string', examples: ['0x...'] },
            positionAddress: { type: 'string', description: 'Position NFT token ID' },
            baseTokenAmount: { type: 'number', examples: [0.1] },
            quoteTokenAmount: { type: 'number', examples: [200] },
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
          walletAddress: requestedWalletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct
        } = request.body;
        
        const networkToUse = network || 'base';

        // Validate essential parameters
        if (!positionAddress || (baseTokenAmount === undefined && quoteTokenAmount === undefined)) {
          throw fastify.httpErrors.badRequest('Missing required parameters');
        }

        // Get Uniswap and Ethereum instances
        const uniswap = await Uniswap.getInstance(networkToUse);
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
        const positionManagerAddress = uniswap.config.uniswapV3NftManagerAddress(networkToUse);
        
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
        const fee = position.fee;
        const tickLower = position.tickLower;
        const tickUpper = position.tickUpper;
        
        // Get the pool
        const pool = await uniswap.getV3Pool(token0, token1, fee);
        if (!pool) {
          throw fastify.httpErrors.notFound('Pool not found for position');
        }
        
        // Calculate slippage tolerance
        const slippageTolerance = slippagePct 
          ? new Percent(slippagePct, 100) 
          : uniswap.getAllowedSlippage();
        
        // Determine base and quote tokens
        const baseTokenSymbol = token0.symbol === 'WETH' ? token0.symbol : token1.symbol;
        const isBaseToken0 = token0.symbol === baseTokenSymbol;
        
        // Calculate token amounts to add
        let token0Amount = CurrencyAmount.fromRawAmount(token0, 0);
        let token1Amount = CurrencyAmount.fromRawAmount(token1, 0);
        
        if (baseTokenAmount !== undefined) {
          // Convert baseTokenAmount to raw amount
          const baseAmountRaw = Math.floor(baseTokenAmount * Math.pow(10, isBaseToken0 ? token0.decimals : token1.decimals));
          
          if (isBaseToken0) {
            token0Amount = CurrencyAmount.fromRawAmount(
              token0, 
              JSBI.BigInt(baseAmountRaw.toString())
            );
          } else {
            token1Amount = CurrencyAmount.fromRawAmount(
              token1, 
              JSBI.BigInt(baseAmountRaw.toString())
            );
          }
        }
        
        if (quoteTokenAmount !== undefined) {
          // Convert quoteTokenAmount to raw amount
          const quoteAmountRaw = Math.floor(quoteTokenAmount * Math.pow(10, isBaseToken0 ? token1.decimals : token0.decimals));
          
          if (isBaseToken0) {
            token1Amount = CurrencyAmount.fromRawAmount(
              token1, 
              JSBI.BigInt(quoteAmountRaw.toString())
            );
          } else {
            token0Amount = CurrencyAmount.fromRawAmount(
              token0, 
              JSBI.BigInt(quoteAmountRaw.toString())
            );
          }
        }
        
        // Create a new Position to represent the added liquidity
        const newPosition = Position.fromAmounts({
          pool,
          tickLower,
          tickUpper,
          amount0: token0Amount.quotient,
          amount1: token1Amount.quotient,
          useFullPrecision: true
        });
        
        // Create mint options for adding liquidity
        const mintOptions = {
          tokenId: positionAddress,
          slippageTolerance,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from now
        };
        
        // Get calldata for increasing liquidity
        const { calldata, value } = NonfungiblePositionManager.addCallParameters(newPosition, mintOptions);
        
        // Approve the position manager to use tokens
        // Approve token0 if needed
        if (!token0Amount.equalTo(0) && token0.symbol !== 'WETH') {
          const token0Contract = new Contract(
            token0.address,
            ERC20_ABI,
            wallet
          );
          
          const approvalTx0 = await token0Contract.approve(
            positionManagerAddress,
            token0Amount.quotient.toString()
          );
          
          await approvalTx0.wait();
        }
        
        // Approve token1 if needed
        if (!token1Amount.equalTo(0) && token1.symbol !== 'WETH') {
          const token1Contract = new Contract(
            token1.address,
            ERC20_ABI,
            wallet
          );
          
          const approvalTx1 = await token1Contract.approve(
            positionManagerAddress,
            token1Amount.quotient.toString()
          );
          
          await approvalTx1.wait();
        }
        
        // Initialize position manager with multicall interface
        const positionManagerWithSigner = new Contract(
          positionManagerAddress,
          [
            {
              inputs: [
                { internalType: 'bytes[]', name: 'data', type: 'bytes[]' }
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
        
        // Execute the transaction to increase liquidity
        const tx = await positionManagerWithSigner.multicall(
          [calldata], 
          { 
            value: BigNumber.from(value.toString()),
            gasLimit: 500000 
          }
        );
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        
        // Calculate gas fee
        const gasFee = formatTokenAmount(
          receipt.gasUsed.mul(receipt.effectiveGasPrice).toString(),
          18 // ETH has 18 decimals
        );
        
        // Calculate actual token amounts added
        const actualToken0Amount = formatTokenAmount(
          newPosition.amount0.quotient.toString(),
          token0.decimals
        );
        
        const actualToken1Amount = formatTokenAmount(
          newPosition.amount1.quotient.toString(),
          token1.decimals
        );
        
        // Map back to base and quote amounts
        const actualBaseAmount = isBaseToken0 ? actualToken0Amount : actualToken1Amount;
        const actualQuoteAmount = isBaseToken0 ? actualToken1Amount : actualToken0Amount;

        return {
          signature: receipt.transactionHash,
          fee: gasFee,
          baseTokenAmountAdded: actualBaseAmount,
          quoteTokenAmountAdded: actualQuoteAmount
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