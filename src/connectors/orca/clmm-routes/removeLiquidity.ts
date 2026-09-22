import { decreaseLiquidityInstructions } from '@orca-so/whirlpools';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import { address } from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import { fetchAllMint } from '@solana-program/token-2022';
import { Decimal } from 'decimal.js';

import { Solana } from '../../../chains/solana/solana';
import { RemoveLiquidityResponseType } from '../../../schemas/clmm-schema';
import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { Orca } from '../orca';
import { OrcaConfig } from '../orca.config';
import { buildOrcaTransaction, createOrcaAuthority } from '../orca.sdk';

export async function removeLiquidity(
  network: string,
  walletAddress: string,
  positionAddress: string,
  percentageToRemove: number,
  slippagePct: number = OrcaConfig.config.slippagePct ?? 1,
): Promise<RemoveLiquidityResponseType> {
  if (percentageToRemove <= 0 || percentageToRemove > 100) {
    throw httpErrors.badRequest('percentageToRemove must be between 0 and 100');
  }

  const solana = await Solana.getInstance(network);
  const orca = await Orca.getInstance(network);
  const walletPublicKey = new PublicKey(walletAddress);
  const position = await fetchPosition(orca.solanaKitRpc, address(positionAddress));
  const whirlpool = await fetchWhirlpool(orca.solanaKitRpc, position.data.whirlpool);
  const [mintA, mintB] = await fetchAllMint(orca.solanaKitRpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  const liquidityAmount = BigInt(
    new Decimal(position.data.liquidity.toString()).mul(percentageToRemove).div(100).floor().toFixed(0),
  );

  if (liquidityAmount <= 0n || liquidityAmount > position.data.liquidity) {
    throw httpErrors.badRequest('Invalid liquidity amount calculated');
  }

  const result = await decreaseLiquidityInstructions(
    orca.solanaKitRpc,
    position.data.positionMint,
    { liquidity: liquidityAmount },
    {
      authority: createOrcaAuthority(walletAddress),
      slippageToleranceBps: Math.round(slippagePct * 100),
      whirlpoolDeployment: orca.deployment,
    },
  );
  logger.info(
    `Removing ${percentageToRemove}% liquidity, estimated: ` +
      `${(Number(result.quote.tokenEstA) / 10 ** mintA.data.decimals).toFixed(6)} tokenA, ` +
      `${(Number(result.quote.tokenEstB) / 10 ** mintB.data.decimals).toFixed(6)} tokenB`,
  );

  const transaction = buildOrcaTransaction(result.instructions, walletAddress);
  const { signature, fee } = await solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const tokenAAddress = whirlpool.data.tokenMintA.toString();
  const tokenBAddress = whirlpool.data.tokenMintB.toString();
  const [tokenA, tokenB, balanceResult] = await Promise.all([
    solana.getToken(tokenAAddress),
    solana.getToken(tokenBAddress),
    solana.extractBalanceChangesAndFee(signature, walletPublicKey.toBase58(), [tokenAAddress, tokenBAddress]),
  ]);
  const { balanceChanges } = balanceResult;

  logger.info(
    `Liquidity removed: ${Math.abs(balanceChanges[0]).toFixed(6)} ${tokenA?.symbol || 'tokenA'}, ` +
      `${Math.abs(balanceChanges[1]).toFixed(6)} ${tokenB?.symbol || 'tokenB'}`,
  );

  return {
    signature,
    status: 1,
    data: {
      // The pool this position belongs to, already loaded here. The unified route is
      // position-addressed and never receives it, so this is the only place it can
      // come from without a second lookup.
      poolAddress: position.data.whirlpool.toString(),
      fee,
      baseTokenAmountRemoved: Math.abs(balanceChanges[0]),
      quoteTokenAmountRemoved: Math.abs(balanceChanges[1]),
    },
  };
}
