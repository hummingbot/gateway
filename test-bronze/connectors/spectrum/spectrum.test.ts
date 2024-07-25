import { BigNumber } from 'bignumber.js';
import { PriceRequest, TradeRequest } from '../../../src/amm/amm.requests';
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

  describe('ready', () => {
    it('Should be defined', () => {
      expect(spectrum.ready).toBeDefined();
    });
    it('Should return the value of ready', () => {
      expect(spectrum.ready()).toEqual(false);
    });
  });
  describe('gasLimitEstimate', () => {
    it('Should be defined', () => {
      expect(spectrum.gasLimitEstimate).toBeDefined();
    });
    it('Should retuern gasLimitEstimate correctly', () => {
      expect(spectrum.gasLimitEstimate).toEqual('100000');
    });
  });

  describe('estimateTrade', () => {
    const req: PriceRequest = {
      chain: 'ergo',
      network: 'mainnet',
      quote: '_ERGO',
      base: '_SigUSD',
      amount: '1000',
      side: 'SELL',
      allowedSlippage: '50',
    };
    jest.spyOn(ergo, 'estimate').mockResolvedValue({} as any);
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Should be defined', () => {
      expect(spectrum.estimateTrade).toBeDefined();
    });
    it('Should call estimate from ergo with the correct data if erq.side === "SELL"', async () => {
      const result = await spectrum.estimateTrade(req);
      expect(ergo.estimate).toHaveBeenCalledWith(
        'SigUSD',
        'ERGO',
        BigNumber('1000'),
        Number('50'),
      );
      expect(result).toEqual({});
    });

    it('Should call estimate from ergo with the correct data if erq.side === "BUY"', async () => {
      req.side = 'BUY';
      const result = await spectrum.estimateTrade(req);
      expect(ergo.estimate).toHaveBeenCalledWith(
        'ERGO',
        'SigUSD',
        BigNumber('1000'),
        Number('50'),
      );
      expect(result).toEqual({});
    });
    it('Should call estimate from ergo with the correct data if erq.side is not "SELL" nor "BUY"', async () => {
      req.side = 'someOtherSide' as any;
      const result = await spectrum.estimateTrade(req);
      expect(ergo.estimate).toHaveBeenCalledWith(
        'SigUSD',
        'ERGO',
        BigNumber('1000'),
        Number('50'),
      );
      expect(result).toEqual({});
    });
  });

  describe('executeTrade', () => {
    const req: TradeRequest = {
      chain: 'ergo',
      network: 'mainnet',
      quote: '_ERGO',
      base: '_SigUSD',
      amount: '1000',
      address: 'ergAccountAddress',
      side: 'SELL',
      allowedSlippage: '50',
    };
    jest
      .spyOn(ergo, 'getAccountFromAddress')
      .mockResolvedValue('ergoAccount' as any);
    jest.spyOn(ergo, 'swap').mockResolvedValue({} as any);
    it('Should be defined', () => {
      expect(spectrum.executeTrade).toBeDefined();
    });

    it('Should call swap from ergo with the correct data if erq.side === "SELL"', async () => {
      const result = await spectrum.executeTrade(req);
      expect(ergo.swap).toHaveBeenCalledWith(
        'ergoAccount',
        'SigUSD',
        'ERGO',
        BigNumber('1000'),
        'ergAccountAddress',
        'ergAccountAddress',
        Number('50'),
      );
      expect(ergo.getAccountFromAddress).toHaveBeenCalledWith(
        'ergAccountAddress',
      );
      expect(result).toEqual({});
    });

    it('Should call swap from ergo with the correct data if erq.side === "BUY"', async () => {
      req.side = 'BUY';
      const result = await spectrum.executeTrade(req);
      expect(ergo.swap).toHaveBeenCalledWith(
        'ergoAccount',
        'ERGO',
        'SigUSD',
        BigNumber('1000'),
        'ergAccountAddress',
        'ergAccountAddress',
        Number('50'),
      );
      expect(ergo.getAccountFromAddress).toHaveBeenCalledWith(
        'ergAccountAddress',
      );
      expect(result).toEqual({});
    });
    it('Should call swap from ergo with the correct data if erq.side is not "SELL" nor "BUY"', async () => {
      req.side = 'someOtherSide' as any;
      const result = await spectrum.executeTrade(req);
      expect(ergo.swap).toHaveBeenCalledWith(
        'ergoAccount',
        'SigUSD',
        'ERGO',
        BigNumber('1000'),
        'ergAccountAddress',
        'ergAccountAddress',
        Number('50'),
      );
      expect(ergo.getAccountFromAddress).toHaveBeenCalledWith(
        'ergAccountAddress',
      );
      expect(result).toEqual({});
    });
  });
});
