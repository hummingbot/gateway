import { Oraichain } from '../../../src/chains/oraichain/oraichain';
import { OraidexCLOB } from '../../../src/connectors/oraidex/oraidex';
import { gatewayApp } from '../../../src/app';
import request from 'supertest';

let oraichain: Oraichain;
let oraiDex: OraidexCLOB;
const address = 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k';

const TX_HASH =
  'AB4256ED72AFDE0EBB42E2204108D87A87D4E68EB974C5B80A1EBC41F5BE3394';

const INVALID_REQUEST = {
  chain: 'unknown',
  network: 'mainnet',
};

const TX_DATA = {
  height: 21620440,
  txIndex: 0,
  hash: 'AB4256ED72AFDE0EBB42E2204108D87A87D4E68EB974C5B80A1EBC41F5BE3394',
  code: 0,
  events: [
    {
      type: 'coin_spent',
      attributes: [
        {
          key: 'spender',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
        { key: 'amount', value: '142orai' },
      ],
    },
    {
      type: 'coin_received',
      attributes: [
        {
          key: 'receiver',
          value: 'orai17xpfvakm2amg962yls6f84z3kell8c5lr24r2w',
        },
        { key: 'amount', value: '142orai' },
      ],
    },
    {
      type: 'transfer',
      attributes: [
        {
          key: 'recipient',
          value: 'orai17xpfvakm2amg962yls6f84z3kell8c5lr24r2w',
        },
        {
          key: 'sender',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
        { key: 'amount', value: '142orai' },
      ],
    },
    {
      type: 'message',
      attributes: [
        {
          key: 'sender',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
      ],
    },
    {
      type: 'tx',
      attributes: [
        { key: 'fee', value: '142orai' },
        {
          key: 'fee_payer',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
      ],
    },
    {
      type: 'tx',
      attributes: [
        {
          key: 'acc_seq',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k/603',
        },
      ],
    },
    {
      type: 'tx',
      attributes: [
        {
          key: 'signature',
          value:
            '6nxCFp3PiVa62DvMY/xWgYnEBHDW0AhWOhJyWWRKallz5KTfNviOJV37vzPENY44enIrftIont/QyuIk8MB01A==',
        },
      ],
    },
    {
      type: 'message',
      attributes: [
        {
          key: 'action',
          value: '/cosmwasm.wasm.v1.MsgExecuteContract',
        },
      ],
    },
    {
      type: 'message',
      attributes: [
        { key: 'module', value: 'wasm' },
        {
          key: 'sender',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
      ],
    },
    {
      type: 'coin_spent',
      attributes: [
        {
          key: 'spender',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
        { key: 'amount', value: '10000orai' },
      ],
    },
    {
      type: 'coin_received',
      attributes: [
        {
          key: 'receiver',
          value:
            'orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp',
        },
        { key: 'amount', value: '10000orai' },
      ],
    },
    {
      type: 'transfer',
      attributes: [
        {
          key: 'recipient',
          value:
            'orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp',
        },
        {
          key: 'sender',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
        { key: 'amount', value: '10000orai' },
      ],
    },
    {
      type: 'execute',
      attributes: [
        {
          key: '_contract_address',
          value:
            'orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp',
        },
      ],
    },
    {
      type: 'wasm',
      attributes: [
        {
          key: '_contract_address',
          value:
            'orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp',
        },
        { key: 'action', value: 'submit_order' },
        { key: 'order_type', value: 'limit' },
        {
          key: 'pair',
          value: 'orai - orai12hzjxfh77wl572gdzct2fxv2arxcwh6gykc7qh',
        },
        { key: 'order_id', value: '4214202' },
        { key: 'status', value: 'Open' },
        { key: 'direction', value: 'Sell' },
        {
          key: 'bidder_addr',
          value: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        },
        { key: 'offer_asset', value: '10000 orai' },
        {
          key: 'ask_asset',
          value: '200000 orai12hzjxfh77wl572gdzct2fxv2arxcwh6gykc7qh',
        },
      ],
    },
  ],
  rawLog:
    '[{"events":[{"type":"coin_received","attributes":[{"key":"receiver","value":"orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp"},{"key":"amount","value":"10000orai"}]},{"type":"coin_spent","attributes":[{"key":"spender","value":"orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k"},{"key":"amount","value":"10000orai"}]},{"type":"execute","attributes":[{"key":"_contract_address","value":"orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp"}]},{"type":"message","attributes":[{"key":"action","value":"/cosmwasm.wasm.v1.MsgExecuteContract"},{"key":"module","value":"wasm"},{"key":"sender","value":"orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k"}]},{"type":"transfer","attributes":[{"key":"recipient","value":"orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp"},{"key":"sender","value":"orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k"},{"key":"amount","value":"10000orai"}]},{"type":"wasm","attributes":[{"key":"_contract_address","value":"orai1nt58gcu4e63v7k55phnr3gaym9tvk3q4apqzqccjuwppgjuyjy6sxk8yzp"},{"key":"action","value":"submit_order"},{"key":"order_type","value":"limit"},{"key":"pair","value":"orai - orai12hzjxfh77wl572gdzct2fxv2arxcwh6gykc7qh"},{"key":"order_id","value":"4214202"},{"key":"status","value":"Open"},{"key":"direction","value":"Sell"},{"key":"bidder_addr","value":"orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k"},{"key":"offer_asset","value":"10000 orai"},{"key":"ask_asset","value":"200000 orai12hzjxfh77wl572gdzct2fxv2arxcwh6gykc7qh"}]}]}]',
  tx: new Uint8Array(4)[1],
  msgResponses: [],
  gasUsed: 115207,
  gasWanted: 141511,
};

beforeAll(async () => {
  oraichain = Oraichain.getInstance('mainnet');
  oraichain.initSigningCosmWasmClient = jest.fn();
  await oraichain.init();
  oraiDex = OraidexCLOB.getInstance('oraichain', 'mainnet');
  await oraiDex.init();
});

afterAll(async () => {
  await oraichain.close();
});

describe('GET /clob/markets', () => {
  it('return 200', async () => {
    await request(gatewayApp)
      .get('/clob/markets')
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        connector: 'oraidex',
      })
      .set('Accept', 'application/json')
      .expect(200)
      .expect((res) => expect(res.body).toHaveProperty('markets'));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orderBook', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        connector: 'oraidex',
        market: 'ORAI-USDT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body).toHaveProperty('buys'))
      .expect((res) => expect(res.body).toHaveProperty('sells'));
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
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        connector: 'oraidex',
        market: 'ORAI-USDT',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.markets).toHaveProperty('price'));
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
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        connector: 'oraidex',
        address: address,
        market: 'ORAI-USDT',
        orderId: 'None',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body).toHaveProperty('orders'));
  });

  it('should return 200', async () => {
    oraiDex.getAllOrders = jest.fn().mockReturnValue({
      orders: [
        {
          order_id: '123456',
        },
      ],
    });
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        connector: 'oraidex',
        address: address,
        market: 'ORAI-USDT',
        orderId: '123456',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body).toHaveProperty('orders'));
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
    oraichain.executeContract = jest
      .fn()
      .mockResolvedValue({ transactionHash: TX_HASH });
    oraichain.cosmwasmClient.getTx = jest.fn().mockResolvedValue(TX_DATA);
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        connector: 'oraidex',
        chain: 'oraichain',
        network: 'mainnet',
        market: 'ORAI-USDT',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        side: 'SELL',
        orderType: 'LIMIT',
        price: '16.0',
        amount: '0.010000',
        clientOrderID: 'SOIUT61865c7bbdea1d13518c84198b5e0e42a146814036da3',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 200 with proper request', async () => {
    oraichain.executeContract = jest
      .fn()
      .mockResolvedValue({ transactionHash: TX_HASH });
    oraichain.cosmwasmClient.getTx = jest.fn().mockResolvedValue(TX_DATA);
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        connector: 'oraidex',
        chain: 'oraichain',
        network: 'mainnet',
        market: 'ORAI-USDT',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        side: 'BUY',
        orderType: 'LIMIT',
        price: '16.0',
        amount: '0.010000',
        clientOrderID: 'SOIUT61865c7bbdea1d13518c84198b5e0e42a146814036da3',
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
    oraichain.executeContract = jest
      .fn()
      .mockResolvedValue({ transactionHash: TX_HASH });
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send({
        chain: 'oraichain',
        connector: 'oraidex',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        market: 'xOCH-USDT',
        orderId: '4191398',
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

describe('POST /clob/batchOrders', () => {
  it('should return 200 with proper request to create batch orders', async () => {
    oraichain.executeContractMultiple = jest
      .fn()
      .mockResolvedValue({ transactionHash: TX_HASH });
    oraichain.cosmwasmClient.getTx = jest.fn().mockResolvedValue(TX_DATA);
    await request(gatewayApp)
      .post(`/clob/batchOrders`)
      .send({
        chain: 'oraichain',
        connector: 'oraidex',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        createOrderParams: [
          {
            market: 'xOCH-USDT',
            amount: '0.01',
            price: '9.5',
            side: 'BUY',
            orderType: 'LIMIT',
          },
          {
            market: 'xOCH-USDT',
            amount: '0.01',
            price: '9.6',
            side: 'SELL',
            orderType: 'LIMIT',
          },
        ],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 200 with proper request to delete batch orders', async () => {
    oraichain.executeContractMultiple = jest
      .fn()
      .mockResolvedValue({ transactionHash: TX_HASH });
    await request(gatewayApp)
      .post(`/clob/batchOrders`)
      .send({
        chain: 'oraichain',
        connector: 'oraidex',
        network: 'mainnet',
        address: 'orai1swus8mwu8xjulawqxdwh8hvg4gknh2c64tuc0k',
        cancelOrderParams: [
          {
            market: 'xOCH-USDT',
            orderId: '4199233',
          },
          {
            market: 'xOCH-USDT',
            orderId: '4199232',
          },
        ],
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/batchOrders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/estimateGas', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query({
        chain: 'oraichain',
        network: 'mainnet',
        connector: 'oraidex',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200);
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('others', () => {
  it('getConnectedInstances', async () => {
    const instances = OraidexCLOB.getConnectedInstances();
    expect(instances).toBeDefined();
  });

  it('markets', async () => {
    const markets = await oraiDex.markets({
      chain: 'oraichain',
      network: 'mainnet',
      connector: 'oraidex',
      market: 'ORAI-USDT',
    });
    expect(markets).toBeDefined();
  });
});
