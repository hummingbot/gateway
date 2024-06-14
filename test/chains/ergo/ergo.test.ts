import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { patch, unpatch } from '../../../test/services/patch';
import * as ergo_cofing from '../../../src/chains/ergo/ergo.config';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { Explorer } from '@ergolabs/ergo-sdk';
import { DexService } from '../../../src/chains/ergo/dex.service';
import { ErgoController } from '../../../src/chains/ergo/ergo.controller';
import { ErgoAsset } from '../../../src/chains/ergo/interfaces/ergo.interface';

// Mocking dependencies for testing purposes using jest
jest.mock('@ergolabs/ergo-dex-sdk', () => ({
  AmmPool: jest.fn(),
  makeNativePools: jest.fn(),
}));
jest.mock('@ergolabs/ergo-sdk', () => ({
  Explorer: jest.fn(),
}));

// Clean up mocks after each test
afterEach(() => {
  unpatch();
});

// Helper function to patch getErgoConfig for Mainnet configuration
const pathGetErgoConfig = (imputNetwork: string) => {
  patch(ergo_cofing, 'getErgoConfig', () => {
    return {
      network: {
        name: imputNetwork,
        nodeURL: 'ergo.networks.' + imputNetwork + '.nodeURL',
        explorerURL: 'ergo.networks.' + imputNetwork + '.explorerURL',
        explorerDEXURL: 'ergo.networks.' + imputNetwork + '.explorerDEXURL',
        timeOut: 1000,
        networkPrefix:
          imputNetwork === 'Mainnet'
            ? NetworkPrefix.Mainnet
            : NetworkPrefix.Testnet,
        minTxFee: 2000,
        maxLRUCacheInstances: 10,
        utxosLimit: 100,
        poolLimit: 100,
      },
    };
  });
};

// Describe the test suite for the Ergo class
describe('Ergo', () => {
  let ergo: Ergo;
  beforeEach(() => {
    // Arrange: Mock the return value of getErgoConfig to simulate Mainnet configuration before each test
    pathGetErgoConfig('Mainnet');

    // Arrange: Create a new instance of Ergo with 'Mainnet' configuration before each test
    ergo = new Ergo('Mainnet');
  });
  // Test case to verify initialization with Mainnet configuration
  it('Should initialize with Mainnet configuration', () => {
    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('Mainnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Mainnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    expect(ergo['_explorer']).toBeInstanceOf(Explorer);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  // Test case to verify initialization with Testnet configuration
  it('Should initialize with Mainnet configuration', () => {
    // Arrange: Mock the return value of getErgoConfig to simulate Testnet configuration
    pathGetErgoConfig('Testnet');

    // Act: Create a new instance of Ergo with 'Testnet' configuration
    const ergo = new Ergo('Testnet');

    // Assert: Validate the initialization state of Ergo instance
    expect(ergo).toBeDefined();
    expect(ergo['_assetMap']).toEqual({});
    expect(ergo['_network']).toEqual('Testnet');
    expect(ergo['_networkPrefix']).toEqual(NetworkPrefix.Testnet);
    expect(ergo['_node']).toBeInstanceOf(NodeService);
    expect(ergo['_explorer']).toBeInstanceOf(Explorer);
    expect(ergo['_dex']).toBeInstanceOf(DexService);
    expect(ergo['txFee']).toEqual(2000);
    expect(ergo['controller']).toEqual(ErgoController);
    expect(ergo['utxosLimit']).toEqual(100);
    expect(ergo['poolLimit']).toEqual(100);
    expect(ergo['ammPools']).toEqual([]);
  });

  // Describe the test suite for the get node method
  describe('get node', () => {
    // Test case to verify initialization of node service
    it('Should initialize node correctly and return the correct node', () => {
      // Assert: Validate the initialization state of node instance and check the returned value
      expect(ergo.node).toBeInstanceOf(NodeService);
      expect(ergo.node).toEqual({
        nodeURL: 'ergo.networks.Mainnet.nodeURL',
        timeout: 1000,
      });
    });
  });

  // Describe the test suite for the get network method
  describe('get network', () => {
    // Test case to verify network value when initialized with Mainnet
    it('should return the correct network when network is Mainnet', () => {
      // Assert: Validate the return value
      expect(ergo.network).toBe('Mainnet');
    });

    // Test case to verify network value when initialized with Testnet
    it('should return the correct network when network is Testnet', () => {
      // Arrange: Mock the return value of getErgoConfig to simulate Testnet configuration
      pathGetErgoConfig('Testnet');

      // Act: Create a new instance of Ergo with 'Testnet' configuration
      ergo = new Ergo('Testnet');

      // Assert: Validate the return value
      expect(ergo.network).toBe('Testnet');
    });
  });

  // Describe the test suite for the get network method
  describe('get storedAssetList', () => {
    // Test case to verify the stored asset list
    it('should return the stored asset list', () => {
      // Arrange: Create mock assets and populate _assetMap
      const asset1: ErgoAsset = 1 as any;
      const asset2: ErgoAsset = 2 as any;
      const assetMap = {
        key1: asset1,
        key2: asset2,
      };

      // Act: Set _assetMap directly
      ergo['_assetMap'] = assetMap;

      // Assert: Validate the stored asset list returned by storedAssetList
      expect(ergo.storedAssetList).toEqual(Object.values(assetMap));
    });
  });

  // Describe the test suite for the ready method
  describe('ready', () => {
    // Test case to verify the return value of the ready method
    it('should return the ready state', () => {
      // Assert: Initially, the ready state should be false
      expect(ergo.ready()).toBe(false);

      // Act: Manually set the _ready state to true
      ergo['_ready'] = true;

      // Assert: Now, the ready state should be true
      expect(ergo.ready()).toBe(true);
    });
  });

  // describe('', () => {
  //   it('should initialize assets and pools in init method', async () => {
  //     const loadAssetsSpy = jest.spyOn(ergo as any, 'loadAssets').mockResolvedValue();
  //     const loadPoolsSpy = jest.spyOn(ergo as any, 'loadPools').mockResolvedValue();
  //     await ergo.init();
  //     expect(loadAssetsSpy).toHaveBeenCalled();
  //     expect(loadPoolsSpy).toHaveBeenCalled();
  //     expect(ergo.ready()).toBe(true);
  //   });
  // });

  describe('close', () => {
    it('should close correctly', async () => {
      await expect(ergo.close()).resolves.toBeUndefined();
    });
  });
});
