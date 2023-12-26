import request from 'supertest';
import { gatewayApp } from '../../../src/app';
import { XRPL } from '../../../src/chains/xrpl/xrpl';
import { XRPLCLOB } from '../../../src/connectors/xrpl/xrpl';
import {} from '../../../src/chains/xrpl/xrpl.order-tracker';
import { Order } from '../../../src/connectors/xrpl/xrpl.types';
import { patch, unpatch } from '../../services/patch';

let xrpl: XRPL;
let xrplCLOB: XRPLCLOB;

const TX_HASH =
  'ADEC6FF35C49B9FF5D06741B5D219D194568919A57876E29296AC530EB25F1CB'; // noqa: mock
const MARKET = 'USD-XRP';

const MARKETS = {
  'USD-XRP': {
    marketId: 'USD-XRP',
    minimumOrderSize: 1,
    tickSize: 1,
    baseTransferRate: 1,
    quoteTransferRate: 1,
    baseIssuer: 'r999',
    quoteIssuer: '',
    baseCurrency: 'USD',
    quoteCurrency: 'XRP',
  },
  'BTC-XRP': {
    marketId: 'BTC-XRP',
    minimumOrderSize: 1,
    tickSize: 1,
    baseTransferRate: 1,
    quoteTransferRate: 1,
    baseIssuer: 'r888',
    quoteIssuer: '',
    baseCurrency: 'BTC',
    quoteCurrency: 'XRP',
  },
};

const ORDER = {
  hash: 1234567,
  marketId: 'USD-XRP',
  price: '1',
  amount: '1',
  filledAmount: '0',
  state: 'OPEN',
  tradeType: 'BUY',
  orderType: 'LIMIT',
  createdAt: 1234567,
  createdAtLedgerIndex: 1234567,
  updatedAt: 1234567,
  updatedAtLedgerIndex: 1234567,
  associatedTxns: [TX_HASH],
  associatedFills: [],
};

const ORDER_BOOK_1 = {
  asks: [
    {
      Account: 'rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah',
      BookDirectory:
        'DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE4E1282583CD33780',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '0',
      PreviousTxnID:
        '5F8F23607A58A936A5F1D355A7A7491474AABB115C70F5773F3510082EE9B9CB',
      PreviousTxnLgrSeq: 80327788,
      Sequence: 95908936,
      TakerGets: '60133000000',
      TakerPays: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '31328.481625431',
      },
      index: 'BBA5F7052917489072A98DDBE46D3258C5A58BB00771FB784A315F6F9C27A9F2',
      owner_funds: '60199074323',
      quality: '0.000000520986507',
    },
    {
      Account: 'rBndiPPKs9k5rjBb7HsEiqXKrz8AfUnqWq',
      BookDirectory:
        'DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE4E12826062F5399E',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '0',
      PreviousTxnID:
        'AEA372417F1BEA783D317ADA70ECE577424F186F663AD621C2B26350784611AC',
      PreviousTxnLgrSeq: 80327786,
      Sequence: 2591399,
      TakerGets: '2618294750',
      TakerPays: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '1364.1054',
      },
      index: '6F758711E36E2DBDD6806F123B0266FF7C2556D6918F068573E9B8B6F0FA44B0',
      owner_funds: '2648294730',
      quality: '0.0000005209900069501342',
    },
    {
      Account: 'r39rBggWHTUN95x31mAdxPCC7XnhuHRHor',
      BookDirectory:
        'DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE4E12843D2E482F0A',
      BookNode: '0',
      Flags: 131072,
      LedgerEntryType: 'Offer',
      OwnerNode: '1024a',
      PreviousTxnID:
        '4C9178098581A43C88E8C42760D9CF86CCDC9B18B99DDA20E91CEA63BC156559',
      PreviousTxnLgrSeq: 80327776,
      Sequence: 3289832,
      TakerGets: '404927402',
      TakerPays: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '211.046051649151',
      },
      index: '41E60EC5FE55577CC6B9DDE07EF0A6659D2B069E25F12F75BCEDCF94E2007B7B',
      owner_funds: '23953272168',
      quality: '0.0000005211947885145866',
    },
  ],
  bids: [
    {
      Account: 'rhG9NsvuiG9q3acfR8YbuQd5MabMVDocpc',
      BookDirectory:
        '4627DFFCFF8B5A265EDBD8AE8C14A52325DBFEDAF4F5C32E5B06E2259ADB6200',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '3',
      PreviousTxnID:
        'F4D2C5D67C38C30E611815222D1402ECD438DE167252BF434E2CFA58BF69E804',
      PreviousTxnLgrSeq: 80326053,
      Sequence: 79612812,
      TakerGets: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '5',
      },
      TakerPays: '9687505',
      index: '379709FE07C7209BF66F31255822049087E1B4977B556462E46D5F26183C2CC7',
      owner_funds: '67.76153742499045',
      quality: '1937501',
    },
    {
      Account: 'rBTwLga3i2gz3doX6Gva3MgEV8ZCD8jjah',
      BookDirectory:
        '4627DFFCFF8B5A265EDBD8AE8C14A52325DBFEDAF4F5C32E5B06E72B1C323523',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '0',
      PreviousTxnID:
        '79759B2B346BADF16A3E0A7CC52F7EE77AAE356FAB04178F097329CAEBD25FB5',
      PreviousTxnLgrSeq: 80327788,
      Sequence: 95908935,
      TakerGets: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '102932.4316',
      },
      TakerPays: '200000000000',
      index: '2C61AF858D251FE41FDF7768B42C412C39A49FC562B063A1A40A4C175AD8C6A6',
      owner_funds: '192823.71422378',
      quality: '1943022.202926371',
    },
    {
      Account: 'r39rBggWHTUN95x31mAdxPCC7XnhuHRHor',
      BookDirectory:
        '4627DFFCFF8B5A265EDBD8AE8C14A52325DBFEDAF4F5C32E5B06E72BAB10809A',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '1024a',
      PreviousTxnID:
        'A5F18BB1F514F879E6B896F2353E84E5AD67D537B494D5C3237B7AA7B93CA9EC',
      PreviousTxnLgrSeq: 80327776,
      Sequence: 3289831,
      TakerGets: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '14.1299883707017',
      },
      TakerPays: '27454915',
      index: '65D89D4C9EE529A927E4C831EE873F94BEBCDF29D3CCADD676AE77F7B1283A60',
      owner_funds: '537.8134698861974',
      quality: '1943024.599859354',
    },
  ],
};

const ORDER_BOOK_2 = {
  asks: [
    {
      Account: 'rhWVeCa6aL7U5argwYiUpMD9Gxtd6kxkNw',
      BookDirectory:
        'DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE491CC6E836AE4000',
      BookNode: '0',
      Flags: 131072,
      LedgerEntryType: 'Offer',
      OwnerNode: '0',
      PreviousTxnID:
        '44A811F5EE120D2215A7F482BDC4C0AF048C82C895C69E7E0FEC6163FCA5A48E',
      PreviousTxnLgrSeq: 33839380,
      Sequence: 33834963,
      TakerGets: '2000000',
      TakerPays: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '0.0000162',
      },
      index: '772B28EBC0CB840329A49BF6B696EC454444560C1EA343EB1C29C9421889C45F',
      owner_funds: '1383999940',
      quality: '8100000000000000e-27',
    },
    {
      Account: 'rJHjA2WqqYWSh4ttCPW1b9aSyFkisfz93j',
      BookDirectory:
        'DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE491CDAE1056DB731',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '0',
      PreviousTxnID:
        '5AA8D0E7FAB6E1C854F8E69C3C84A095FC9FEFF3BF29072D2D435758CA52DB9E',
      PreviousTxnLgrSeq: 17154522,
      Sequence: 17130191,
      TakerGets: '123123000000',
      TakerPays: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '1',
      },
      index: 'BC91DD45090AC3C2955A1877706BB8E637E1AE9D4A5731A942A06C2887839DB0',
      owner_funds: '967999808',
      quality: '8121959341471537e-27',
      taker_gets_funded: '967999808',
      taker_pays_funded: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '0.007862055083128254',
      },
    },
    {
      Account: 'rMFwQW3F5EvvJ4mu9dBZ3kWnEwj9SHjoGd',
      BookDirectory:
        'DFA3B6DDAB58C7E8E5D944E736DA4B7046C30E4F460FD9DE4D1D9B1F5D20D555',
      BookNode: '0',
      Flags: 0,
      LedgerEntryType: 'Offer',
      OwnerNode: '0',
      PreviousTxnID:
        'CF1FDE17372D00219401EB4847B3281A2AF76485BEB0EDF7DF7A6D5DC387C6C6',
      PreviousTxnLgrSeq: 16948251,
      Sequence: 16801746,
      TakerGets: '12000000',
      TakerPays: {
        currency: 'USD',
        issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B',
        value: '1',
      },
      index: '52F6B9F706D7324BBC6DC35EAFBE54E213930C99BD2432261D452E937C2817B8',
      owner_funds: '175107078',
      quality: '0.00000008333333333333333',
    },
  ],
  bids: [],
};

const GAS_PRICES = {
  gasPrice: '500000000',
  gasPriceToken: 'Token',
  gasLimit: '1000',
  gasCost: '100',
};

const INVALID_REQUEST = {
  chain: 'unknown',
  network: 'testnet',
};

beforeAll(async () => {
  xrpl = XRPL.getInstance('testnet');
  xrplCLOB = XRPLCLOB.getInstance('xrpl', 'testnet');
  patchConnect();
});

// eslint-disable-next-line @typescript-eslint/no-empty-function
beforeEach(() => {
  patchConnect();
  patchGetReserveInfo();
  patchFee();
  patchOrderTracking();
  patchCurrentBlockNumber();
  patchMarkets();
});

// afterEach(() => {
//   unpatch();
// });

afterAll(async () => {
  await xrpl.close();
  unpatch();
});

const patchConnect = () => {
  patch(xrpl, 'ensureConnection', async () => {
    return Promise.resolve();
  });
};

const patchFee = () => {
  patch(xrpl, 'getFee', () => {
    return {
      base: '1',
      median: '1',
      minimum: '1',
      openLedger: '1',
    };
  });
};

const patchOrderTracking = () => {
  patch(xrplCLOB, 'trackOrder', () => {
    return Promise.resolve();
  });
};

const patchGetOrder = () => {
  patch(xrplCLOB, 'getOrder', () => {
    return undefined;
  });
};

const patchCurrentBlockNumber = (withError: boolean = false) => {
  patch(xrplCLOB, 'getCurrentBlockNumber', () => {
    return withError ? -1 : 100;
  });
};

const patchMarkets = () => {
  patch(xrplCLOB, 'parsedMarkets', MARKETS);
};

const patchGetMidPriceForMarket = () => {
  patch(xrplCLOB, 'getMidPriceForMarket', () => {
    return 1.0;
  });
};

const patchGetOrderBookFromXRPL = (orderbook: any) => {
  patch(xrplCLOB, 'getOrderBookFromXRPL', () => {
    return orderbook;
  });
};

const patchOrders = () => {
  patch(xrplCLOB, '_orderStorage', {
    async getOrdersByHash() {
      const orders: Record<string, Order> = { [ORDER.hash]: ORDER };
      return orders;
    },
    // async getOrderByMarketAndHash() {
    //   const orders: Record<string, Order> = { [ORDER.hash]: ORDER };
    //   return orders;
    // },
    async getOrdersByMarket() {
      const orders: Record<string, Order> = { [ORDER.hash]: ORDER };
      return orders;
    },
  });
};

const patchSubmitTxn = () => {
  patch(xrplCLOB, 'submitTxn', () => {
    return {
      prepared: {
        Sequence: 1234567,
      },
      signed: {
        hash: TX_HASH,
      },
    };
  });
};

const patchGetWallet = () => {
  patch(xrplCLOB, 'getWallet', () => {
    return {
      classicAddress: 'rh8LssQyeBdEXk7Zv86HxHrx8k2R2DBUrx',
    };
  });
};

const patchGasPrices = () => {
  patch(xrplCLOB, 'getFeeEstimate', () => {
    return GAS_PRICES;
  });
};

const patchGetReserveInfo = () => {
  patch(xrpl, 'getReserveInfo', async () => {
    return Promise.resolve();
  });
};

describe('GET /clob/markets', () => {
  it('should return 200 with proper request', async () => {
    patchMarkets();
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(Object.values(res.body.markets).length).toEqual(2);
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orderBook', () => {
  it('should return 200 with proper request with ORDER_BOOK_1', async () => {
    patchMarkets();
    patchGetOrderBookFromXRPL(ORDER_BOOK_1);
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.buys[0].price).toEqual('0.5161287658690241');
      })
      .expect((res) => expect(res.body.buys[0].quantity).toEqual('9.687505'))
      .expect((res) =>
        expect(res.body.sells[0].price).toEqual('0.5209865069999999')
      )
      .expect((res) => expect(res.body.sells[0].quantity).toEqual('60133'));
  });

  it('should return 200 with proper request with ORDER_BOOK_2', async () => {
    patchMarkets();
    patchGetOrderBookFromXRPL(ORDER_BOOK_2);
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.buys[0]).toBeUndefined())
      .expect((res) => expect(res.body.sells[0].price).toEqual('0.0000081'))
      .expect((res) => expect(res.body.sells[0].quantity).toEqual('2'));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/ticker', () => {
  it('should return 200 with proper request', async () => {
    patchMarkets();
    patchGetMidPriceForMarket();
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.markets[0].baseCurrency).toEqual('USD');
      })
      .expect((res) => expect(res.body.markets[0].quoteCurrency).toEqual('XRP'))
      .expect((res) => expect(res.body.markets[0].midprice).toEqual(1));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchMarkets();
    patchOrders();
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        market: MARKET,
        address: 'rh8LssQyeBdEXk7Zv86HxHrx8k2R2DBUrx', // noqa: mock
        orderId: '1234567',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.orders.length).toEqual(1);
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchMarkets();
    patchSubmitTxn();
    patchGetWallet();
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'rh8LssQyeBdEXk7Zv86HxHrx8k2R2DBUrx', // noqa: mock
        market: MARKET,
        price: '1',
        amount: '1',
        side: 'BUY',
        orderType: 'LIMIT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('DELETE /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchSubmitTxn();
    patchGetWallet();
    patchGetOrder();
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
        address: 'rh8LssQyeBdEXk7Zv86HxHrx8k2R2DBUrx', // noqa: mock
        market: MARKET,
        orderId: '1234567',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/estimateGas', () => {
  it('should return 200 with proper request', async () => {
    patchGasPrices();
    patchGetOrder();
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query({
        chain: 'xrpl',
        network: 'testnet',
        connector: 'xrpl',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.gasPrice).toEqual(GAS_PRICES.gasPrice));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});
