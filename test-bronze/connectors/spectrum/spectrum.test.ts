import { Ergo } from '../../../src/chains/ergo/ergo';
import { Spectrum } from '../../../src/connectors/spectrum/spectrum';
// import { SpectrumConfig } from '../../../src/connectors/spectrum/spectrum.config';
jest.mock('../../../src/connectors/spectrum/spectrum.config', () => {
  return {
    SpectrumConfig: {
      config: {
        allowedSlippage: '100',
        gasLimitEstimate: '100000',
        tradingTypes: ['AMM'],
        chainType: 'ERGO',
        availableNetworks: ['mainnet', 'testnet'],
      },
    },
  };
});

describe('Spectrum', () => {
  const network = 'mainnet';
  const chain = 'ergo';
  let spectrum: Spectrum;
  beforeEach(() => {
    jest.spyOn(Ergo, 'getInstance').mockReturnValue('ergo instance' as any);
    spectrum = Spectrum.getInstance('ergo', 'mainnet');
  });
  afterEach(() => {
    jest.clearAllMocks();
    Spectrum['_instances'] = {};
  });
  it('Should be defined', () => {
    expect(spectrum).toBeDefined();
  });
  describe('getInstance', () => {
    it('should create a new instance if it does not exist', () => {
      expect(spectrum).toBeDefined();
      expect(Spectrum['_instances'][chain + network]).toBe(spectrum);
      expect(Spectrum['_instances']['ergomainnet']).toBeInstanceOf(Spectrum);
    });

    it('should return the existing instance if it exists', () => {
      const instance2 = Spectrum.getInstance(chain, network);

      expect(spectrum).toBe(instance2);
      expect(Spectrum['_instances'][chain + network]).toBe(spectrum);
    });
    it('should call Ergo.getInstance with the correct network and initialize values correctly', () => {
      // set _instances = {} to call the constructor
      Spectrum['_instances'] = {};
      Spectrum.getInstance(chain, network);
      expect(Ergo.getInstance).toHaveBeenCalledWith(network);
      expect(spectrum['tokenList']).toEqual({});
      expect(spectrum['_ready']).toEqual(false);
      expect(spectrum['ergo']).toEqual('ergo instance');
    });

    it('should initialize gasLimitEstimate from SpectrumConfig', () => {
      expect(spectrum['_gasLimitEstimate']).toEqual('100000');
    });
  });
});
