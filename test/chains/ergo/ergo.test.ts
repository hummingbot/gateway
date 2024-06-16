import {
  NetworkPrefix,
  SecretKey,
  SecretKeys,
  Wallet,
  Address,
} from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { patch, unpatch } from '../../../test/services/patch';
import * as ergo_cofing from '../../../src/chains/ergo/ergo.config';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { Explorer } from '@ergolabs/ergo-sdk';
import { DexService } from '../../../src/chains/ergo/dex.service';
import { ErgoController } from '../../../src/chains/ergo/ergo.controller';
import {
  ErgoAsset,
  ErgoBox,
} from '../../../src/chains/ergo/interfaces/ergo.interface';
import LRUCache from 'lru-cache';

// Mocking dependencies for testing purposes using jest
jest.mock('@ergolabs/ergo-dex-sdk', () => ({
  AmmPool: jest.fn(),
  makeNativePools: jest.fn(),
}));
jest.mock('@ergolabs/ergo-sdk', () => ({
  Explorer: jest.fn(),
}));

// Initializing Ergo instance for testing
let ergo: Ergo;

// Before each test, configure and initialize Ergo with 'Mainnet' settings
beforeEach(() => {
  // Arrange: Mock the return value of getErgoConfig to simulate Mainnet configuration before each test
  pathGetErgoConfig('Mainnet');

  // Arrange: Create a new instance of Ergo with 'Mainnet' configuration before each test
  ergo = new Ergo('Mainnet');
});

// Helper function to patch Wallet.from_secrets method for testing
const patchFrom_secrets = () => {
  patch(Wallet, 'from_secrets', () => {
    return 'testWallet' as any;
  });
};

// Helper function to patch Address.prototype.to_base58 method for testing
const patchTo_base58 = () => {
  patch(Address.prototype, 'to_base58', () => {
    return 'testAddress' as any;
  });
};

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

const patchErgo_node = async () => {
  patch(ergo['_node'], 'getUnspentBoxesByAddress', () => {
    return [];
  });
};
// Clean up mocks after each test
afterEach(() => {
  unpatch();
});
// Describe the test suite for the Ergo class
describe('Ergo', () => {
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

  // Describe the test suite for the close method
  describe('close', () => {
    // Test case to verify the close method
    it('should close correctly', async () => {
      // Act and Assert: Call the close method and expect that the close method resolves without any errors or values
      await expect(ergo.close()).resolves.toBeUndefined();
    });
  });

  // Describe the test suite for the getInstance method
  describe('getInstance', () => {
    const mockNetwork = 'Testnet';

    // This block runs before each test in this suite
    beforeEach(() => {
      // Arrange: Mock the function to get the configuration for the 'Testnet' network
      pathGetErgoConfig('Testnet');
      // Arrange: Clear the singleton and mock instances
      Ergo['_instances'] = undefined as any;
    });

    // Test that the LRUCache is initialized if it hasn't been already
    it('should initialize the LRUCache if not already initialized', () => {
      // Act: Call the getInstance method with the mock network
      Ergo.getInstance(mockNetwork);

      // Assert: Expect that the _instances property is defined and _instances is an instance of LRUCache
      expect(Ergo['_instances']).toBeDefined();
      expect(Ergo['_instances']).toBeInstanceOf(LRUCache);
    });

    // Test that a new Ergo instance is created and returned if it's not in the cache
    it('should set and return a new Ergo instance if not in the cache', () => {
      // Act: Call the getInstance method with the mock network
      const instance = Ergo.getInstance(mockNetwork);

      // Assert: Expect that the returned instance is an instance of Ergo, the cache contains the mock network key and the instance in the cache matches the returned instance
      expect(instance).toBeInstanceOf(Ergo);
      expect(Ergo['_instances'].has(mockNetwork)).toBe(true);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance);
    });

    // Test that an existing Ergo instance is returned from the cache
    it('should return an existing Ergo instance from the cache', () => {
      // Act: Call the getInstance method twice with the mock network
      const instance1 = Ergo.getInstance(mockNetwork);
      const instance2 = Ergo.getInstance(mockNetwork);

      // Assert: Expect that both calls return the same instance and the cache contains the mock network key
      expect(instance1).toBe(instance2);
      expect(Ergo['_instances'].get(mockNetwork)).toBe(instance1);
    });

    // Test that an error is thrown if an unexpected network is provided
    it('should throw an error if an unexpected network is provided', () => {
      // Act and Assert: Expect that calling getInstance with an empty string throws an error
      expect(() => Ergo.getInstance('')).toThrow(
        'Ergo.getInstance received an unexpected network: .',
      );
    });
  });

  // Describe the test suite for the getConnectedInstances method
  describe('getConnectedInstances', () => {
    let mockErgoInstance1: Ergo;
    let mockErgoInstance2: Ergo;

    // This block runs before each test in this suite
    beforeEach(() => {
      // Arrange: Create mock Ergo instances
      mockErgoInstance1 = new Ergo('Testnet1') as any;
      mockErgoInstance2 = new Ergo('Testnet2') as any;

      // Arrange: Initialize the _instances LRUCache with mock instances
      Ergo['_instances'] = new LRUCache<string, Ergo>({
        max: 10,
      });
      Ergo['_instances'].set('Testnet1', mockErgoInstance1);
      Ergo['_instances'].set('Testnet2', mockErgoInstance2);
    });
    // Test case to verify that all connected instances are returned
    it('should return all connected instances', () => {
      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();

      // Assert: Expect the connected instances to match the mock instances
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'Testnet1',
        'Testnet2',
      ]);
      expect(connectedInstances['Testnet1']).toBe(mockErgoInstance1);
      expect(connectedInstances['Testnet2']).toBe(mockErgoInstance2);
    });

    // Test case to verify that an empty object is returned if no instances exist
    it('should return an empty object if there are no instances', () => {
      // Arrange: Clear the _instances LRUCache
      Ergo['_instances'] = undefined as any;

      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();

      // Assert: Expect the connected instances to be an empty object
      expect(connectedInstances).toEqual({});
    });

    // Test case to verify that only valid instances are returned
    it('should return only valid instances', () => {
      // Arrange: Set an invalid (null) instance in the _instances LRUCache
      Ergo['_instances'].set('', null as any);

      // Act: Call the getConnectedInstances method
      const connectedInstances = Ergo.getConnectedInstances();
      // Assert: Expect the valid instances to be returned and invalid instances to be excluded
      expect(Object.keys(connectedInstances).sort()).toEqual([
        'Testnet1',
        'Testnet2',
      ]);
      expect(connectedInstances['Testnet1']).toBe(mockErgoInstance1);
      expect(connectedInstances['Testnet2']).toBe(mockErgoInstance2);
      expect(connectedInstances['']).toBeUndefined();
    });
  });

  // Describe the test suite for the getCurrentBlockNumber method
  describe('getCurrentBlockNumber', () => {
    // Test case to verify return block number corectly
    it('Should return the current block number incremented by one', async () => {
      // Arrange: Mock the getNetworkHeight method to return a fixed value
      jest.spyOn(ergo['_node'], 'getNetworkHeight').mockResolvedValue(17);

      // Act: Call the getCurrentBlockNumber method
      const blockNumber = await ergo.getCurrentBlockNumber();

      // Assert: Validate the returned block number
      expect(blockNumber).toEqual(18);
      expect(ergo['_node'].getNetworkHeight).toHaveBeenCalled;
    });
  });

  // Describe the test suite for the getAddressUnspentBoxes method
  describe('getAddressUnspentBoxes', () => {
    // Mock address for testing
    const mockAddress = '9j2s7d8f4s8s8o8s0q8f5s8d7f8s0d4r5';

    // Test case to verify the return of an empty array when there are no unspent boxes
    it('Should return an empty arry when length of nodeBoxes is 0', async () => {
      // Arrange: Mock the getUnspentBoxesByAddress method to return an empty array
      await patchErgo_node();
      const utxos = await ergo.getAddressUnspentBoxes(mockAddress);
      expect(utxos).toEqual([]);
    });

    // Test case to verify the retrieval of all unspent boxes for the given address
    it('Should retrieve all unspent boxes for the given address', async () => {
      // Arrange: Mock the getUnspentBoxesByAddress method to return 3 boxes
      const mockUnspentBoxesPage1 = [
        { boxId: 'box1' },
        { boxId: 'box2' },
      ] as Array<ErgoBox>;
      const mockUnspentBoxesPage2 = [{ boxId: 'box3' }] as Array<ErgoBox>;
      const mockUnspentBoxesPage3 = [] as Array<ErgoBox>; // Last page, empty
      jest
        .spyOn(ergo['_node'], 'getUnspentBoxesByAddress')
        .mockResolvedValueOnce(mockUnspentBoxesPage1)
        .mockResolvedValueOnce(mockUnspentBoxesPage2)
        .mockResolvedValueOnce(mockUnspentBoxesPage3);

      // Act: Call the getAddressUnspentBoxes method
      const result = await ergo.getAddressUnspentBoxes(mockAddress);

      // Assert: Validate that an empty array is returned
      expect(result).toEqual([
        { boxId: 'box1' },
        { boxId: 'box2' },
        { boxId: 'box3' },
      ]);
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledTimes(3);
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledWith(
        mockAddress,
        0,
        100,
      );
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledWith(
        mockAddress,
        100,
        100,
      );
      expect(ergo['_node'].getUnspentBoxesByAddress).toHaveBeenCalledWith(
        mockAddress,
        200,
        100,
      );
    });
  });

  // Describe the test suite for the getAccountFromSecretKey method
  describe('getAccountFromSecretKey', () => {
    // Test case to verify the return of an account with address and wallet
    it('Should return an account with address and wallet', () => {
      // Mock secret key
      const secret =
        '591811a0d6361f18e42549b32e65b98c9a63d6aad369d1056a97ca81f2a980d5';

      // Patch methods for mock implementation
      patchFrom_secrets();
      patchTo_base58();

      // Arrange: Mock get_address method
      const mockGetAddress = jest.fn().mockReturnValue(new Address());
      const mockSecretKeyInstance = {
        get_address: mockGetAddress,
      } as unknown as SecretKey;
      jest
        .spyOn(SecretKey, 'dlog_from_bytes')
        .mockReturnValue(mockSecretKeyInstance);
      // Arrange: Mock add method for SecretKeys
      const mockAdd = jest.fn();
      jest.spyOn(SecretKeys.prototype, 'add').mockImplementation(mockAdd);

      // Act: Call the getAccountFromSecretKey method
      const result = ergo.getAccountFromSecretKey(secret);

      // Assert: Validate the returned address and wallet
      expect(result.address).toBe('testAddress');
      expect(result.wallet).toBe('testWallet');
    });
  });
});
