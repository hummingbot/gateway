import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoProposalInfoRequest,
  MetaDaoProposalInfoRequestType,
  MetaDaoProposalInfoResponse,
  MetaDaoProposalInfoResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { MetaDao } from '../metadao';

export const proposalInfoRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoProposalInfoRequestType;
    Reply: MetaDaoProposalInfoResponseType;
  }>(
    '/proposal-info',
    {
      schema: {
        description: 'Get detailed information about a MetaDAO proposal including pass/fail markets',
        tags: ['/connector/metadao'],
        querystring: MetaDaoProposalInfoRequest,
        response: {
          200: MetaDaoProposalInfoResponse,
        },
      },
    },
    async (request): Promise<MetaDaoProposalInfoResponseType> => {
      const { proposal: proposalAddress } = request.query;
      const network = request.query.network || 'mainnet-beta';

      try {
        const metadao = await MetaDao.getInstance(network);
        const info = await metadao.getProposalInfo(undefined, proposalAddress);

        return {
          proposal: info.proposal,
          pool: info.dao,
          number: info.number,
          status: info.status,
          launchedAt: info.launchedAt,
          tradingEndsAt: info.tradingEndsAt,
          baseMint: info.baseMint,
          quoteMint: info.quoteMint,
          baseSymbol: info.baseSymbol,
          quoteSymbol: info.quoteSymbol,
          pdas: {
            question: info.pdas.question.toString(),
            baseVault: info.pdas.baseVault.toString(),
            quoteVault: info.pdas.quoteVault.toString(),
            passBaseMint: info.pdas.passBaseMint.toString(),
            passQuoteMint: info.pdas.passQuoteMint.toString(),
            failBaseMint: info.pdas.failBaseMint.toString(),
            failQuoteMint: info.pdas.failQuoteMint.toString(),
          },
          passPool: info.passPool,
          failPool: info.failPool,
          impliedProbability: info.impliedProbability,
          passMarketCap: info.passMarketCap,
          failMarketCap: info.failMarketCap,
        };
      } catch (error) {
        if ((error as any).statusCode) throw error;
        logger.error(`Error getting proposal info for ${proposalAddress}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to get proposal info: ${error}`);
      }
    },
  );
};
