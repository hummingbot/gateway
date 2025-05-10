import { StrategyType } from '@meteora-ag/dlmm';
import { DecimalUtil } from '@orca-so/common-sdk';
import { Type, Static } from '@sinclair/typebox';
import { PublicKey } from '@solana/web3.js';
import { BN } from 'bn.js';
import { Decimal } from 'decimal.js';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import {
  AddLiquidityRequest,
  AddLiquidityResponse,
  AddLiquidityResponseType,
} from '../../../schemas/trading-types/clmm-schema';
import { logger } from '../../../services/logger';
import { Meteora } from '../meteora';
import { MeteoraConfig } from '../meteora.config';

// Using Fastify's native error handling

// Define error messages
const INVALID_SOLANA_ADDRESS_MESSAGE = (address: string) =>
  `Invalid Solana address: ${address}`;
const MISSING_AMOUNTS_MESSAGE = 'Missing amounts for liquidity addition';
const INSUFFICIENT_BALANCE_MESSAGE = (
  token: string,
  required: string,
  actual: string,
) =>
  `Insufficient balance for ${token}. Required: ${required}, Available: ${actual}`;

const SOL_TRANSACTION_BUFFER = 0.01; // SOL buffer for transaction costs

async function addLiquidity(
  fastify: FastifyInstance,
  network: string,
  address: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct?: number,
  strategyType?: StrategyType,
): Promise<AddLiquidityResponseType> {
  // Validate addresses first
  try {
    new PublicKey(positionAddress);
    new PublicKey(address);
  } catch (error) {
    throw fastify.httpErrors.badRequest(
      INVALID_SOLANA_ADDRESS_MESSAGE(positionAddress),
    );
  }

  const solana = await Solana.getInstance(network);
  const meteora = await Meteora.getInstance(network);
  const wallet = await solana.getWallet(address);

  // Validate amounts
  if (baseTokenAmount <= 0 && quoteTokenAmount <= 0) {
    throw fastify.httpErrors.badRequest(MISSING_AMOUNTS_MESSAGE);
  }

  const { position, info } = await meteora.getRawPosition(
    positionAddress,
    wallet.publicKey,
  );

  if (!position) {
    throw fastify.httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  const dlmmPool = await meteora.getDlmmPool(info.publicKey.toBase58());
  if (!dlmmPool) {
    throw fastify.httpErrors.notFound(
      `Pool not found for position: ${positionAddress}`,
    );
  }

  const tokenX = await solana.getToken(dlmmPool.tokenX.publicKey.toBase58());
  const tokenY = await solana.getToken(dlmmPool.tokenY.publicKey.toBase58());
  const tokenXSymbol = tokenX?.symbol || 'UNKNOWN';
  const tokenYSymbol = tokenY?.symbol || 'UNKNOWN';

  // Check balances with transaction buffer
  const balances = await solana.getBalance(wallet, [
    tokenXSymbol,
    tokenYSymbol,
    'SOL',
  ]);
  const requiredBase =
    baseTokenAmount + (tokenXSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);
  const requiredQuote =
    quoteTokenAmount + (tokenYSymbol === 'SOL' ? SOL_TRANSACTION_BUFFER : 0);

  if (balances[tokenXSymbol] < requiredBase) {
    throw fastify.httpErrors.badRequest(
      INSUFFICIENT_BALANCE_MESSAGE(
        tokenXSymbol,
        requiredBase.toString(),
        balances[tokenXSymbol].toString(),
      ),
    );
  }

  if (balances[tokenYSymbol] < requiredQuote) {
    throw fastify.httpErrors.badRequest(
      INSUFFICIENT_BALANCE_MESSAGE(
        tokenYSymbol,
        requiredQuote.toString(),
        balances[tokenYSymbol].toString(),
      ),
    );
  }

  logger.info(
    `Adding liquidity to position ${positionAddress}: ${baseTokenAmount.toFixed(4)} ${tokenXSymbol}, ${quoteTokenAmount.toFixed(4)} ${tokenYSymbol}`,
  );
  const maxBinId = position.positionData.upperBinId;
  const minBinId = position.positionData.lowerBinId;

  const totalXAmount = new BN(
    DecimalUtil.toBN(new Decimal(baseTokenAmount), dlmmPool.tokenX.decimal),
  );
  const totalYAmount = new BN(
    DecimalUtil.toBN(new Decimal(quoteTokenAmount), dlmmPool.tokenY.decimal),
  );

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
    slippage: slippagePct ?? meteora.getSlippagePct(),
  });

  const { signature, fee } = await solana.sendAndConfirmTransaction(
    addLiquidityTx,
    [wallet],
    800_000,
  );

  const { balanceChange: tokenXAddedAmount } =
    await solana.extractTokenBalanceChangeAndFee(
      signature,
      dlmmPool.tokenX.publicKey.toBase58(),
      dlmmPool.pubkey.toBase58(),
    );

  const { balanceChange: tokenYAddedAmount } =
    await solana.extractTokenBalanceChangeAndFee(
      signature,
      dlmmPool.tokenY.publicKey.toBase58(),
      dlmmPool.pubkey.toBase58(),
    );

  logger.info(
    `Liquidity added to position ${positionAddress}: ${Math.abs(tokenXAddedAmount).toFixed(4)} ${tokenXSymbol}, ${Math.abs(tokenYAddedAmount).toFixed(4)} ${tokenYSymbol}`,
  );

  return {
    signature,
    baseTokenAmountAdded: Math.abs(tokenXAddedAmount),
    quoteTokenAmountAdded: Math.abs(tokenYAddedAmount),
    fee,
  };
}

export const MeteoraAddLiquidityRequest = Type.Intersect(
  [
    AddLiquidityRequest,
    Type.Object({
      strategyType: Type.Optional(
        Type.Number({
          enum: Object.values(StrategyType).filter(
            (x) => typeof x === 'number',
          ),
        }),
      ),
    }),
  ],
  { $id: 'MeteoraAddLiquidityRequest' },
);

export type MeteoraAddLiquidityRequestType = Static<
  typeof MeteoraAddLiquidityRequest
>;

export const addLiquidityRoute: FastifyPluginAsync = async (fastify) => {
  // Get first wallet address for example
  const solana = await Solana.getInstance('mainnet-beta');
  let firstWalletAddress = '<solana-wallet-address>';

  const foundWallet = await solana.getFirstWalletAddress();
  if (foundWallet) {
    firstWalletAddress = foundWallet;
  } else {
    logger.debug('No wallets found for examples in schema');
  }

  // Update schema example
  AddLiquidityRequest.properties.walletAddress.examples = [firstWalletAddress];

  fastify.post<{
    Body: MeteoraAddLiquidityRequestType;
    Reply: AddLiquidityResponseType;
  }>(
    '/add-liquidity',
    {
      schema: {
        description: 'Add liquidity to a Meteora position',
        tags: ['meteora/clmm'],
        body: {
          ...AddLiquidityRequest,
          properties: {
            ...AddLiquidityRequest.properties,
            network: { type: 'string', default: 'mainnet-beta' },
            slippagePct: { type: 'number', examples: [1] },
            strategyType: {
              type: 'number',
              examples: [StrategyType.SpotImBalanced],
              enum: Object.values(StrategyType).filter(
                (x) => typeof x === 'number',
              ),
            },
          },
        },
        response: {
          200: AddLiquidityResponse,
        },
      },
    },
    async (request) => {
      try {
        const {
          walletAddress,
          positionAddress,
          baseTokenAmount,
          quoteTokenAmount,
          slippagePct,
          strategyType,
        } = request.body;
        const network = request.body.network || 'mainnet-beta';

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
