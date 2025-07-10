import { FastifyPluginAsync } from 'fastify';

import { hardwareWalletRoutes } from './hardware-wallet.routes';
import { addReadOnlyWalletRoute } from './routes/addReadOnlyWallet';
import { addWalletRoute } from './routes/addWallet';
import { getWalletsRoute } from './routes/getWallets';
import { removeWalletRoute } from './routes/removeWallet';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Register individual route handlers
  await fastify.register(getWalletsRoute);
  await fastify.register(addWalletRoute);
  await fastify.register(hardwareWalletRoutes);
  await fastify.register(addReadOnlyWalletRoute);
  await fastify.register(removeWalletRoute);
};

export default walletRoutes;
