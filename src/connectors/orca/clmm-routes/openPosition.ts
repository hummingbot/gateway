import { openPositionInstructionsWithTickBounds } from '@orca-so/whirlpools';
import {
  fetchAllMaybeTickArray,
  fetchWhirlpool,
  getInitializeDynamicTickArrayInstruction,
  getOpenPositionWithTokenExtensionsInstruction,
  getPositionAddress,
  getTickArrayAddress,
} from '@orca-so/whirlpools-client';
import {
  getInitializableTickIndex,
  getTickArrayStartTickIndex,
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  priceToTickIndex,
  type IncreaseLiquidityQuote,
} from '@orca-so/whirlpools-core';
import { address, type Instruction } from '@solana/kit';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';

import { Solana } from '../../../chains/solana/solana';
import { OpenPositionResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaConfig } from '../orca.config';
import { getCurrentTransferFee } from '../orca.position';
import { buildOrcaTransaction, createOrcaAuthority, replaceOrcaInstructionAccounts } from '../orca.sdk';
import { extractInnerTransferAmounts } from '../orca.utils';

export async function openPosition(
  network: string,
  walletAddress: string,
  poolAddress: string,
  lowerPrice: number,
  upperPrice: number,
  baseTokenAmount?: number,
  quoteTokenAmount?: number,
  slippagePct?: number,
): Promise<OpenPositionResponseType> {
  if (lowerPrice >= upperPrice) {
    throw httpErrors.badRequest('lowerPrice must be less than upperPrice');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const rpc = orca.solanaKitRpc;
  const walletPublicKey = new PublicKey(walletAddress);
  const whirlpool = await fetchWhirlpool(rpc, address(poolAddress));
  const [mintA, mintB] = await fetchAllMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  const rawLowerTick = priceToTickIndex(lowerPrice, mintA.data.decimals, mintB.data.decimals);
  const rawUpperTick = priceToTickIndex(upperPrice, mintA.data.decimals, mintB.data.decimals);
  const lowerTickIndex = getInitializableTickIndex(rawLowerTick, whirlpool.data.tickSpacing, false);
  const upperTickIndex = getInitializableTickIndex(rawUpperTick, whirlpool.data.tickSpacing, true);

  if (lowerTickIndex >= upperTickIndex) {
    throw httpErrors.badRequest('Calculated tick indices are invalid (lower >= upper)');
  }

  const slippageBps = Math.round((slippagePct ?? OrcaConfig.config.slippagePct ?? 1) * 100);
  const baseAmount = BigInt(Math.floor((baseTokenAmount || 0) * 10 ** mintA.data.decimals));
  const quoteAmount = BigInt(Math.floor((quoteTokenAmount || 0) * 10 ** mintB.data.decimals));
  const shouldAddLiquidity = baseAmount > 0n || quoteAmount > 0n;
  let liquidityQuote: IncreaseLiquidityQuote | undefined;

  if (shouldAddLiquidity) {
    const currentEpoch = await rpc.getEpochInfo().send();
    const transferFeeA = getCurrentTransferFee(mintA, currentEpoch.epoch);
    const transferFeeB = getCurrentTransferFee(mintB, currentEpoch.epoch);
    const quoteFromBase =
      baseAmount > 0n
        ? increaseLiquidityQuoteA(
            baseAmount,
            slippageBps,
            whirlpool.data.sqrtPrice,
            lowerTickIndex,
            upperTickIndex,
            transferFeeA,
            transferFeeB,
          )
        : undefined;
    const quoteFromQuote =
      quoteAmount > 0n
        ? increaseLiquidityQuoteB(
            quoteAmount,
            slippageBps,
            whirlpool.data.sqrtPrice,
            lowerTickIndex,
            upperTickIndex,
            transferFeeA,
            transferFeeB,
          )
        : undefined;
    liquidityQuote =
      quoteFromBase && quoteFromQuote
        ? quoteFromBase.liquidityDelta < quoteFromQuote.liquidityDelta
          ? quoteFromBase
          : quoteFromQuote
        : quoteFromBase || quoteFromQuote;

    if (!liquidityQuote || liquidityQuote.liquidityDelta <= 0n) {
      throw httpErrors.badRequest('Token amount is too small to open a position with liquidity');
    }
  }

  const authority = createOrcaAuthority(walletAddress);
  const positionMintKeypair = Keypair.generate();
  const positionMintAddress = address(positionMintKeypair.publicKey.toBase58());
  const [positionAddress] = await getPositionAddress(positionMintAddress, orca.deployment.programId);
  const positionTokenAccount = getAssociatedTokenAddressSync(
    positionMintKeypair.publicKey,
    walletPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const lowerTickArrayIndex = getTickArrayStartTickIndex(lowerTickIndex, whirlpool.data.tickSpacing);
  const upperTickArrayIndex = getTickArrayStartTickIndex(upperTickIndex, whirlpool.data.tickSpacing);
  const [[lowerTickArrayAddress], [upperTickArrayAddress]] = await Promise.all([
    getTickArrayAddress(whirlpool.address, lowerTickArrayIndex, orca.deployment.programId),
    getTickArrayAddress(whirlpool.address, upperTickArrayIndex, orca.deployment.programId),
  ]);
  const [lowerTickArray, upperTickArray] = await fetchAllMaybeTickArray(rpc, [
    lowerTickArrayAddress,
    upperTickArrayAddress,
  ]);
  const newTickArrayAddresses = [
    ...(!lowerTickArray.exists ? [lowerTickArrayAddress] : []),
    ...(!upperTickArray.exists && upperTickArrayAddress !== lowerTickArrayAddress ? [upperTickArrayAddress] : []),
  ];

  let instructions: Instruction[];
  if (liquidityQuote) {
    // The high-level builder covers Token-2022 token accounts, transfer fees,
    // WSOL wrapping, tick-array initialization, open, and increase-liquidity.
    // It generates its own Kit signer, so replace that generated position's
    // account addresses with Gateway's Web3.js Keypair addresses.
    const generated = await openPositionInstructionsWithTickBounds(
      rpc,
      whirlpool.address,
      { tokenMaxA: liquidityQuote.tokenMaxA, tokenMaxB: liquidityQuote.tokenMaxB },
      lowerTickIndex,
      upperTickIndex,
      {
        funder: authority,
        slippageToleranceBps: slippageBps,
        withTokenMetadataExtension: true,
        whirlpoolDeployment: orca.deployment,
      },
    );
    const [generatedPositionAddress] = await getPositionAddress(generated.positionMint, orca.deployment.programId);
    const generatedTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(generated.positionMint),
      walletPublicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );
    instructions = replaceOrcaInstructionAccounts(
      generated.instructions,
      new Map([
        [generated.positionMint.toString(), positionMintAddress.toString()],
        [generatedPositionAddress.toString(), positionAddress.toString()],
        [generatedTokenAccount.toBase58(), positionTokenAccount.toBase58()],
      ]),
    );
  } else {
    instructions = [];
    if (!lowerTickArray.exists) {
      instructions.push(
        getInitializeDynamicTickArrayInstruction(
          {
            whirlpool: whirlpool.address,
            funder: authority,
            tickArray: lowerTickArrayAddress,
            startTickIndex: lowerTickArrayIndex,
            idempotent: false,
          },
          { programAddress: orca.deployment.programId },
        ),
      );
    }
    if (!upperTickArray.exists && upperTickArrayAddress !== lowerTickArrayAddress) {
      instructions.push(
        getInitializeDynamicTickArrayInstruction(
          {
            whirlpool: whirlpool.address,
            funder: authority,
            tickArray: upperTickArrayAddress,
            startTickIndex: upperTickArrayIndex,
            idempotent: false,
          },
          { programAddress: orca.deployment.programId },
        ),
      );
    }
    instructions.push(
      getOpenPositionWithTokenExtensionsInstruction(
        {
          funder: authority,
          owner: authority.address,
          position: positionAddress,
          positionMint: createOrcaAuthority(positionMintAddress),
          positionTokenAccount: address(positionTokenAccount.toBase58()),
          whirlpool: whirlpool.address,
          tickLowerIndex: lowerTickIndex,
          tickUpperIndex: upperTickIndex,
          withTokenMetadataExtension: true,
        },
        { programAddress: orca.deployment.programId },
      ),
    );
  }

  const transaction = buildOrcaTransaction(instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress, [
    positionMintKeypair,
  ]);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);

  let positionRent = 0;
  let baseTokenAmountAdded = liquidityQuote ? Number(liquidityQuote.tokenEstA) / 10 ** mintA.data.decimals : 0;
  let quoteTokenAmountAdded = liquidityQuote ? Number(liquidityQuote.tokenEstB) / 10 ** mintB.data.decimals : 0;

  if (txData) {
    const accountKeys = txData.transaction.message.getAccountKeys().staticAccountKeys;
    const preBalances = txData.meta?.preBalances || [];
    const postBalances = txData.meta?.postBalances || [];
    const rentAccounts = [
      positionMintKeypair.publicKey,
      new PublicKey(positionAddress),
      positionTokenAccount,
      ...newTickArrayAddresses.map((tickArray) => new PublicKey(tickArray)),
    ];
    let totalRentLamports = 0;
    for (const pubkey of rentAccounts) {
      const index = accountKeys.findIndex((key) => key.equals(pubkey));
      if (index !== -1 && preBalances[index] === 0 && postBalances[index] > 0) {
        totalRentLamports += postBalances[index];
      }
    }
    positionRent = totalRentLamports / 1e9;

    if (liquidityQuote) {
      const { transferGroups } = await extractInnerTransferAmounts(
        solana.connection,
        signature,
        orca.deployment.programId.toString(),
        [whirlpool.data.tokenMintA.toString(), whirlpool.data.tokenMintB.toString()],
      );
      if (transferGroups.length > 0) {
        [baseTokenAmountAdded, quoteTokenAmountAdded] = transferGroups[0];
      }
    }
  }

  logger.info(
    `Position created at ${positionAddress.toString()} with ${newTickArrayAddresses.length} new tick array(s)`,
  );
  return {
    signature,
    status: 1,
    data: {
      fee,
      positionAddress: positionAddress.toString(),
      positionRent,
      baseTokenAmountAdded,
      quoteTokenAmountAdded,
    },
  };
}
