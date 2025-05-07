import { FastifyPluginAsync } from 'fastify';
import { getWalletsRoute } from './routes/getWallets';
import { addWalletRoute } from './routes/addWallet';
import { removeWalletRoute } from './routes/removeWallet';
import { signMessageRoute } from './routes/signMessage';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Register individual route handlers
  await fastify.register(getWalletsRoute);
  await fastify.register(addWalletRoute);
  await fastify.register(removeWalletRoute);
  await fastify.register(signMessageRoute);
};

export default walletRoutes;