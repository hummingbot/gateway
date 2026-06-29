import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { addHardwareWalletRoute } from './routes/addHardwareWallet';
import { addPrivyWalletRoute } from './routes/addPrivyWallet';
import { addWalletRoute } from './routes/addWallet';
import { createPrivyPolicyRoute } from './routes/createPrivyPolicy';
import { getWalletsRoute } from './routes/getWallets';
import { removePrivyWalletRoute } from './routes/removePrivyWallet';
import { removeWalletRoute } from './routes/removeWallet';
import { setDefaultRoute } from './routes/setDefault';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Register fastify-sensible for httpErrors
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(getWalletsRoute);
  await fastify.register(addWalletRoute);
  await fastify.register(addHardwareWalletRoute);
  await fastify.register(addPrivyWalletRoute);
  await fastify.register(createPrivyPolicyRoute);
  await fastify.register(removeWalletRoute);
  await fastify.register(removePrivyWalletRoute);
  await fastify.register(setDefaultRoute);
};

export default walletRoutes;
