import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { addHardwareWalletRoute } from './routes/addHardwareWallet';
import { addWalletRoute } from './routes/addWallet';
import { createWalletRoute } from './routes/createWallet';
import { getWalletsRoute } from './routes/getWallets';
import { removeWalletRoute } from './routes/removeWallet';
import { sendTransactionRoute } from './routes/sendTransaction';
import { setDefaultRoute } from './routes/setDefault';
import { showPrivateKeyRoute } from './routes/showPrivateKey';

export const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // Register fastify-sensible for httpErrors
  await fastify.register(sensible);

  // Register individual route handlers
  await fastify.register(getWalletsRoute);
  await fastify.register(addWalletRoute);
  await fastify.register(createWalletRoute);
  await fastify.register(addHardwareWalletRoute);
  await fastify.register(removeWalletRoute);
  await fastify.register(setDefaultRoute);
  await fastify.register(showPrivateKeyRoute);
  await fastify.register(sendTransactionRoute);
};

export default walletRoutes;
