import { TxVersion } from '@raydium-io/raydium-sdk-v2';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { Solana } from '../../../chains/solana/solana';
import { AddLiquidityResponseType } from '../../../schemas/clmm-schema';
import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumConfig } from '../raydium.config';

import { quotePosition } from './quotePosition';

export async function addLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  baseTokenAmount: number,
  quoteTokenAmount: number,
  slippagePct: number = RaydiumConfig.config.slippagePct,
): Promise<AddLiquidityResponseType> {
  const solana = await Solana.getInstance(network);
  const raydium = await Raydium.getInstance(network);

  // Set the SDK owner to the wallet's public key — works for every wallet type (local,
  // hardware). The tx is built unsigned; signing/sending is delegated to
  // sendAndConfirmTransactionForWallet, which signs for the wallet's type.
  await raydium.setOwner(new PublicKey(walletAddress));

  const positionInfo = await raydium.getPositionInfo(positionAddress);
  const position = await raydium.getClmmPosition(positionAddress);
  if (!position) throw new Error('Position not found');

  const [poolInfo, poolKeys] = await raydium.getClmmPoolfromAPI(positionInfo.poolAddress);
  // const clmmPool = await raydium.getClmmPoolfromRPC(positionInfo.poolAddress);

  const baseToken = await solana.getToken(poolInfo.mintA.address);
  const quoteToken = await solana.getToken(poolInfo.mintB.address);

  const quotePositionResponse = await quotePosition(
    network,
    positionInfo.lowerPrice,
    positionInfo.upperPrice,
    positionInfo.poolAddress,
    baseTokenAmount,
    quoteTokenAmount,
    slippagePct,
  );
  logger.info('Adding liquidity to Raydium CLMM position...');

  // Use hardcoded compute units for add liquidity
  const COMPUTE_UNITS = 600000;

  // Get priority fee from solana (returns lamports/CU)
  const priorityFeeInLamports = await solana.estimateGasPrice();
  // Convert lamports to microLamports (1 lamport = 1,000,000 microLamports)
  const priorityFeePerCU = Math.floor(priorityFeeInLamports * 1e6);

  const { transaction } = await raydium.raydiumSDK.clmm.increasePositionFromBase({
    poolInfo,
    ownerPosition: position,
    ownerInfo: { useSOLBalance: true },
    base: quotePositionResponse.baseLimited ? 'MintA' : 'MintB',
    baseAmount: quotePositionResponse.baseLimited
      ? new BN(quotePositionResponse.baseTokenAmount * 10 ** baseToken.decimals)
      : new BN(quotePositionResponse.quoteTokenAmount * 10 ** quoteToken.decimals),
    otherAmountMax: quotePositionResponse.baseLimited
      ? new BN(quotePositionResponse.quoteTokenAmountMax * 10 ** quoteToken.decimals)
      : new BN(quotePositionResponse.baseTokenAmountMax * 10 ** baseToken.decimals),
    txVersion: TxVersion.V0,
    computeBudgetConfig: {
      units: COMPUTE_UNITS,
      microLamports: priorityFeePerCU,
    },
  });

  // Sign + send via the wallet-type-aware chokepoint (handles local/hardware and
  // simulates internally).
  const { signature } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  // Retrying re-fetch; throws the shared landed-but-failed error if the transaction
  // landed with an error, so txData existing below really means "confirmed".
  const txData = await solana.getConfirmedTransactionData(signature);
  const confirmed = txData !== null;

  if (confirmed && txData) {
    const totalFee = txData.meta.fee;

    // Handle balance changes - need to be careful when SOL is one of the tokens
    const tokenAddresses = [];
    const baseTokenAddress = baseToken?.address || poolInfo.mintA.address;
    const quoteTokenAddress = quoteToken?.address || poolInfo.mintB.address;
    const isBaseSol = baseToken?.symbol === 'SOL' || baseTokenAddress === 'So11111111111111111111111111111111111111112';
    const isQuoteSol =
      quoteToken?.symbol === 'SOL' || quoteTokenAddress === 'So11111111111111111111111111111111111111112';

    // Always get SOL balance change first
    tokenAddresses.push('So11111111111111111111111111111111111111112');

    // Add non-SOL tokens
    if (!isBaseSol) {
      tokenAddresses.push(baseTokenAddress);
    }
    if (!isQuoteSol) {
      tokenAddresses.push(quoteTokenAddress);
    }

    const { balanceChanges } = await solana.extractBalanceChangesAndFee(signature, walletAddress, tokenAddresses);

    // Parse balance changes
    const solChangeIndex = 0;
    const baseChangeIndex = isBaseSol ? 0 : 1;
    const quoteChangeIndex = isQuoteSol ? 0 : isBaseSol ? 1 : 2;

    const baseTokenBalanceChange = balanceChanges[baseChangeIndex];
    const quoteTokenBalanceChange = balanceChanges[quoteChangeIndex];

    return {
      signature,
      status: 1, // CONFIRMED
      data: {
        // The pool this position belongs to, already loaded here. The unified route is
        // position-addressed and never receives it, so this is the only place it can
        // come from without a second lookup.
        poolAddress: position.poolId.toBase58(),
        fee: totalFee / 1e9,
        // Magnitudes, as everywhere else: a deposit's signed wallet delta is negative,
        // and `…Added` naming a negative number is wrong at the source. Adding to an
        // existing position locks no new rent, so there is nothing to back out.
        baseTokenAmountAdded: Math.abs(baseTokenBalanceChange),
        quoteTokenAmountAdded: Math.abs(quoteTokenBalanceChange),
      },
    };
  } else {
    // Return pending status for Hummingbot to handle retry
    return {
      signature,
      status: 0, // PENDING
    };
  }
}
