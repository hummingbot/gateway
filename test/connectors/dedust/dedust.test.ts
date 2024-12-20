import { 
  UniswapishPriceError,
  PRICE_FAILED_ERROR_MESSAGE,
  PRICE_FAILED_ERROR_CODE,
  TRADE_FAILED_ERROR_MESSAGE,
  TRADE_FAILED_ERROR_CODE,
  UNKNOWN_ERROR_MESSAGE,
  UNKNOWN_ERROR_ERROR_CODE,
  INSUFFICIENT_FUNDS_ERROR_MESSAGE,
  INSUFFICIENT_FUNDS_ERROR_CODE,
  AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE,
  AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE,
  HttpException,
} from '../../../src/services/error-handler';
import { patch, unpatch } from '../../services/patch';
import { Dedust } from '../../../src/connectors/dedust/dedust';
import { Ton } from '../../../src/chains/ton/ton';
import { getTonConfig } from '../../../src/chains/ton/ton.config';
import { 
  mockAddress, 
  MockAsset, 
  MockPool, 
  MockVault,
} from './__mocks__/dedust.mocks';

jest.mock('../../../src/services/logger');

let ton: Ton;
let dedust: Dedust;

const mockConfig = getTonConfig('mainnet');

beforeAll(async () => {
  ton = new Ton(
    'mainnet', 
    mockConfig.network.nodeURL,
    'FILE',           // Add assetListType
    ''               // Add assetListSource
  );
  dedust = Dedust.getInstance('mainnet');
  
  // Mock ton client methods
  patch(ton, 'getAccountFromAddress', () => ({
    publicKey: 'mock-public-key',
    secretKey: 'mock-secret-key',
  }));
  
  patch(ton, 'waitForTransactionByMessage', () => 'mock-tx-hash');
});

afterEach(() => {
  unpatch();
});

describe('dedust', () => {
  it('should throw UniswapishPriceError when no trade found', async () => {
    patch(dedust, 'estimateTrade', () => {
      throw new Error('No pool found');
    });

    await expect(async () => {
      await dedust.estimateTrade({
        base: 'TOKEN1',
        quote: 'TOKEN2',
        amount: '1.0',
        side: 'SELL',
        chain: 'ton',
        network: 'mainnet'
      });
    }).rejects.toThrow(UniswapishPriceError);
  });

  it('should throw HttpException with PRICE_FAILED_ERROR when price query fails', async () => {
    patch(dedust, 'estimateTrade', () => {
      throw new Error('Price query failed');
    });

    await expect(async () => {
      await dedust.estimateTrade({
        base: 'TOKEN1',
        quote: 'TOKEN2',
        amount: '1.0',
        side: 'SELL',
        chain: 'ton',
        network: 'mainnet'
      });
    }).rejects.toThrow(new HttpException(500, PRICE_FAILED_ERROR_MESSAGE + 'Price query failed', PRICE_FAILED_ERROR_CODE));
  });

  it('should throw HttpException with INSUFFICIENT_FUNDS_ERROR when insufficient funds', async () => {
    patch(dedust, 'executeTrade', () => {
      throw new Error('Insufficient funds');
    });

    await expect(async () => {
      await dedust.executeTrade(
        mockAddress.toString(),
        {
          pool: new MockPool(),
          vault: new MockVault(),
          amount: BigInt('1000000000'),
          fromAsset: new MockAsset(),
          toAsset: new MockAsset(),
          expectedOut: BigInt('1000000000'),
          priceImpact: 1.5,
          tradeFee: BigInt('1000000')
        },
        true
      );
    }).rejects.toThrow(new HttpException(500, INSUFFICIENT_FUNDS_ERROR_MESSAGE, INSUFFICIENT_FUNDS_ERROR_CODE));
  });

  it('should throw HttpException with AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR when output amount is too low', async () => {
    patch(dedust, 'executeTrade', () => {
      throw new Error('Output amount less than minimum');
    });

    await expect(async () => {
      await dedust.executeTrade(
        mockAddress.toString(),
        {
          pool: new MockPool(),
          vault: new MockVault(),
          amount: BigInt('1000000000'),
          fromAsset: new MockAsset(),
          toAsset: new MockAsset(),
          expectedOut: BigInt('1000000000'),
          priceImpact: 1.5,
          tradeFee: BigInt('1000000')
        },
        true
      );
    }).rejects.toThrow(new HttpException(500, AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_MESSAGE, AMOUNT_LESS_THAN_MIN_AMOUNT_ERROR_CODE));
  });

  it('should throw HttpException with TRADE_FAILED_ERROR when trade fails', async () => {
    patch(dedust, 'executeTrade', () => {
      throw new Error('Trade failed');
    });

    await expect(async () => {
      await dedust.executeTrade(
        mockAddress.toString(),
        {
          pool: new MockPool(),
          vault: new MockVault(),
          amount: BigInt('1000000000'),
          fromAsset: new MockAsset(),
          toAsset: new MockAsset(),
          expectedOut: BigInt('1000000000'),
          priceImpact: 1.5,
          tradeFee: BigInt('1000000')
        },
        true
      );
    }).rejects.toThrow(new HttpException(500, TRADE_FAILED_ERROR_MESSAGE + 'Trade failed', TRADE_FAILED_ERROR_CODE));
  });

  it('should throw HttpException with UNKNOWN_ERROR when unknown error occurs', async () => {
    patch(dedust, 'executeTrade', () => {
      throw new Error('Unknown error');
    });

    await expect(async () => {
      await dedust.executeTrade(
        mockAddress.toString(),
        {
          pool: new MockPool(),
          vault: new MockVault(),
          amount: BigInt('1000000000'),
          fromAsset: new MockAsset(),
          toAsset: new MockAsset(),
          expectedOut: BigInt('1000000000'),
          priceImpact: 1.5,
          tradeFee: BigInt('1000000')
        },
        true
      );
    }).rejects.toThrow(new HttpException(500, UNKNOWN_ERROR_MESSAGE, UNKNOWN_ERROR_ERROR_CODE));
  });
}); 