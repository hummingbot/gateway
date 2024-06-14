import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { patch, unpatch } from '../../../test/services/patch';
import * as ergo_cofing from '../../../src/chains/ergo/ergo.config';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { Explorer } from '@ergolabs/ergo-sdk';
import { DexService } from '../../../src/chains/ergo/dex.service';
import { ErgoController } from '../../../src/chains/ergo/ergo.controller';

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
const pathGetErgoConfi = () => {
  patch(ergo_cofing, 'getErgoConfig', () => {
    return {
      network: {
        name: 'Mainnet',
        nodeURL: 'ergo.networks.Mainnet.nodeURL',
        explorerURL: 'ergo.networks.Mainnet.explorerURL',
        explorerDEXURL: 'ergo.networks.Mainnet.explorerDEXURL',
        timeOut: 1000,
        networkPrefix: NetworkPrefix.Mainnet,
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
  // Test case to verify initialization with Mainnet configuration
  it('Should initialize with Mainnet configuration', () => {
    // Arrange: Mock the return value of getErgoConfig to simulate Mainnet configuration
    pathGetErgoConfi();

    // Act: Create a new instance of Ergo with 'Mainnet' configuration
    const ergo = new Ergo('Mainnet');

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
    pathGetErgoConfi();

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
});
