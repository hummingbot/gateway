import { FastifyPluginAsync } from 'fastify';

import { createPrivyWallet, getPrivyWallet, PrivyChainType } from '../privy/privy-client';
import {
  AddPrivyWalletRequest,
  AddPrivyWalletRequestSchema,
  CreatePrivyWalletRequest,
  CreatePrivyWalletRequestSchema,
  PrivyWalletResponse,
  PrivyWalletResponseSchema,
} from '../schemas';
import { addPrivyWallet } from '../utils';

const PRIVY_ENV = 'Gateway reads PRIVY_APP_ID, PRIVY_APP_SECRET and PRIVY_AUTHORIZATION_KEY from its environment only.';

export const privyWalletsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: AddPrivyWalletRequest; Reply: PrivyWalletResponse }>(
    '/add-privy',
    {
      schema: {
        description:
          'Add an existing Privy server wallet by its Privy wallet id. Gateway reads the wallet from Privy and ' +
          'stores its id and address; Privy signs every transaction for it. ' +
          PRIVY_ENV,
        tags: ['/wallet'],
        body: AddPrivyWalletRequestSchema,
        response: { 200: PrivyWalletResponseSchema },
      },
    },
    async (request) => {
      const { chain, privyWalletId, setDefault } = request.body;
      return addPrivyWallet(fastify, chain, await getPrivyWallet(privyWalletId), setDefault);
    },
  );

  fastify.post<{ Body: CreatePrivyWalletRequest; Reply: PrivyWalletResponse }>(
    '/create-privy',
    {
      schema: {
        description: 'Create a Privy server wallet owned by the PRIVY_AUTHORIZATION_KEY key and add it. ' + PRIVY_ENV,
        tags: ['/wallet'],
        body: CreatePrivyWalletRequestSchema,
        response: { 200: PrivyWalletResponseSchema },
      },
    },
    async (request) => {
      const { chain, setDefault } = request.body;
      return addPrivyWallet(fastify, chain, await createPrivyWallet(chain as PrivyChainType), setDefault);
    },
  );
};

export default privyWalletsRoute;
