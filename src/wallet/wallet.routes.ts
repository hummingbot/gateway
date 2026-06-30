import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { addHardwareWalletRoute } from './routes/addHardwareWallet';
import { addSwigWalletRoute } from './routes/addSwigWallet';
import { addWalletRoute } from './routes/addWallet';
import { getWalletsRoute } from './routes/getWallets';
import { removeSwigWalletRoute } from './routes/removeSwigWallet';
import { removeWalletRoute } from './routes/removeWallet';
import { setDefaultRoute } from './routes/setDefault';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Register fastify-sensible for httpErrors
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(getWalletsRoute);
  await fastify.register(addWalletRoute);
  await fastify.register(addHardwareWalletRoute);
  await fastify.register(addSwigWalletRoute);
  await fastify.register(removeWalletRoute);
  await fastify.register(removeSwigWalletRoute);
  await fastify.register(setDefaultRoute);
};

export default walletRoutes;
