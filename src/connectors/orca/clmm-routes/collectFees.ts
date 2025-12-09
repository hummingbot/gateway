import { TransactionBuilder } from '@orca-so/common-sdk';
import { WhirlpoolIx, TokenExtensionUtil, IGNORE_CACHE } from '@orca-so/whirlpools-sdk';
import { Static } from '@sinclair/typebox';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { Solana } from '../../../chains/solana/solana';
import { CollectFeesResponse, CollectFeesResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { getTickArrayPubkeys, handleWsolAta } from '../orca.utils';
import { OrcaClmmCollectFeesRequest } from '../schemas';

export async function collectFees(
  network: string,
  address: string,
  positionAddress: string,
): Promise<CollectFeesResponseType> {
  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const wallet = await solana.getWallet(address);
  const client = await orca.getWhirlpoolClientForWallet(address);
  const positionPubkey = new PublicKey(positionAddress);

  // Fetch position data
  const position = await client.getPosition(positionPubkey);
  if (!position) {
    throw httpErrors.notFound(`Position not found: ${positionAddress}`);
  }

  await position.refreshData();

  // Fetch position mint info
  const positionMint = await client.getFetcher().getMintInfo(position.getData().positionMint);
  if (!positionMint) {
    throw httpErrors.notFound(`Position mint not found: ${position.getData().positionMint.toString()}`);
  }

  // Fetch whirlpool data
  const whirlpoolPubkey = position.getData().whirlpool;
  const whirlpool = await client.getPool(whirlpoolPubkey, IGNORE_CACHE);
  if (!whirlpool) {
    throw httpErrors.notFound(`Whirlpool not found: ${whirlpoolPubkey.toString()}`);
  }

  await whirlpool.refreshData();

  // Fetch token mint info
  const mintA = await client.getFetcher().getMintInfo(whirlpool.getTokenAInfo().address);
  const mintB = await client.getFetcher().getMintInfo(whirlpool.getTokenBInfo().address);
  if (!mintA || !mintB) {
    throw httpErrors.notFound('Token mint not found');
  }

  // Fetch tick arrays
  const { lower: lowerTickArrayPubkey, upper: upperTickArrayPubkey } = getTickArrayPubkeys(
    position.getData(),
    whirlpool.getData(),
    whirlpoolPubkey,
  );

  const lowerTickArray = await client.getFetcher().getTickArray(lowerTickArrayPubkey);
  const upperTickArray = await client.getFetcher().getTickArray(upperTickArrayPubkey);
  if (!lowerTickArray || !upperTickArray) {
    throw httpErrors.notFound('Tick array not found');
  }

  // Build transaction
  const builder = new TransactionBuilder(client.getContext().connection, client.getContext().wallet);

  // Get token owner accounts (ATAs)
  const tokenOwnerAccountA = getAssociatedTokenAddressSync(
    whirlpool.getTokenAInfo().address,
    client.getContext().wallet.publicKey,
    undefined,
    mintA.tokenProgram,
  );
  const tokenOwnerAccountB = getAssociatedTokenAddressSync(
    whirlpool.getTokenBInfo().address,
    client.getContext().wallet.publicKey,
    undefined,
    mintB.tokenProgram,
  );

  // Handle WSOL ATAs for receiving collected fees
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenAInfo().address,
    tokenOwnerAccountA,
    mintA.tokenProgram,
    'receive',
  );
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenBInfo().address,
    tokenOwnerAccountB,
    mintB.tokenProgram,
    'receive',
  );

  // Add updateFeesAndRewardsIx if position has liquidity
  if (position.getData().liquidity.gtn(0)) {
    builder.addInstruction(
      WhirlpoolIx.updateFeesAndRewardsIx(client.getContext().program, {
        position: positionPubkey,
        tickArrayLower: lowerTickArrayPubkey,
        tickArrayUpper: upperTickArrayPubkey,
        whirlpool: whirlpoolPubkey,
      }),
    );
  }

  // Add collectFeesV2Ix
  builder.addInstruction(
    WhirlpoolIx.collectFeesV2Ix(client.getContext().program, {
      position: positionPubkey,
      positionAuthority: client.getContext().wallet.publicKey,
      tokenMintA: whirlpool.getTokenAInfo().address,
      tokenMintB: whirlpool.getTokenBInfo().address,
      positionTokenAccount: getAssociatedTokenAddressSync(
        position.getData().positionMint,
        client.getContext().wallet.publicKey,
        undefined,
        positionMint.tokenProgram,
      ),
      tokenOwnerAccountA,
      tokenOwnerAccountB,
      tokenProgramA: mintA.tokenProgram,
      tokenProgramB: mintB.tokenProgram,
      tokenVaultA: whirlpool.getTokenVaultAInfo().address,
      tokenVaultB: whirlpool.getTokenVaultBInfo().address,
      whirlpool: whirlpoolPubkey,
      tokenTransferHookAccountsA: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        client.getContext().provider.connection,
        mintA,
        tokenOwnerAccountA,
        whirlpool.getTokenVaultAInfo().address,
        client.getContext().wallet.publicKey,
      ),
      tokenTransferHookAccountsB: await TokenExtensionUtil.getExtraAccountMetasForTransferHook(
        client.getContext().provider.connection,
        mintB,
        tokenOwnerAccountB,
        whirlpool.getTokenVaultBInfo().address,
        client.getContext().wallet.publicKey,
      ),
    }),
  );

  // Auto-unwrap WSOL fees to native SOL
  logger.info('Auto-unwrapping WSOL fees (if any) back to native SOL');
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenAInfo().address,
    tokenOwnerAccountA,
    mintA.tokenProgram,
    'unwrap',
    undefined,
    solana,
  );
  await handleWsolAta(
    builder,
    client,
    whirlpool.getTokenBInfo().address,
    tokenOwnerAccountB,
    mintB.tokenProgram,
    'unwrap',
    undefined,
    solana,
  );

  // Build and simulate transaction
  const txPayload = await builder.build();
  const transaction = txPayload.transaction;
  await solana.simulateWithErrorHandling(transaction);

  // Send and confirm transaction
  const { signature, fee } = await solana.sendAndConfirmTransaction(transaction, [wallet]);

  // Extract collected fees from balance changes
  const tokenAAddress = whirlpool.getTokenAInfo().address.toString();
  const tokenBAddress = whirlpool.getTokenBInfo().address.toString();
  const tokenA = await solana.getToken(tokenAAddress);
  const tokenB = await solana.getToken(tokenBAddress);

  const { balanceChanges } = await solana.extractBalanceChangesAndFee(
    signature,
    client.getContext().wallet.publicKey.toString(),
    [tokenAAddress, tokenBAddress],
  );

  logger.info(
    `Fees collected: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA?.symbol || 'tokenA'}, ${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB?.symbol || 'tokenB'}`,
  );

  return {
    signature,
    status: 1, // CONFIRMED
    data: {
      fee,
      baseFeeAmountCollected: Math.abs(balanceChanges[0]),
      quoteFeeAmountCollected: Math.abs(balanceChanges[1]),
    },
  };
}

export const collectFeesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: Static<typeof OrcaClmmCollectFeesRequest>;
    Reply: CollectFeesResponseType;
  }>(
    '/collect-fees',
    {
      schema: {
        description: 'Collect fees from an Orca position',
        tags: ['/connector/orca'],
        body: OrcaClmmCollectFeesRequest,
        response: {
          200: CollectFeesResponse,
        },
      },
    },
    async (request) => {
      try {
        const { walletAddress, positionAddress } = request.body;
        const network = request.body.network;

        return await collectFees(network, walletAddress, positionAddress);
      } catch (e) {
        logger.error(e);
        if (e.statusCode) throw e;
        throw httpErrors.internalServerError('Internal server error');
      }
    },
  );
};

export default collectFeesRoute;
