import { getErgoConfig } from '../../../src/chains/ergo/ergo.config';
import { ConfigManagerV2 } from '../../../src/services/config-manager-v2';
import { NetworkPrefix } from 'ergo-lib-wasm-nodejs';
import { BigNumber } from 'bignumber.js';

describe('getErgoConfig', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  const configManager = ConfigManagerV2.getInstance();
  it('Should return correct config for mainnet', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for Mainnet
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('ergo.networks.mainnet.nodeURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('ergo.networks.mainnet.explorerURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('ergo.networks.mainnet.explorerDEXURL');
    // timeout
    jest.spyOn(configManager, 'get').mockReturnValueOnce(1000);
    // minTxFee
    jest.spyOn(configManager, 'get').mockReturnValueOnce(2000);
    // maxLRUCacheInstances
    jest.spyOn(configManager, 'get').mockReturnValueOnce(10);
    // utxosLimit
    jest.spyOn(configManager, 'get').mockReturnValueOnce(100);
    // poolLimit
    jest.spyOn(configManager, 'get').mockReturnValueOnce(100);
    // defaultSlippage
    jest.spyOn(configManager, 'get').mockReturnValueOnce(3);
    // defaultMinerFee
    jest.spyOn(configManager, 'get').mockReturnValueOnce(BigNumber(7000));
    // minNitro
    jest.spyOn(configManager, 'get').mockReturnValueOnce(1.2);
    // minBoxValue
    jest.spyOn(configManager, 'get').mockReturnValueOnce(BigNumber(8000));

    const res = getErgoConfig('mainnet');

    // Assert: Check that the returned configuration matches the expected values for Mainnet
    expect(res).toEqual({
      network: {
        name: 'mainnet',
        nodeURL: 'ergo.networks.mainnet.nodeURL',
        explorerURL: 'ergo.networks.mainnet.explorerURL',
        explorerDEXURL: 'ergo.networks.mainnet.explorerDEXURL',
        timeOut: 1000,
        networkPrefix: NetworkPrefix.Mainnet,
        minTxFee: 2000,
        maxLRUCacheInstances: 10,
        utxosLimit: 100,
        poolLimit: 100,
        defaultSlippage: 3,
        defaultMinerFee: BigNumber(7000),
        minNitro: 1.2,
        minBoxValue: BigNumber(8000),
      },
    });
    // Assert: Verify that the get method was called exactly 12 times with the expected arguments
    expect(configManager.get).toHaveBeenCalledTimes(12);
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.nodeURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.explorerURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.explorerDEXURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.timeOut',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.minTxFee',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.maxLRUCacheInstances',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.utxosLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.poolLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.defaultSlippage',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.defaultMinerFee',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.minNitro',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.mainnet.minBoxValue',
    );
  });

  it('Should return correct config for testnet', () => {
    // Arrange: Mock the get method of ConfigManagerV2 to return specific values for testnet
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('ergo.networks.testnet.nodeURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('ergo.networks.testnet.explorerURL');
    jest
      .spyOn(configManager, 'get')
      .mockReturnValueOnce('ergo.networks.testnet.explorerDEXURL');
    // timeout
    jest.spyOn(configManager, 'get').mockReturnValueOnce(1000);
    // minTxFee
    jest.spyOn(configManager, 'get').mockReturnValueOnce(2000);
    // maxLRUCacheInstances
    jest.spyOn(configManager, 'get').mockReturnValueOnce(10);
    // utxosLimit
    jest.spyOn(configManager, 'get').mockReturnValueOnce(100);
    // poolLimit
    jest.spyOn(configManager, 'get').mockReturnValueOnce(100);
    // defaultSlippage
    jest.spyOn(configManager, 'get').mockReturnValueOnce(3);
    // defaultMinerFee
    jest.spyOn(configManager, 'get').mockReturnValueOnce(BigNumber(7000));
    // minNitro
    jest.spyOn(configManager, 'get').mockReturnValueOnce(1.2);
    // minBoxValue
    jest.spyOn(configManager, 'get').mockReturnValueOnce(BigNumber(8000));

    const res = getErgoConfig('testnet');

    // Assert: Check that the returned configuration matches the expected values for testnet
    expect(res).toEqual({
      network: {
        name: 'testnet',
        nodeURL: 'ergo.networks.testnet.nodeURL',
        explorerURL: 'ergo.networks.testnet.explorerURL',
        explorerDEXURL: 'ergo.networks.testnet.explorerDEXURL',
        timeOut: 1000,
        networkPrefix: NetworkPrefix.Testnet,
        minTxFee: 2000,
        maxLRUCacheInstances: 10,
        utxosLimit: 100,
        poolLimit: 100,
        defaultSlippage: 3,
        defaultMinerFee: BigNumber(7000),
        minNitro: 1.2,
        minBoxValue: BigNumber(8000),
      },
    });
    // Assert: Verify that the get method was called exactly 12 times with the expected arguments
    expect(configManager.get).toHaveBeenCalledTimes(12);
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.nodeURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.explorerURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.explorerDEXURL',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.timeOut',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.minTxFee',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.maxLRUCacheInstances',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.utxosLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.poolLimit',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.defaultSlippage',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.defaultMinerFee',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.minNitro',
    );
    expect(configManager.get).toHaveBeenCalledWith(
      'ergo.networks.testnet.minBoxValue',
    );
  });
});
