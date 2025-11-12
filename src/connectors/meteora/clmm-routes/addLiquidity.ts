import { StrategyType } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponse, AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';
import { MeteoraClmmAddLiquidityRequest } from '../schemas';

// Using Fastify's native error handling

// Define error messages
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) => `Invalid Solana address: ${address}`;
const MISSING_AMOUNTS_MESSAGE = 'Missing amounts for liquidity addition';
const INSUFFICIENT_BALANCE_MESSAGE = (token: string, required: string, actual: string) =>
  `Insufficient balance for ${token}. Required: ${required}, Available: ${actual}`;

const SOL_TRANSACTION_BUFFER = 0.01; // SOL buffer for transaction costs

export async function addLiquidity(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = MeteoraConfig.config.slippagePct,
  strategyType?: StrategyType,
): Promise<AddLiquidityResponseType> {
  // Validate addresses first
  try {
    new PublicKey(positionAddress);
    new PublicKey(address);
  } catch (error) {
    throw fastify.httpErrors.badRequest(INVALID_SOLANA_ADDRESS_MESSAGE(positionAddress));
  }

  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw fastify.httpErrors.badRequest(MISSING_AMOUNTS_MESSAGE);
  }

  // Get position - handle null return gracefully
  const positionResult = await meteora.getRawPosition(positionAddress, wallet.publicKey);

  if (!positionResult || !positionResult.position) {
    throw fastify.httpErrors.notFound(
      `Position not found: ${positionAddress}. Please provide a valid position address`,
    );
  }

  const { position, info } = positionResult;

  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(`Pool not found for position: ${positionAddress}`);
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  // Check balances with transaction buffer
  const balances = await solana.getBalance(wallet, [tokenXSymbol, tokenYSymbol, 'SOL']);
  const requiredBase = baseTokenAmount + (tokenXSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);
  const requiredQuote = quoteTokenAmount + (tokenYSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);

  if (balances[tokenXSymbol] < requiredBase) {
    throw fastify.httpErrors.badRequest(
      INSUFFICIENT_BALANCE_MESSAGE(tokenXSymbol, requiredBase.toString(), balances[tokenXSymbol].toString()),
    );
  }

  if (balances[tokenYSymbol] < requiredQuote) {
    throw fastify.httpErrors.badRequest(
      INSUFFICIENT_BALANCE_MESSAGE(tokenYSymbol, requiredQuote.toString(), balances[tokenYSymbol].toString()),
    );
  }

  logger.info(
    `Adding liquidity to position ${positionAddress}: ${baseTokenAmount.toFixed(4)} ${tokenXSymbol}, ${quoteTokenAmount.toFixed(4)} ${tokenYSymbol}`,
  );
  const maxBinId = position.positionData.upperBinId;
  const minBinId = position.positionData.lowerBinId;

  const totalXAmount = new BN(DecimalUtil.toBN(new Decimal(baseTokenAmount), dlmmPool.tokenX.mint.decimals));
  const totalYAmount = new BN(DecimalUtil.toBN(new Decimal(quoteTokenAmount), dlmmPool.tokenY.mint.decimals));

  const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
    positionPubKey: new PublicKey(position.publicKey),
    user: wallet.publicKey,
    totalXAmount,
    totalYAmount,
    strategy: {
      maxBinId,
      minBinId,
      strategyType: strategyType ?? MeteoraConfig.config.strategyType,
    },
    slippage: slippagePct,
  });

  // Set the fee payer for simulation
  addLiquidityTx.feePayer = wallet.publicKey;

  // Simulate with error handling
  await solana.simulateWithErrorHandling(addLiquidityTx, fastify);

  logger.info('Transaction simulated successfully, sending to network...');

  // Send and confirm transaction using sendAndConfirmTransaction which handles signing
  // Transaction will automatically simulate to determine optimal compute units
  const { signature, fee } = await solana.sendAndConfirmTransaction(addLiquidityTx, [wallet]);

  // Get transaction data for confirmation
  const txData = await solana.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const confirmed = txData !== null;

  if (confirmed && txData) {
    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, dlmmPool.pubkey.toBase58(), [
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.tokenY.publicKey.toBase58(),
    ]);

    const tokenXAddedAmount = balanceChanges[0];
    const tokenYAddedAmount = balanceChanges[1];

    logger.info(
      `Liquidity added to position ${positionAddress}: ${Math.abs(tokenXAddedAmount).toFixed(4)} ${tokenXSymbol}, ${Math.abs(tokenYAddedAmount).toFixed(4)} ${tokenYSymbol}`,
    );

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        baseTokenAmountAdded: Math.abs(tokenXAddedAmount),
        quoteTokenAmountAdded: Math.abs(tokenYAddedAmount),
        fee,
      },
    };
  } else {
    return {
      signature,
      status: 0, // PENDING
    };
  }
}

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  const walletAddressExample = await Solana.getWalletAddressExample();

  fastify.post<{
    Body: Static<typeof MeteoraClmmAddLiquidityRequest>;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Meteora position',
        tags: ['/connector/meteora'],
        body: MeteoraClmmAddLiquidityRequest,
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress, baseTokenAmount, quoteTokenAmount, slippagePct, strategyType } =
          request.body;
        const network = request.body.network;

        return await addLiquidity(
          fastify,
          network,
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        );
      } catch (e) {
        logger.error(e);
        if (e.statusCode) {
          throw fastify.httpErrors.createError(e.statusCode, 'Request failed');
        }
        throw fastify.httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default addLiquidityRoute;
