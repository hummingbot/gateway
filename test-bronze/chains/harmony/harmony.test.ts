import { Harmony } from '../../../src/chains/harmony/harmony';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';

let harmony: Harmony;

beforeAll(async () => {
  harmony = Harmony.getInstance('mainnet');
  patchEVMNonceManager(harmony.nonceManager);
  await harmony.init();
});

afterAll(async () => {
  await harmony.close();
});
