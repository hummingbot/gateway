import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  addWallet,
  removeWallet,
  getWallets,
  signMessage,
} from './wallet.controllers';
import {
  AddWalletRequest,
  WalletSignRequest,
  RemoveWalletRequest,
} from './wallet.requests';
import {
  validateAddWalletRequest,
  validateRemoveWalletRequest,
  validateWalletSignRequest,
} from './wallet.validators';

const walletSchemas = {
  add: {
    body: Type.Object({
      // Define your AddWalletRequest schema here
      chain: Type.String(),
      privateKey: Type.String(),
    }),
  },
  remove: {
    body: Type.Object({
      // Define your RemoveWalletRequest schema here
      chain: Type.String(),
      address: Type.String(),
    }),
  },
  sign: {
    querystring: Type.Object({
      // Define your WalletSignRequest schema here
      chain: Type.String(),
      address: Type.String(),
      message: Type.String(),
    }),
  },
};

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /
  fastify.get('/', async () => {
    return await getWallets();
  });

  // POST /add
  fastify.post<{ Body: AddWalletRequest }>(
    '/add',
    {
      schema: walletSchemas.add,
    },
    async (request) => {
      validateAddWalletRequest(request.body);
      return await addWallet(request.body);
    }
  );

  // DELETE /remove
  fastify.delete<{ Body: RemoveWalletRequest }>(
    '/remove',
    {
      schema: walletSchemas.remove,
    },
    async (request) => {
      validateRemoveWalletRequest(request.body);
      await removeWallet(request.body);
      return {};
    }
  );

  // GET /sign
  fastify.get<{ Querystring: WalletSignRequest }>(
    '/sign',
    {
      schema: walletSchemas.sign,
    },
    async (request) => {
      validateWalletSignRequest(request.query);
      return await signMessage(request.query);
    }
  );
};

export default walletRoutes;
