import request from 'supertest';
import { patch, unpatch } from '../../test/services/patch';
import { gatewayApp } from '../../src/app';
// import { Injective } from '../../src/chains/injective/injective';
// import { InjectiveCLOB } from '../../src/connectors/injective/injective';
// import { InjectiveClobPerp } from '../../src/connectors/injective_perpetual/injective.perp';

// let inj: Injective;
// let injCLOB: InjectiveCLOB;
// let injClobPerp: InjectiveClobPerp;

// const TX_HASH =
//   'CC6BF44223B4BD05396F83D55A0ABC0F16CE80836C0E34B08F4558CF72944299'; // noqa: mock
// const MARKET = 'INJ-USDT';

// const SPOT_MARKETS = [
//   {
//     marketId:
//       '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0', // noqa: mock
//     marketStatus: 'active',
//     ticker: 'INJ/USDT',
//     baseDenom: 'inj',
//     quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
//     quoteToken: {
//       name: 'Tether',
//       address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
//       symbol: 'USDT',
//       logo: 'https://static.alchemyapi.io/images/assets/825.png',
//       decimals: 6,
//       updatedAt: 1669849325905,
//       coinGeckoId: '',
//     },
//     baseToken: {
//       name: 'Injective Protocol',
//       address: '0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30',
//       symbol: 'INJ',
//       logo: 'https://static.alchemyapi.io/images/assets/7226.png',
//       decimals: 18,
//       updatedAt: 1659191789475,
//       coinGeckoId: '',
//     },
//     makerFeeRate: '-0.0001',
//     takerFeeRate: '0.001',
//     serviceProviderFee: '0.4',
//     minPriceTickSize: 1e-15,
//     minQuantityTickSize: 1000000000000000,
//   },
// ];
// const DERIVATIVE_MARKETS = [
//   {
//     oracleBase: 'INJ',
//     oracleQuote: 'USDT',
//     oracleType: 'bandibc',
//     oracleScaleFactor: 6,
//     initialMarginRatio: '0.195',
//     maintenanceMarginRatio: '0.095',
//     isPerpetual: true,
//     marketId:
//       '0x9b9980167ecc3645ff1a5517886652d94a0825e54a77d2057cbbe3ebee015963',
//     marketStatus: 'active',
//     ticker: 'INJ/USDT PERP',
//     quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
//     quoteToken: {
//       name: 'Tether',
//       address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
//       symbol: 'USDT',
//       logo: 'https://static.alchemyapi.io/images/assets/825.png',
//       decimals: 6,
//       updatedAt: 1677706712778,
//       coinGeckoId: '',
//     },
//     makerFeeRate: '-0.0001',
//     takerFeeRate: '0.001',
//     serviceProviderFee: '0.4',
//     minPriceTickSize: 1000,
//     minQuantityTickSize: 0.001,
//     perpetualMarketInfo: {
//       hourlyFundingRateCap: '0.0000625',
//       hourlyInterestRate: '0.00000416666',
//       nextFundingTimestamp: 1678186800,
//       fundingInterval: 3600,
//     },
//     perpetualMarketFunding: {
//       cumulativeFunding: '1161622.340224922505695088',
//       cumulativePrice: '3.308427930614979416',
//       lastTimestamp: 1678185153,
//     },
//   },
// ];

// const FUNDING_RATES = [
//   {
//     marketId:
//       '0x1c79dac019f73e4060494ab1b4fcba734350656d6fc4d474f6a238c13c6f9ced',
//     rate: '0.000122',
//     timestamp: 1654246801786,
//   },
// ];

// const FUNDING_PAYMENTS = [
//   {
//     marketId:
//       '0x4ca0f92fc28be0c9761326016b5a1a2177dd6375558365116b5bdda9abc229ce',
//     subaccountId:
//       '0xaf79152ac5df276d9a8e1e2e22822f9713474902000000000000000000000000',
//     amount: '-4895705.795221',
//     timestamp: 1654246801786,
//   },
// ];

// const POSITIONS = [
//   {
//     ticker: 'BTC/USDT PERP',
//     marketId:
//       '0x4ca0f92fc28be0c9761326016b5a1a2177dd6375558365116b5bdda9abc229ce',
//     subaccountId:
//       '0xc6fe5d33615a1c52c08018c47e8bc53646a0e101000000000000000000000000',
//     direction: 'short',
//     quantity: '1.6321',
//     entryPrice: '40673269578.764267860566718788',
//     margin: '65479686044.860453741141489314',
//     liquidationPrice: '76945874187.425265',
//     markPrice: '40128736026.4094317665',
//     aggregateReduceOnlyQuantity: '0',
//   },
// ];

// const ORDER_BOOK = {
//   sells: [
//     ['12', '1'],
//     ['11', '0.3'],
//   ],
//   buys: [
//     ['10', '1'],
//     ['9', '0.3'],
//   ],
// };

// const TRADES = {
//   trades: [
//     {
//       executionPrice: '1.0123',
//     },
//   ],
//   pagination: { to: 0, from: 0, total: 1 },
// };

// const ORDERS = {
//   orderHistory: [
//     {
//       orderHash:
//         '0xf6f81a37796bd06a797484467302e4d6f72832409545e2e01feb86dd8b22e4b2', // noqa: mock
//       marketId:
//         '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0', // noqa: mock
//       active: false,
//       subaccountId:
//         '0x261362dbc1d83705ab03e99792355689a4589b8e000000000000000000000000', // noqa: mock
//       executionType: 'limit',
//       orderType: 'sell',
//       price: '0.000000000002',
//       triggerPrice: '0',
//       quantity: '2000000000000000000',
//       filledQuantity: '0',
//       state: 'canceled',
//       createdAt: 1669850499821,
//       updatedAt: 1669853807685,
//       direction: 'sell',
//     },
//     {
//       orderHash:
//         '0x751a0fcfa52562d0cfe842d21673ebcb654a3774739654800388b1037bc267bc', // noqa: mock
//       marketId:
//         '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0', // noqa: mock
//       active: true,
//       subaccountId:
//         '0x261362dbc1d83705ab03e99792355689a4589b8e000000000000000000000000', // noqa: mock
//       executionType: 'limit',
//       orderType: 'sell',
//       price: '0.000000000002',
//       triggerPrice: '0',
//       quantity: '2000000000000000000',
//       filledQuantity: '0',
//       state: 'booked',
//       createdAt: 1669850223538,
//       updatedAt: 1669850223538,
//       direction: 'sell',
//     },
//   ],
//   pagination: { to: 0, from: 0, total: 2 },
// };

// const GAS_PRICES = {
//   gasPrice: '500000000',
//   gasPriceToken: 'Token',
//   gasLimit: '1000',
//   gasCost: '100',
// };

// const INVALID_REQUEST = {
//   chain: 'unknown',
//   network: 'mainnet',
// };

// beforeAll(async () => {
//   inj = Injective.getInstance('mainnet');
//   patchCurrentBlockNumber();
//   inj.init();
//   injCLOB = InjectiveCLOB.getInstance('injective', 'mainnet');
//   injClobPerp = InjectiveClobPerp.getInstance('injective', 'mainnet');
//   patchMarkets();
//   await injCLOB.init();
//   await injClobPerp.init();
// });

// // eslint-disable-next-line @typescript-eslint/no-empty-function
// beforeEach(() => {
//   patchCurrentBlockNumber();
// });

// afterEach(() => {
//   unpatch();
// });

// afterAll(async () => {
//   await inj.close();
// });

// const patchCurrentBlockNumber = (withError: boolean = false) => {
//   patch(inj.chainRestTendermintApi, 'fetchLatestBlock', () => {
//     return withError ? {} : { header: { height: 100 } };
//   });
// };

// const patchMarkets = () => {
//   patch(injCLOB.spotApi, 'fetchMarkets', () => {
//     return SPOT_MARKETS;
//   });
//   patch(injClobPerp.derivativeApi, 'fetchMarkets', () => {
//     return DERIVATIVE_MARKETS;
//   });
// };

// const patchOrderBook = () => {
//   patch(injCLOB.spotApi, 'fetchOrderbookV2', () => {
//     return ORDER_BOOK;
//   });
//   patch(injClobPerp.derivativeApi, 'fetchOrderbookV2', () => {
//     return ORDER_BOOK;
//   });
// };

// const patchTrades = () => {
//   patch(injClobPerp.derivativeApi, 'fetchTrades', () => {
//     return TRADES;
//   });
// };

// const patchFundingRates = () => {
//   patch(injClobPerp.derivativeApi, 'fetchFundingRates', () => {
//     return {
//       fundingRates: FUNDING_RATES,
//       pagination: { to: 0, from: 0, total: 1 },
//     };
//   });
// };

// const patchOraclePrice = () => {
//   patch(injClobPerp.oracleApi, 'fetchOraclePrice', () => {
//     return {
//       price: '1.234',
//     };
//   });
// };

// const patchFundingPayments = () => {
//   patch(injClobPerp.derivativeApi, 'fetchFundingPayments', () => {
//     return {
//       fundingPayments: FUNDING_PAYMENTS,
//       pagination: { to: 0, from: 0, total: 1 },
//     };
//   });
// };

// const patchPositions = () => {
//   patch(injClobPerp.derivativeApi, 'fetchPositions', () => {
//     return {
//       positions: POSITIONS,
//       pagination: { to: 0, from: 0, total: 1 },
//     };
//   });
// };

// const patchGetWallet = () => {
//   patch(inj, 'getWallet', () => {
//     return {
//       privateKey:
//         'b5959390c834283a11ad71f3668fee9784853f1422e921a7015c275c98c95c08', // noqa: mock
//       injectiveAddress: 'inj1ycfk9k7pmqmst2craxteyd2k3xj93xuw2x0vgp',
//     };
//   });
// };

// const patchMsgBroadcaster = () => {
//   patch(inj, 'broadcaster', () => {
//     return {
//       broadcast() {
//         return {
//           txHash: TX_HASH,
//         };
//       },
//     };
//   });
// };

// const patchOrders = () => {
//   patch(injCLOB.spotApi, 'fetchOrderHistory', () => {
//     return ORDERS;
//   });
//   patch(injClobPerp.derivativeApi, 'fetchOrderHistory', () => {
//     return ORDERS;
//   });
// };

// const patchGasPrices = () => {
//   patch(injCLOB, 'estimateGas', () => {
//     return GAS_PRICES;
//   });
//   patch(injClobPerp, 'estimateGas', () => {
//     return GAS_PRICES;
//   });
// };

// describe('GET /clob/markets', () => {
//   it('should return 200 with proper request', async () => {
//     patchMarkets();
//     await request(gatewayApp)
//       .get(`/clob/markets`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.markets).toEqual(injCLOB.parsedMarkets));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/markets`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/orderBook', () => {
//   it('should return 200 with proper request', async () => {
//     patchOrderBook();
//     await request(gatewayApp)
//       .get(`/clob/orderBook`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//         market: MARKET,
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.buys).toEqual(ORDER_BOOK.buys))
//       .expect((res) => expect(res.body.sells).toEqual(ORDER_BOOK.sells));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/orderBook`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/ticker', () => {
//   it('should return 200 with proper request', async () => {
//     patchMarkets();
//     await request(gatewayApp)
//       .get(`/clob/ticker`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.markets).toEqual(injCLOB.parsedMarkets));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/ticker`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/orders', () => {
//   it('should return 200 with proper request', async () => {
//     patchOrders();
//     await request(gatewayApp)
//       .get(`/clob/orders`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//         orderId: '0x...',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.orders).toEqual(ORDERS.orderHistory));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/orders`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('POST /clob/orders', () => {
//   it('should return 200 with proper request', async () => {
//     patchGetWallet();
//     patchMsgBroadcaster();
//     await request(gatewayApp)
//       .post(`/clob/orders`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//         price: '10000.12',
//         amount: '0.12',
//         side: 'BUY',
//         orderType: 'LIMIT',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .post(`/clob/orders`)
//       .send(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('DELETE /clob/orders', () => {
//   it('should return 200 with proper request', async () => {
//     patchGetWallet();
//     patchMsgBroadcaster();
//     await request(gatewayApp)
//       .delete(`/clob/orders`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//         orderId: '0x...',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .delete(`/clob/orders`)
//       .send(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('POST /clob/batchOrders', () => {
//   it('should return 200 with proper request to create batch orders', async () => {
//     patchGetWallet();
//     patchMsgBroadcaster();
//     await request(gatewayApp)
//       .post(`/clob/batchOrders`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         createOrderParams: [
//           {
//             price: '2',
//             amount: '0.10',
//             side: 'SELL',
//             orderType: 'LIMIT',
//             market: MARKET,
//           },
//           {
//             price: '3',
//             amount: '0.10',
//             side: 'SELL',
//             market: MARKET,
//           },
//         ],
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
//   });

//   it('should return 200 with proper request to delete batch orders', async () => {
//     patchGetWallet();
//     patchMsgBroadcaster();
//     await request(gatewayApp)
//       .post(`/clob/batchOrders`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//         cancelOrderIds: [
//           '0x73af517124c3f564d1d70e38ad5200dfc7101d04986c14df410042e00932d4bf', // noqa: mock
//           '0x8ce222ca5da95aaffd87b3d38a307f25d6e2c09e70a0cb8599bc6c8a0851fda3', // noqa: mock
//         ],
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .post(`/clob/batchOrders`)
//       .send(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/estimateGas', () => {
//   it('should return 200 with proper request', async () => {
//     patchGasPrices();
//     await request(gatewayApp)
//       .get(`/clob/estimateGas`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.gasPrice).toEqual(GAS_PRICES.gasPrice));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/estimateGas`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// // perp stuff

// describe('POST /clob/perp/positions', () => {
//   it('should return 200 with proper request', async () => {
//     patchPositions();
//     await request(gatewayApp)
//       .post(`/clob/perp/positions`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         markets: [MARKET],
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.positions).toEqual(POSITIONS));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .post(`/clob/perp/positions`)
//       .send(INVALID_REQUEST)
//       .set('Accept', 'application/json')
//       .expect(404);
//   });
// });

// describe('POST /clob/perp/funding/info', () => {
//   it('should return 200 with proper request', async () => {
//     patchMarkets();
//     patchFundingRates();
//     patchTrades();
//     patchOraclePrice();
//     await request(gatewayApp)
//       .post(`/clob/perp/funding/info`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         market: MARKET,
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.fundingInfo.markPrice).toEqual('1.234'));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .post(`/clob/perp/funding/info`)
//       .send(INVALID_REQUEST)
//       .set('Accept', 'application/json')
//       .expect(404);
//   });
// });

// describe('POST /clob/perp/funding/payments', () => {
//   it('should return 200 with proper request', async () => {
//     patchFundingPayments();
//     await request(gatewayApp)
//       .post(`/clob/perp/funding/payments`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         market: MARKET,
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) =>
//         expect(res.body.fundingPayments).toEqual(FUNDING_PAYMENTS)
//       );
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .post(`/clob/perp/funding/payments`)
//       .send(INVALID_REQUEST)
//       .set('Accept', 'application/json')
//       .expect(404);
//   });
// });

// describe('GET /clob/perp/markets', () => {
//   it('should return 200 with proper request', async () => {
//     patchMarkets();
//     await request(gatewayApp)
//       .get(`/clob/perp/markets`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) =>
//         expect(res.body.markets).toEqual(injClobPerp.parsedMarkets)
//       );
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/perp/markets`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/perp/orderBook', () => {
//   it('should return 200 with proper request', async () => {
//     patchOrderBook();
//     await request(gatewayApp)
//       .get(`/clob/perp/orderBook`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         market: MARKET,
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.buys).toEqual(ORDER_BOOK.buys))
//       .expect((res) => expect(res.body.sells).toEqual(ORDER_BOOK.sells));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/perp/orderBook`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/perp/ticker', () => {
//   it('should return 200 with proper request', async () => {
//     patchMarkets();
//     await request(gatewayApp)
//       .get(`/clob/perp/ticker`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) =>
//         expect(res.body.markets).toEqual(injClobPerp.parsedMarkets)
//       );
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/perp/ticker`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/perp/orders', () => {
//   it('should return 200 with proper request', async () => {
//     patchOrders();
//     await request(gatewayApp)
//       .get(`/clob/perp/orders`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.orders).toEqual(ORDERS.orderHistory));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/perp/orders`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('POST /clob/perp/orders', () => {
//   it('should return 200 with proper request', async () => {
//     patchGetWallet();
//     patchMsgBroadcaster();
//     await request(gatewayApp)
//       .post(`/clob/perp/orders`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//         price: '10000.12',
//         amount: '0.12',
//         side: 'BUY',
//         orderType: 'LIMIT',
//         leverage: 20.0,
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .post(`/clob/perp/orders`)
//       .send(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('DELETE /clob/perp/orders', () => {
//   it('should return 200 with proper request', async () => {
//     patchGetWallet();
//     patchMsgBroadcaster();
//     await request(gatewayApp)
//       .delete(`/clob/perp/orders`)
//       .send({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         address:
//           '0x261362dBC1D83705AB03e99792355689A4589b8E000000000000000000000000', // noqa: mock
//         market: MARKET,
//         orderId: '0x...',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.txHash).toEqual(TX_HASH));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .delete(`/clob/perp/orders`)
//       .send(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/perp/estimateGas', () => {
//   it('should return 200 with proper request', async () => {
//     patchGasPrices();
//     await request(gatewayApp)
//       .get(`/clob/perp/estimateGas`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) => expect(res.body.gasPrice).toEqual(GAS_PRICES.gasPrice));
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/perp/estimateGas`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });

// describe('GET /clob/perp/lastTradePrice', () => {
//   it('should return 200 with proper request', async () => {
//     patchTrades();
//     await request(gatewayApp)
//       .get(`/clob/perp/lastTradePrice`)
//       .query({
//         chain: 'injective',
//         network: 'mainnet',
//         connector: 'injective_perpetual',
//         market: MARKET,
//       })
//       .set('Accept', 'application/json')
//       .expect('Content-Type', /json/)
//       .expect(200)
//       .expect((res) =>
//         expect(res.body.lastTradePrice).toEqual(
//           (
//             parseFloat(TRADES.trades[0].executionPrice) * parseFloat(`1e-6`)
//           ).toString()
//         )
//       );
//   });

//   it('should return 404 when parameters are invalid', async () => {
//     await request(gatewayApp)
//       .get(`/clob/perp/lastTradePrice`)
//       .query(INVALID_REQUEST)
//       .expect(404);
//   });
// });
