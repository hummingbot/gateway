import { BN } from '@coral-xyz/anchor';
import { PublicKey, Transaction } from '@solana/web3.js';
import { FastifyPluginAsync } from 'fastify';

import { getSolanaChainConfig } from '../../../chains/solana/solana.config';
import {
  MetaDaoSplitTokensRequest,
  MetaDaoSplitTokensRequestType,
  MetaDaoSplitTokensResponse,
  MetaDaoSplitTokensResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { MetaDao } from '../metadao';

export const splitTokensRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: MetaDaoSplitTokensRequestType;
    Reply: MetaDaoSplitTokensResponseType;
  }>(
    '/split-tokens',
    {
      schema: {
        description:
          'Split underlying tokens into equal amounts of pass and fail conditional tokens (conditional vault deposit)',
        tags: ['/connector/metadao'],
        body: MetaDaoSplitTokensRequest,
        response: {
          200: MetaDaoSplitTokensResponse,
        },
      },
    },
    async (request): Promise<MetaDaoSplitTokensResponseType> => {
      const { dao: daoAddress, proposal: proposalAddress, asset, amount } = request.body;
      const network = request.body.network || 'mainnet-beta';

      try {
        const metadao = await MetaDao.getInstance(network);
        const solana = metadao.getSolana();

        const walletAddress = request.body.walletAddress || getSolanaChainConfig().defaultWallet;
        if (!walletAddress) {
          throw fastify.httpErrors.badRequest('No wallet address provided and no default wallet configured');
        }

        const wallet = await solana.getWallet(walletAddress);
        const userPubkey = new PublicKey(walletAddress);

        const daoAccount = await metadao.getDao(daoAddress);
        const proposalAccount = await metadao.getProposal(proposalAddress);
        const proposalState = metadao.getProposalState(proposalAccount);
        if (proposalState !== 'pending') {
          throw fastify.httpErrors.badRequest(`Proposal is not in active trading state (current: ${proposalState})`);
        }

        const underlyingMint = asset === 'base' ? daoAccount.baseMint : daoAccount.quoteMint;
        const decimals = await metadao.getTokenDecimals(underlyingMint.toString());
        const rawAmount: BN = metadao.toRawAmount(amount, decimals);

        const ixs = await metadao.buildSplitTokensIxs({
          dao: new PublicKey(daoAddress),
          proposal: new PublicKey(proposalAddress),
          user: userPubkey,
          asset,
          amount: rawAmount,
        });

        const connection = solana.connection;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        const transaction = new Transaction({
          feePayer: userPubkey,
          blockhash,
          lastValidBlockHeight,
        }).add(...ixs);

        transaction.sign(wallet);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        const confirmation = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed',
        );

        const status = confirmation.value.err ? -1 : 1;

        const passMint = asset === 'base' ? proposalAccount.passBaseMint : proposalAccount.passQuoteMint;
        const failMint = asset === 'base' ? proposalAccount.failBaseMint : proposalAccount.failQuoteMint;

        return {
          signature,
          status,
          data: {
            asset,
            underlyingMint: underlyingMint.toString(),
            passMint: passMint.toString(),
            failMint: failMint.toString(),
            amount,
          },
        };
      } catch (error) {
        if (error.statusCode) throw error;
        logger.error(`Error splitting tokens for proposal ${proposalAddress}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to split tokens: ${error}`);
      }
    },
  );
};
