import { getErgoConfig } from '../../../src/chains/ergo/ergo.config';
import { ConfigManagerV2 } from '../../../src/services/config-manager-v2';
import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';

// Define the test suite for the getErgoConfig function
describe('getErgoConfig', () => {
  // After each test, clear all mocks to ensure no interference between tests
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Test case for verifying the configuration returned for the Mainnet
  it('Should return correct config for Mainnet', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for Mainnet
    jest
      .spyOn(ConfigManagerV2.getInstance(), 'get')
      .mockReturnValueOnce('ergo.networks.Mainnet.nodeURL');
    jest
      .spyOn(ConfigManagerV2.getInstance(), 'get')
      .mockReturnValueOnce('ergo.networks.Mainnet.explorerURL');
    jest
      .spyOn(ConfigManagerV2.getInstance(), 'get')
      .mockReturnValueOnce('ergo.networks.Mainnet.explorerDEXURL');
    jest.spyOn(ConfigManagerV2.getInstance(), 'get').mockReturnValueOnce(1000);
    jest.spyOn(ConfigManagerV2.getInstance(), 'get').mockReturnValueOnce(2000);

    // Act: Call the function to be tested with 'Mainnet' as the argument
    const res = getErgoConfig('Mainnet');

    // Assert: Check that the returned configuration matches the expected values for Mainnet
    expect(res).toEqual({
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
    });
    // Assert: Verify that the get method was called exactly five times with the expected arguments
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledTimes(5);
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Mainnet.nodeURL',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Mainnet.explorerURL',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Mainnet.explorerDEXURL',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Mainnet.timeOut',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Mainnet.minTxFee',
    );
  });

  // Test case for verifying the configuration returned for the Testnet
  it('Should return correct config for Testnet', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for Testnet
    jest
      .spyOn(ConfigManagerV2.getInstance(), 'get')
      .mockReturnValueOnce('ergo.networks.Testnet.nodeURL');
    jest
      .spyOn(ConfigManagerV2.getInstance(), 'get')
      .mockReturnValueOnce('ergo.networks.Testnet.explorerURL');
    jest
      .spyOn(ConfigManagerV2.getInstance(), 'get')
      .mockReturnValueOnce('ergo.networks.Testnet.explorerDEXURL');
    jest.spyOn(ConfigManagerV2.getInstance(), 'get').mockReturnValueOnce(1000);
    jest.spyOn(ConfigManagerV2.getInstance(), 'get').mockReturnValueOnce(2000);

    // Act: Call the function to be tested with 'Testnet' as the argument
    const res = getErgoConfig('Testnet');

    // Assert: Check that the returned configuration matches the expected values for Testnet
    expect(res).toEqual({
      network: {
        name: 'Testnet',
        nodeURL: 'ergo.networks.Testnet.nodeURL',
        explorerURL: 'ergo.networks.Testnet.explorerURL',
        explorerDEXURL: 'ergo.networks.Testnet.explorerDEXURL',
        timeOut: 1000,
        networkPrefix: NetworkPrefix.Testnet,
        minTxFee: 2000,
        maxLRUCacheInstances: 10,
        utxosLimit: 100,
        poolLimit: 100,
      },
    });
    // Assert: Verify that the get method was called exactly five times with the expected arguments
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledTimes(5);
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Testnet.nodeURL',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Testnet.explorerURL',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Testnet.explorerDEXURL',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Testnet.timeOut',
    );
    expect(ConfigManagerV2.getInstance().get).toHaveBeenCalledWith(
      'ergo.networks.Testnet.minTxFee',
    );
  });
});
