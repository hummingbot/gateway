/**
 * The trading fees a Meteora DBC launch owes the wallet: the pool creator's share and,
 * when the wallet is the config's fee claimer, the partner's. One transaction claims
 * every share the wallet is owed on that pool. Fees of the DAMM v2 positions a migrated
 * launch left behind are claimed on the AMM surface (/trading/amm/collect-fees).
 */
import { PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

import { httpErrors } from '../../../services/error-handler';
import { logger } from '../../../services/logger';
import { sanitizeErrorMessage } from '../../../services/sanitize';
import { MeteoraDbc } from '../meteora-dbc';
import { fromRawAmount } from '../meteora-dbc.utils';

const U64_MAX = new BN('18446744073709551615');

function key(value: string, field: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw httpErrors.badRequest(sanitizeErrorMessage(`Invalid ${field}: {}`, value));
  }
}

export async function claimCreatorFees(
  network: string,
  walletAddress: string,
  baseMint: string,
): Promise<{ signature: string; status: number; claimed: number; quoteMint: string; fee?: number }> {
  const dbc = await MeteoraDbc.getInstance(network);
  const wallet = key(walletAddress, 'walletAddress');
  const state = await dbc.getPoolByBaseMint(key(baseMint, 'baseMint'));
  const ps = state.pool.poolState;

  const isCreator = ps.creator.equals(wallet);
  const isPartner = state.config.feeClaimer.equals(wallet);
  if (!isCreator && !isPartner) {
    throw httpErrors.badRequest(
      `${walletAddress} is neither the creator (${ps.creator.toBase58()}) nor the fee claimer ` +
        `(${state.config.feeClaimer.toBase58()}) of the Meteora DBC pool ${state.poolAddress.toBase58()}`,
    );
  }

  const owed = (base: BN, quote: BN) => !base.isZero() || !quote.isZero();
  const transaction = new Transaction();
  let quoteRaw = new BN(0);
  if (isCreator && owed(ps.creatorBaseFee, ps.creatorQuoteFee)) {
    const tx = await dbc.client.creator.claimCreatorTradingFee({
      creator: wallet,
      payer: wallet,
      pool: state.poolAddress,
      maxBaseAmount: U64_MAX,
      maxQuoteAmount: U64_MAX,
    });
    transaction.add(...tx.instructions);
    quoteRaw = quoteRaw.add(ps.creatorQuoteFee);
  }
  if (isPartner && owed(ps.partnerBaseFee, ps.partnerQuoteFee)) {
    const tx = await dbc.client.partner.claimPartnerTradingFee({
      feeClaimer: wallet,
      payer: wallet,
      pool: state.poolAddress,
      maxBaseAmount: U64_MAX,
      maxQuoteAmount: U64_MAX,
    });
    transaction.add(...tx.instructions);
    quoteRaw = quoteRaw.add(ps.partnerQuoteFee);
  }
  if (transaction.instructions.length === 0) {
    throw httpErrors.badRequest(
      sanitizeErrorMessage('No Meteora DBC trading fees to claim on {} for this wallet', baseMint),
    );
  }
  transaction.feePayer = wallet;

  const { signature } = await dbc.solana.sendAndConfirmTransactionForWallet(transaction, walletAddress);
  const txData = await dbc.solana.getConfirmedTransactionData(signature);
  const claimed = fromRawAmount(quoteRaw, state.quoteDecimals);
  const quoteMint = state.quoteMint.toBase58();
  logger.info(`Claimed ${claimed} of ${quoteMint} in Meteora DBC fees on ${baseMint}: ${signature}`);
  if (!txData) return { signature, status: 0, claimed, quoteMint };
  return { signature, status: 1, claimed, quoteMint, fee: txData.meta.fee / 1e9 };
}
