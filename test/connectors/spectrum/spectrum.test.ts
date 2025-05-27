import BigNumber from 'bignumber.js';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { PriceRequest } from '../../../src/connectors/connector.requests';
import { Spectrum } from '../../../src/connectors/spectrum/spectrum';
import { ExecuteSwapRequestType } from '../../../src/schemas/trading-types/swap-schema';

let spectrum = Spectrum.getInstance('ergo', 'mainnet');

describe('Spectrum', () => {
  it('Should be defined', () => {
    expect(Spectrum).toBeDefined();
  });

  describe('getInstance', () => {
    it('Should be defined', () => {
      expect(spectrum).toBeDefined();
    });
    it('Should be an instance of Spectrum', () => {
      expect(spectrum).toBeInstanceOf(Spectrum);
    });
    it('Should create a new instance of Spectrum if there is no instance', () => {
      jest.spyOn(Ergo, 'getInstance').mockReturnValue({} as any);
      const newSpectrum = Spectrum.getInstance('ergo', 'testnet');
      expect(newSpectrum).toBeInstanceOf(Spectrum);
      expect(Ergo.getInstance).toHaveBeenCalledWith('testnet');
    });
    it('Should get the existing instance of Spectrum if it exists', () => {
      const existingSpectrum = Spectrum.getInstance('ergo', 'mainnet');
      expect(existingSpectrum).toBe(spectrum);
    });
  });

  describe('getTokenByAddress', () => {
    
    it('Should be defined', () => {
      expect(spectrum.getTokenByAddress).toBeDefined();
    });
    it('Should return undefined if the token is not found', () => {
      const token = spectrum.getTokenByAddress('invalid_address');
      expect(token).toBeUndefined();
    });
    it('Should return the token by address', () => {
      const tokenData = {
        name: 'Test Token',
        ticker: 'TT',
        decimals: 2,
        address: 'address',
        type: 'native',
        network: 'mainnet',
      } as any;
      spectrum['tokenList']['0x90874'] = tokenData;
      const token = spectrum.getTokenByAddress('0x90874');
      expect(token).toBeDefined();
    });
  });

  describe('ready', () => {
    
    it('Should be defined', () => {
      expect(spectrum.ready).toBeDefined();
    });
    it('Should return false if not ready', () => {
      expect(spectrum.ready()).toBe(false);
    });
  });

  describe('gasLimitEstimate', () => {
    
    it('Should be defined', () => {
      expect(spectrum.gasLimitEstimate).toBeDefined();
    });
    it('Should return gasLimitEstimate correctly', () => {
      expect(spectrum.gasLimitEstimate).toBe(150688);
    });
  });

  describe('init', () => {
    
    it('Should be defined', () => {
      expect(spectrum.init).toBeDefined();
    });
    it('Should not call init from ergo if ergo is ready', async () => {
      jest.spyOn(spectrum['ergo'], 'init').mockResolvedValue();
      jest.spyOn(spectrum['ergo'], 'ready').mockReturnValue(true);
      await spectrum.init();
      expect(spectrum['ergo'].init).not.toHaveBeenCalled();
      expect(spectrum['ergo'].ready).toHaveBeenCalled();
    });
    it('Should call init from ergo if ergo is not ready', async () => {
      jest.spyOn(spectrum['ergo'], 'ready').mockReturnValue(false);
      jest.spyOn(spectrum['ergo'], 'init').mockResolvedValue();
      await spectrum.init();
      expect(spectrum['ergo'].init).toHaveBeenCalled();
      expect(spectrum['ergo'].ready).toHaveBeenCalled();
    });
  });

  describe('estimateTrade', () => {
    
    const request: PriceRequest = {
      chain: 'ergo',
      network: 'mainnet',
      connector: 'spectrum',
      base: 'ERG',
      quote: 'SIGUSD',
      amount: '10',
      side: 'SELL',
    };
    it('should call ergo.estimate with correct parameters for SELL side', async () => {
      jest.spyOn(spectrum['ergo'], 'estimate').mockResolvedValue({
        price: '1.5',
        estimatedAmount: '15',
        fee: '0.1',
      } as any);
      const result = await spectrum.estimateTrade(request);
      expect(spectrum['ergo'].estimate).toHaveBeenCalledWith(
        'ERG',
        'SIGUSD',
        BigNumber('10'),
      );
      expect(result).toEqual({
        price: '1.5',
        estimatedAmount: '15',
        fee: '0.1',
      });
    });
    it("Should habdle the case when side === 'BUY'", async() => {
      request['side'] = 'BUY';
      await spectrum.estimateTrade(request);
      expect(spectrum['ergo'].estimate).toHaveBeenCalledWith(
        'SIGUSD',
        'ERG',
        BigNumber('10'),
      );
    });
    it("Should habdle the case when side is not set as SELL or BUY", async () => {
      request['side'] = 'someOtherValue' as any;
      await spectrum.estimateTrade(request);
      expect(spectrum['ergo'].estimate).toHaveBeenCalledWith(
        'ERG',
        'SIGUSD',
        BigNumber('10'),
      );
    });
  });

  describe('executeTrade', () => {
    const mockTradeRequest: ExecuteSwapRequestType = {
      network: 'mainnet',
      walletAddress: 'walletAddress123',
      quoteToken: 'SIGUSD',
      baseToken: 'ERG',
      side: 'BUY',
      slippagePct: 1,
      amount: 10,
    };
    
    it('Should be defined', () => {
      expect(spectrum.executeTrade).toBeDefined();
    });
    it("Should call ergo.execute with correct parameters when side === 'SELL'", async () => {
      mockTradeRequest['side'] = 'SELL';
      jest
        .spyOn(spectrum['ergo'], 'getAccountFromAddress')
        .mockResolvedValue('account' as any);
      jest.spyOn(spectrum['ergo'], 'swap').mockResolvedValue({} as any);
      const result = await spectrum.executeTrade(mockTradeRequest);
      expect(result).toEqual({});
      expect(spectrum['ergo'].swap).toHaveBeenCalledWith(
        'account',
        "ERG",
        "SIGUSD",
        BigNumber('10'),
        'walletAddress123',
        'walletAddress123',
        1);
      expect(spectrum['ergo'].getAccountFromAddress).toHaveBeenCalledWith(
        'walletAddress123',
      );
    });
    
    it("Should habdle the case when side === 'BUY'", async () => {
      mockTradeRequest['side'] = 'BUY';
      jest.spyOn(spectrum['ergo'], 'swap').mockResolvedValue({} as any);
      const result = await spectrum.executeTrade(mockTradeRequest);
      expect(result).toEqual({});
      expect(spectrum['ergo'].swap).toHaveBeenCalledWith(
        'account',
        "SIGUSD",
        "ERG",
        BigNumber('10'),
        'walletAddress123',
        'walletAddress123',
        1);
    });
  });
});
