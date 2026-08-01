import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoListProposalsRequest,
  MetaDaoListProposalsRequestType,
  MetaDaoListProposalsResponse,
  MetaDaoListProposalsResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import { findDaoByBaseToken } from '../dao-lookup';
import { MetaDao } from '../metadao';

export const listProposalsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoListProposalsRequestType;
    Reply: MetaDaoListProposalsResponseType;
  }>(
    '/proposals',
    {
      schema: {
        description: 'List proposals for a MetaDAO DAO',
        tags: ['/connector/metadao'],
        querystring: MetaDaoListProposalsRequest,
        response: {
          200: MetaDaoListProposalsResponse,
        },
      },
    },
    async (request): Promise<MetaDaoListProposalsResponseType> => {
      const { baseToken } = request.query;
      const status = (request.query.status || 'all') as 'pending' | 'passed' | 'failed' | 'all';
      const network = request.query.network || 'mainnet-beta';

      try {
        // Look up DAO by baseToken
        const daoAddress = findDaoByBaseToken(baseToken);
        if (!daoAddress) {
          throw fastify.httpErrors.notFound(`No DAO found for baseToken: ${baseToken}`);
        }

        const metadao = await MetaDao.getInstance(network);
        const proposals = await metadao.listProposals(daoAddress, status);

        return {
          pool: daoAddress,
          proposals,
        };
      } catch (error) {
        if ((error as any).statusCode) throw error;
        logger.error(`Error listing proposals for baseToken ${baseToken}: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to list proposals: ${error}`);
      }
    },
  );
};
