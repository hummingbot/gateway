import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync, getAccount } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoBalanceRequest,
  MetaDaoBalanceRequestType,
  MetaDaoBalanceResponse,
  MetaDaoBalanceResponseType,
  MetaDaoTokenBalance,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { MetaDao } from '../metadao';

async function getTokenBalance(
  metadao: MetaDao,
  owner: PublicKey,
  mint: PublicKey,
  symbol: string,
  decimals: number,
): Promise<MetaDaoTokenBalance> {
  const solana = metadao.getSolana();

  try {
    const ata = getAssociatedTokenAddressSync(mint, owner);
    const account = await getAccount(solana.connection, ata);

    const balanceRaw = account.amount.toString();
    const balance = metadao.fromRawAmount(new BN(balanceRaw), decimals);

    return {
      mint: mint.toString(),
      symbol,
      balance,
      balanceRaw,
      decimals,
      ata: ata.toString(),
    };
  } catch {
    // Account doesn't exist - return zero balance
    return {
      mint: mint.toString(),
      symbol,
      balance: 0,
      balanceRaw: '0',
      decimals,
    };
  }
}

export const balanceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoBalanceRequestType;
    Reply: MetaDaoBalanceResponseType;
  }>(
    '/balance',
    {
      schema: {
        description: 'Get token balances for MetaDAO (base, quote, and conditional tokens)',
        tags: ['/connector/metadao'],
        querystring: MetaDaoBalanceRequest,
        response: {
          200: MetaDaoBalanceResponse,
        },
      },
    },
    async (request): Promise<MetaDaoBalanceResponseType> => {
      const { dao: daoAddress, proposal: proposalAddress } = request.query;
      const network = request.query.network || 'mainnet-beta';
      const ownerAddress = request.query.ownerAddress;

      if (!ownerAddress) {
        throw fastify.httpErrors.badRequest('ownerAddress is required');
      }

      try {
        const metadao = await MetaDao.getInstance(network);

        const owner = new PublicKey(ownerAddress);

        // Fetch DAO account
        const daoAccount = await metadao.getDao(daoAddress);

        // Get token decimals and symbols
        const baseDecimals = await metadao.getTokenDecimals(daoAccount.baseMint.toString());
        const quoteDecimals = await metadao.getTokenDecimals(daoAccount.quoteMint.toString());
        const baseSymbol = await metadao.getTokenSymbol(daoAccount.baseMint.toString());
        const quoteSymbol = await metadao.getTokenSymbol(daoAccount.quoteMint.toString());

        // Get spot token balances
        const baseBalance = await getTokenBalance(metadao, owner, daoAccount.baseMint, baseSymbol, baseDecimals);

        const quoteBalance = await getTokenBalance(metadao, owner, daoAccount.quoteMint, quoteSymbol, quoteDecimals);

        const response: MetaDaoBalanceResponseType = {
          owner: ownerAddress,
          pool: daoAddress,
          balances: {
            base: baseBalance,
            quote: quoteBalance,
          },
        };

        // Get LP position if any
        try {
          const ammPosition = await metadao.getAmmPosition(daoAddress, ownerAddress);
          if (ammPosition && !ammPosition.liquidity.isZero()) {
            const liquidity = metadao.fromRawLiquidity(ammPosition.liquidity, quoteDecimals);
            const totalLiquidity = metadao.fromRawLiquidity(daoAccount.totalLiquidity, quoteDecimals);
            const shareOfPool = totalLiquidity > 0 ? (liquidity / totalLiquidity) * 100 : 0;

            response.balances.lpPosition = {
              liquidity,
              liquidityRaw: ammPosition.liquidity.toString(),
              shareOfPool,
            };
          }
        } catch {
          // LP position doesn't exist - that's fine
        }

        // Get conditional token balances if proposal provided
        if (proposalAddress) {
          response.proposal = proposalAddress;

          try {
            const proposalAccount = await metadao.getProposal(proposalAddress);
            response.proposalState = metadao.getProposalState(proposalAccount);

            const pdas = await metadao.getProposalPdas(daoAddress, proposalAddress);

            // Get all conditional token balances
            response.balances.passBase = await getTokenBalance(
              metadao,
              owner,
              pdas.passBaseMint,
              `p${baseSymbol}`,
              baseDecimals,
            );

            response.balances.passQuote = await getTokenBalance(
              metadao,
              owner,
              pdas.passQuoteMint,
              `p${quoteSymbol}`,
              quoteDecimals,
            );

            response.balances.failBase = await getTokenBalance(
              metadao,
              owner,
              pdas.failBaseMint,
              `f${baseSymbol}`,
              baseDecimals,
            );

            response.balances.failQuote = await getTokenBalance(
              metadao,
              owner,
              pdas.failQuoteMint,
              `f${quoteSymbol}`,
              quoteDecimals,
            );
          } catch (error) {
            logger.warn(`Failed to fetch conditional token balances for proposal ${proposalAddress}: ${error}`);
            // Don't fail the whole request if proposal fetch fails
          }
        }

        return response;
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error getting balances for owner ${ownerAddress}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to get balances: ${error}`);
      }
    },
  );
};
