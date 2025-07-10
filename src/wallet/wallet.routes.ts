import { FastifyPluginAsync } from 'fastify';

import { hardwareWalletRoutes } from './hardware-wallet.routes';
import { addReadOnlyWalletRoute } from './routes/addReadOnlyWallet';
import { addWalletRoute } from './routes/addWallet';
import { getWalletsRoute } from './routes/getWallets';
import { removeReadOnlyWalletRoute } from './routes/removeReadOnlyWallet';
import { removeWalletRoute } from './routes/removeWallet';
import { signMessageRoute } from './routes/signMessage';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Register individual route handlers
  await fastify.register(getWalletsRoute);
  await fastify.register(addWalletRoute);
  await fastify.register(removeWalletRoute);
  await fastify.register(signMessageRoute);
  await fastify.register(addReadOnlyWalletRoute);
  await fastify.register(removeReadOnlyWalletRoute);
  await fastify.register(hardwareWalletRoutes);
};

export default walletRoutes;
