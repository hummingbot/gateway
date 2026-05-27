import { FastifyPluginAsync } from 'fastify';

import {
  MetaDaoListDaosItem,
  MetaDaoListDaosRequest,
  MetaDaoListDaosRequestType,
  MetaDaoListDaosResponse,
  MetaDaoListDaosResponseType,
  MetaDaoListPoolsResponse,
  MetaDaoListPoolsResponseType,
} from '../../../schemas/metadao-schema';
import { logger } from '../../../services/logger';
import poolsData from '../daos.json';
import { MetaDao } from '../metadao';

const pools: MetaDaoListDaosItem[] = poolsData as MetaDaoListDaosItem[];

// /daos - fetches DAO addresses from chain
export const listDaosRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: MetaDaoListDaosRequestType;
    Reply: MetaDaoListDaosResponseType;
  }>(
    '/daos',
    {
      schema: {
        description: 'List all MetaDAO DAO addresses from chain',
        tags: ['/connector/metadao'],
        querystring: MetaDaoListDaosRequest,
        response: {
          200: MetaDaoListDaosResponse,
        },
      },
    },
    async (request): Promise<MetaDaoListDaosResponseType> => {
      const network = request.query.network || 'mainnet-beta';

      try {
        const metadao = await MetaDao.getInstance(network);
        const daos = await metadao.listDaos();
        return { daos };
      } catch (error) {
        logger.error(`Error listing DAOs: ${error}`);
        throw fastify.httpErrors.internalServerError(`Failed to list DAOs: ${error}`);
      }
    },
  );
};

// /pools - returns cached pool list from daos.json
export const listPoolsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: MetaDaoListPoolsResponseType;
  }>(
    '/pools',
    {
      schema: {
        description: 'List cached MetaDAO pools with token information (from daos.json)',
        tags: ['/connector/metadao'],
        response: {
          200: MetaDaoListPoolsResponse,
        },
      },
    },
    async (): Promise<MetaDaoListPoolsResponseType> => {
      return { pools };
    },
  );
};
