import { Ergo } from '../../../src/chains/ergo/ergo';
import { ErgoAsset } from '../../../src/chains/ergo/interfaces/ergo.interface';
import { Spectrum } from '../../../src/connectors/spectrum/spectrum';
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
  const ergo: Ergo = new Ergo('mainnet');
  const network = 'mainnet';
  const chain = 'ergo';
  let spectrum: Spectrum;
  beforeEach(() => {
    jest.spyOn(Ergo, 'getInstance').mockReturnValue(ergo);
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
    it('Should be defined', () => {
      expect(Spectrum.getInstance).toBeDefined();
    });
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
      expect(spectrum['ergo']).toEqual(ergo);
    });

    it('should initialize gasLimitEstimate from SpectrumConfig', () => {
      expect(spectrum['_gasLimitEstimate']).toEqual('100000');
    });
  });

  describe('getTokenByAddress', () => {
    it('Should be defined', () => {
      expect(spectrum.getTokenByAddress).toBeDefined();
    });
    it('Should return the token correctly', () => {
      spectrum['tokenList']['tokenAddress'] =
        'ErgoAsset' as unknown as ErgoAsset;
      expect(spectrum.getTokenByAddress('tokenAddress')).toEqual('ErgoAsset');
    });
  });
  describe('init', () => {
    jest.spyOn(ergo, 'init').mockReturnValue('' as any);
    it('Should be defined', () => {
      expect(spectrum.init).toBeDefined();
    });
    it('Should call init method from ergo if ergo is not ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      await spectrum.init();
      expect(ergo.ready).toHaveBeenCalled();
      expect(ergo.init).toHaveBeenCalled();
    });
    it('Should not call init method from ergo if ergo is ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      await spectrum.init();
      expect(ergo.ready).toHaveBeenCalled();
      expect(ergo.init).not.toHaveBeenCalled();
    });

    it('Should updtate "tokenList" & "ready" status', async () => {
      const assetMap: Record<string, ErgoAsset> = {
        ERGO: {
          tokenId: 'ERGOId',
          decimals: 9,
          name: 'ERGO',
          symbol: 'ERG',
        },
        SigUSD: {
          tokenId: 'SigUSDId',
          decimals: 3,
          name: 'SigUSD',
          symbol: 'SigUSD',
        },
      };
      jest.spyOn(ergo, 'storedTokenList', 'get').mockReturnValue(assetMap);
      // to ensure tokenList is empty
      expect(spectrum['tokenList']).toEqual({});
      await spectrum.init();
      expect;
      expect(spectrum['_ready']).toEqual(true);
      expect(spectrum['tokenList']).toEqual(assetMap);
    });
  });
});
