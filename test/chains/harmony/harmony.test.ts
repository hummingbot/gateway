import { Harmony } from '../../../src/chains/harmony/harmony';
import { patchEVMNonceManager } from '../../evm.nonce.mock';
import { DefikingdomsConfig } from '../../../src/connectors/defikingdoms/defikingdoms.config';
import { DefiraConfig } from '../../../src/connectors/defira/defira.config';

let harmony: Harmony;

beforeAll(async () => {
  harmony = Harmony.getInstance('mainnet');
  patchEVMNonceManager(harmony.nonceManager);
  await harmony.init();
});

afterAll(async () => {
  await harmony.close();
});

describe('getSpender', () => {
  describe('get defira', () => {
    it('returns defira mainnet router address', () => {
      const dfkAddress = harmony.getSpender('defira');
      expect(dfkAddress.toLowerCase()).toEqual(
        DefiraConfig.config.routerAddress('mainnet').toLowerCase()
      );
    });
  });
  describe('get defikingdoms', () => {
    it('returns defikingdoms mainnet router address', () => {
      const dfkAddress = harmony.getSpender('defikingdoms');
      expect(dfkAddress.toLowerCase()).toEqual(
        DefikingdomsConfig.config.routerAddress('mainnet').toLowerCase()
      );
    });
  });
  describe('get defira', () => {
    it('returns defira mainnet router address', () => {
      const dfkAddress = harmony.getSpender('defira');
      expect(dfkAddress.toLowerCase()).toEqual(
        DefiraConfig.config.routerAddress('mainnet').toLowerCase()
      );
    });
  });
});
