import { patch } from './services/patch';
import { EVMNonceManager } from '../src/chains/ethereum/evm.nonce';

// override values so that nonceManager doesn't crash due to lack of provider
// connection
export const patchEVMNonceManager = (nonceManager: EVMNonceManager): void => {
  patch(nonceManager, 'init', () => {
    return;
  });

  patch(nonceManager, 'mergeNonceFromEVMNode', () => {
    return;
  });

  patch(nonceManager, 'getNonceFromNode', (_ethAddress: string) => {
    return Promise.resolve(12);
  });

  patch(nonceManager, 'getNextNonce', (_ethAddress: string) => {
    return Promise.resolve(13);
  });

  patch(
    nonceManager,
    'commitNonce',
    async (_: string, __: number): Promise<void> => {
      return;
    }
  );
};
