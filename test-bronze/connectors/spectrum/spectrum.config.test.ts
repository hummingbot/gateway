import { ConfigManagerV2 } from '../../../src/services/config-manager-v2';

describe('SpectrumConfig', () => {
  let configManager: ReturnType<typeof ConfigManagerV2.getInstance>;

  beforeEach(() => {
    configManager = ConfigManagerV2.getInstance();
    jest.clearAllMocks();
  });
  it('Should initialize config with correct data', () => {
    jest.spyOn(configManager, 'get').mockReturnValueOnce(0.01);
    jest.spyOn(configManager, 'get').mockReturnValueOnce(100000);

    const {
      SpectrumConfig,
    } = require('../../../src/connectors/spectrum/spectrum.config');

    expect(SpectrumConfig.config.allowedSlippage).toEqual(0.01);
    expect(configManager.get).toHaveBeenCalledWith('ergo.allowedSlippage');
    expect(SpectrumConfig.config.gasLimitEstimate).toEqual(100000);
    expect(configManager.get).toHaveBeenCalledWith('ergo.gasLimitEstimate');

    expect(SpectrumConfig.config.tradingTypes).toEqual(['AMM']);
    expect(SpectrumConfig.config.chainType).toEqual('ERGO');
    expect(SpectrumConfig.config.availableNetworks).toEqual([
      { chain: 'ergo', networks: ['mainnet'] },
    ]);
  });
});
