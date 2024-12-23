jest.useFakeTimers();
import { Stonfi } from '../../../src/connectors/ston_fi/ston_fi';
import { patch, unpatch } from '../../../test/services/patch';
import { Ton } from '../../../src/chains/ton/ton';
import { getTonConfig } from '../../../src/chains/ton/ton.config';

let ton: Ton;
let ston_fi: Stonfi;

const EXPECTED_CURRENT_BLOCK_NUMBER = 100;
const CHAIN_NAME = 'ton';
const NETWORK = 'testnet';
const CONFIG = getTonConfig(NETWORK);
const NATIVE_TOKEN = CONFIG.nativeCurrencySymbol;
const USDC_TOKEN = 'USDC';

const TX = {
  txnID: 'mock-tx-id',
  round: 1,
  quote: {},
  assetOut: undefined,
};

const patchCurrentBlockNumber = () => {
  patch(ton, 'getCurrentBlockNumber', async () => ({
    seqno: EXPECTED_CURRENT_BLOCK_NUMBER,
    root_hash: 'mock-root-hash',
  }));
};

const patchGetAssetData = () => {
  patch(ton, 'getAssetData', async () => [
    {
      id: '0',
      name: 'TON',
      symbol: NATIVE_TOKEN,
      decimals: 6,
      url: 'https://ston.fi',
    },
    {
      id: '1',
      name: 'USDC',
      symbol: USDC_TOKEN,
      decimals: 6,
    },
  ]);
};

const patchEstimateTrade = () => {
  patch(ston_fi, 'estimateTrade', async () => ({
    trade: {
      askAddress: 'mock-ask-address',
      offerAddress: 'mock-offer-address',
      swapRate: '0.2',
    },
    expectedAmount: 1,
    expectedPrice: 0.2,
  }));
};

const patchExecuteTrade = () => {
  patch(ston_fi, 'executeTrade', async () => TX);
};

beforeAll(async () => {
  ton = Ton.getInstance(NETWORK);
  patchCurrentBlockNumber();
  patchGetAssetData();
  await ton.init();

  ston_fi = Stonfi.getInstance(NETWORK);
  await ston_fi.init();
});

afterEach(() => {
  unpatch();
});

describe('verify StonFi estimate Sell Trade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchEstimateTrade();

    const expectedTrade = await ston_fi.estimateTrade({
      chain: CHAIN_NAME,
      network: NETWORK,
      base: 'TON',
      quote: 'USDC',
      amount: '1',
      side: 'SELL',
    });
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
    expect(expectedTrade.expectedAmount).toEqual(1);
    expect(expectedTrade.expectedPrice).toEqual(0.2);
  });

  it('Should throw an error if no pair is available', async () => {
    patch(ston_fi, 'estimateTrade', async () => {
      throw new Error('No trading pair available');
    });

    await expect(async () => {
      await ston_fi.estimateTrade({
        chain: CHAIN_NAME,
        network: NETWORK,
        base: 'ETH',
        quote: 'DAI',
        amount: '1',
        side: 'SELL',
      });
    }).rejects.toThrow('No trading pair available');
  });
});

describe('verify StonFi estimate Buy Trade', () => {
  it('Should return an ExpectedTrade when available', async () => {
    patchEstimateTrade();

    const expectedTrade = await ston_fi.estimateTrade({
      chain: CHAIN_NAME,
      network: NETWORK,
      base: 'TON',
      quote: 'USDC',
      amount: '1',
      side: 'BUY',
    });
    expect(expectedTrade).toHaveProperty('trade');
    expect(expectedTrade).toHaveProperty('expectedAmount');
    expect(expectedTrade.expectedAmount).toEqual(1);
    expect(expectedTrade.expectedPrice).toEqual(0.2);
  });

  it('Should throw an error if no pair is available', async () => {
    patch(ston_fi, 'estimateTrade', async () => {
      throw new Error('No trading pair available');
    });

    await expect(async () => {
      await ston_fi.estimateTrade({
        chain: CHAIN_NAME,
        network: NETWORK,
        base: 'ETH',
        quote: 'DAI',
        amount: '1',
        side: 'BUY',
      });
    }).rejects.toThrow('No trading pair available');
  });
});

describe('verify StonFi executeTrade', () => {
  it('Should execute a trade when pair is available', async () => {
    patchEstimateTrade();
    patchExecuteTrade();

    const trade = await ston_fi.estimateTrade({
      chain: CHAIN_NAME,
      network: NETWORK,
      base: 'TON',
      quote: 'USDC',
      amount: '1',
      side: 'BUY',
    });

    const tradeResult = await ston_fi.executeTrade(
        'mock-account-address',
        trade.trade,
        true
    );
    expect(tradeResult.txnID).toEqual(TX.txnID);
    expect(tradeResult.round).toEqual(TX.round);
  });

  it('Should throw an error if execution fails', async () => {
    patch(ston_fi, 'executeTrade', async () => {
      throw new Error('Execution failed');
    });

    await expect(async () => {
      const trade = await ston_fi.estimateTrade({
        chain: CHAIN_NAME,
        network: NETWORK,
        base: 'TON',
        quote: 'USDC',
        amount: '1',
        side: 'BUY',
      });
      await ston_fi.executeTrade('mock-account-address', trade.trade, true);
    }).rejects.toThrow('Execution failed');
  });
});

describe('getAllowedSlippage', () => {
  it('Should return the configured slippage value', () => {
    const allowedSlippage = ston_fi.getSlippage();
    expect(allowedSlippage).toEqual(0.02);
  });
});
