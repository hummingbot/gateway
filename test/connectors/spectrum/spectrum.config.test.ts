import { SpectrumConfig } from '../../../src/connectors/spectrum/spectrum.config';
import { ConfigManagerV2 } from '../../../src/services/config-manager-v2';

describe('SpectrumConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const configManager = ConfigManagerV2.getInstance();

  it('Should be defined', () => {
    expect(SpectrumConfig).toBeDefined();
  });

  it('Should return Spectrum config correctly', () => {

    expect(SpectrumConfig).toEqual({
      config: {
        allowedSlippage: "1/100",
        gasLimitEstimate: 150688,
        tradingTypes: ['AMM'],
        chainType: 'ERGO',
        availableNetworks: [{ chain: 'ergo', networks: ['mainnet'] }],
      },
    });
  });
});
