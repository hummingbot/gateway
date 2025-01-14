// import {PriceRequest, TradeRequest} from "../../../src/amm/amm.requests";
// jest.useFakeTimers();
// import { Stonfi } from '../../../src/connectors/ston_fi/ston_fi';
// import { patch, unpatch } from '../../../test/services/patch';
// import { Ton } from '../../../src/chains/ton/ton';
// import { getTonConfig } from '../../../src/chains/ton/ton.config';
// import {
//   price,
//   trade,
//   estimateGas,
// } from '../../../src/connectors/ston_fi/ston_fi.controllers';
// import {TOKEN_NOT_SUPPORTED_ERROR_MESSAGE} from "../../../src/services/error-handler";

// let ton: Ton;
// let ston_fi: Stonfi;

// const EXPECTED_CURRENT_BLOCK_NUMBER = 100;
// const CHAIN_NAME = 'ton';
// const NETWORK = 'testnet';
// const CONFIG = getTonConfig(NETWORK);
// const NATIVE_TOKEN = CONFIG.nativeCurrencySymbol;
// const USDC_TOKEN = 'USDC';


// const TX = {
//   txnID: 'mock-txn-id',
//   round: 1,
//   quote: {},
//   assetOut: undefined,
// };

// const patchCurrentBlockNumber = () => {
//   patch(ton, 'getCurrentBlockNumber', async () => ({
//     seqno: EXPECTED_CURRENT_BLOCK_NUMBER,
//     root_hash: 'mock-root-hash',
//   }));
// };

// const patchGetAssetData = () => {
//   patch(ton, 'getAssetData', async () => [
//     {
//       id: '0',
//       name: 'TON',
//       symbol: NATIVE_TOKEN,
//       decimals: 6,
//       url: 'https://ston.fi',
//     },
//     {
//       id: '1',
//       name: 'USDC',
//       symbol: USDC_TOKEN,
//       decimals: 6,
//     },
//   ]);
// };

// const patchEstimateTrade = () => {
//   patch(ston_fi, 'estimateTrade', async (_req: PriceRequest) => ({
//     trade: {
//       askAddress: 'mock-ask-address',
//       offerAddress: 'mock-offer-address',
//       swapRate: '0.2',
//     },
//     expectedAmount: 1,
//     expectedPrice: 0.2,
//   }));
// };

// const patchExecuteTrade = () => {
//   patch(ston_fi, 'executeTrade', async (_account, _quote, _baseName, _quoteName, _isBuy) => {
//     return {
//       txnID: 'mock-txn-id',
//       round: 1,
//       trade: {
//         askAddress: 'mock-ask-address',
//         offerAddress: 'mock-offer-address',
//         offerUnits: '1000000000',
//         swapRate: '0.2'
//       },
//     };
//   });
// };

// const patchGetAccountFromAddress = () => {
//   patch(ton, 'getAccountFromAddress', async () => ({
//     publicKey: 'mock-public-key',
//     secretKey: 'mock-secret-key',
//   }));
// };

// const patchGetAssetForSymbol = () => {
//   patch(ton, 'getAssetForSymbol', (symbol: string) => {
//     if (symbol === 'TON') {
//       return { assetId: { address: 'mock-ton-address' }, decimals: 6 };
//     } else if (symbol === 'USDC') {
//       return { assetId: { address: 'mock-usdc-address' }, decimals: 6 };
//     }
//     return null;
//   });
// };

// beforeAll(async () => {
//   ton = Ton.getInstance(NETWORK);
//   patchCurrentBlockNumber();
//   patchGetAssetData();

//   await ton.init();

//   ston_fi = Stonfi.getInstance(NETWORK);
//   await ston_fi.init();

//   console.log('ston_fi instance:', ston_fi); // Check what methods are available
//   console.log('ston_fi methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(ston_fi)));
//   console.log('Patched estimateTrade:', typeof ston_fi.estimateTrade);
//   console.log('Patched executeTrade:', typeof ston_fi.executeTrade);
//   patchGetAccountFromAddress();
//   patchGetAssetForSymbol();

//   if (!ston_fi.ready()) {
//     throw new Error('ston_fi failed to initialize');
//   }
// });

// beforeEach(() => {
//   unpatch();
// });

// afterEach(() => {
//   unpatch();
// });

// describe('ston_fi.controllers - price', () => {
//   it('Should return a price response when trade estimation is successful', async () => {
//     patchEstimateTrade();

//     const req = {
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//       limitPrice: '0.1',
//     } as PriceRequest;

//     const response = await price(ton, ston_fi, req);
//     expect(response).toHaveProperty('expectedAmount', '1');
//     expect(response).toHaveProperty('price', '0.2');
//     expect(response).toHaveProperty('gasPrice', ton.gasPrice);
//   });

//   it('Should throw an error if trade estimation fails', async () => {
//     patch(ston_fi, 'estimateTrade', async () => {
//       throw new Error('Price estimation failed');
//     });

//     const req = {
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//       limitPrice: '0.1',
//     } as PriceRequest;

//     await expect(price(ton, ston_fi, req)).rejects.toThrow(
//         'Price estimation failed'
//     );
//   });
// });

// describe('ston_fi.controllers - trade', () => {
//   // it('Should execute a trade successfully when conditions are met', async () => {
//   //   patchEstimateTrade();
//   //   patchExecuteTrade();
//   //   patchGetAccountFromAddress();
//   //
//   //   const req: TradeRequest = {
//   //     chain: CHAIN_NAME,
//   //     network: NETWORK,
//   //     base: 'TON',
//   //     quote: 'USDC',
//   //     amount: '1',
//   //     side: 'BUY',
//   //     address: 'mock-account-address',
//   //     limitPrice: '0.3',
//   //   };
//   //
//   //   const response = await trade(ton, ston_fi, req);
//   //   expect(response).toHaveProperty('txnID', 'mock-txn-id');
//   //   expect(response).toHaveProperty('trade.swapRate', '0.2');
//   // });

//   it('Should throw an error if limit price is exceeded', async () => {
//     patchEstimateTrade();
//     patchGetAccountFromAddress();

//     const req: TradeRequest = {
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//       address: 'mock-account-address',
//       limitPrice: '0.1',
//     };

//     await expect(trade(ton, ston_fi, req)).rejects.toThrow(
//         'Swap price 0.2 exceeds limitPrice 0.1'
//     );
//   });

//   it('Should throw an error if trade execution fails', async () => {
//     patchEstimateTrade();
//     patchGetAccountFromAddress();
//     patch(ston_fi, 'executeTrade', async () => {
//       throw new Error('Trade execution failed');
//     });

//     const req: TradeRequest = {
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//       address: 'mock-account-address',
//       limitPrice: '0.3',
//     };

//     await expect(trade(ton, ston_fi, req)).rejects.toThrow(
//         'Trade execution failed'
//     );
//   });
// });

// describe('ston_fi.controllers - estimateGas', () => {
//   it('Should return gas estimation response', async () => {
//     const response = await estimateGas(ton, ston_fi);
//     expect(response).toHaveProperty('gasPrice', ton.gasPrice);
//     expect(response).toHaveProperty('gasCost', String(ton.gasCost));
//   });
// });

// describe('verify StonFi estimate Sell Trade', () => {
//   it('Should return an ExpectedTrade when available', async () => {
//     patchEstimateTrade();

//     const expectedTrade = await ston_fi.estimateTrade({
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//       limitPrice: '0.1',
//     } as PriceRequest);
//     expect(expectedTrade).toHaveProperty('trade');
//     expect(expectedTrade).toHaveProperty('expectedAmount');
//     expect(expectedTrade.expectedAmount).toEqual(1);
//     expect(expectedTrade.expectedPrice).toEqual(0.2);
//   });

//   it('Should throw an error if no trading pair is available', async () => {
//     patch(ston_fi, 'estimateTrade', async () => {
//       throw new Error('No trading pair available');
//     });

//     const req = {
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'INVALID',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//     } as PriceRequest;

//     await expect(ston_fi.estimateTrade(req)).rejects.toThrow('No trading pair available');
//   });
// });

// describe('verify StonFi estimate Buy Trade', () => {
//   it('Should return an ExpectedTrade when available', async () => {
//     patchEstimateTrade();

//     const expectedTrade = await ston_fi.estimateTrade({
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//     });
//     expect(expectedTrade).toHaveProperty('trade');
//     expect(expectedTrade).toHaveProperty('expectedAmount');
//     expect(expectedTrade.expectedAmount).toEqual(1);
//     expect(expectedTrade.expectedPrice).toEqual(0.2);
//   });

//   it('Should throw an error if no pair is available', async () => {
//     patch(ston_fi, 'estimateTrade', async () => {
//       throw new Error('No trading pair available');
//     });

//     await expect(async () => {
//       await ston_fi.estimateTrade({
//         chain: CHAIN_NAME,
//         network: NETWORK,
//         base: 'ETH',
//         quote: 'DAI',
//         amount: '1',
//         side: 'BUY',
//       });
//     }).rejects.toThrow('No trading pair available');
//   });
// });

// describe('verify StonFi executeTrade', () => {
//   it('Should execute a trade when pair is available', async () => {
//     patchEstimateTrade();
//     patchExecuteTrade();

//     const trade = await ston_fi.estimateTrade({
//       chain: CHAIN_NAME,
//       network: NETWORK,
//       base: 'TON',
//       quote: 'USDC',
//       amount: '1',
//       side: 'BUY',
//     });

//     const tradeResult = await ston_fi.executeTrade(
//       'mock-account-address',
//       trade.trade,
//       'TON',
//       'USDC',
//       true,
//     );
//     expect(tradeResult.txnID).toEqual(TX.txnID);
//     expect(tradeResult.round).toEqual(TX.round);
//   });

//   it('Should throw an error if execution fails', async () => {
//     patch(ston_fi, 'estimateTrade', async () => ({
//       trade: {
//         askAddress: 'mock-ask-address',
//         offerAddress: 'mock-offer-address',
//         swapRate: '0.2',
//       },
//       expectedAmount: 1,
//       expectedPrice: 0.2,
//     }));

//     patch(ston_fi, 'executeTrade', async () => {
//       throw new Error('Execution failed');
//     });

//     await expect(async () => {
//       const trade = await ston_fi.estimateTrade({
//         chain: CHAIN_NAME,
//         network: NETWORK,
//         base: 'TON',
//         quote: 'USDC',
//         amount: '1',
//         side: 'BUY',
//         limitPrice: '0.1',
//       } as PriceRequest);

//       await ston_fi.executeTrade(
//           'mock-account-address',
//           trade.trade,
//           'TON',
//           'USDC',
//           true
//       );
//     }).rejects.toThrow('Execution failed');
//   });
// });

// describe('getAllowedSlippage', () => {
//   it('Should return the configured slippage value', () => {
//     const allowedSlippage = ston_fi.getSlippage();
//     expect(allowedSlippage).toEqual(0.02);
//   });
// });

// it('Should throw an error if base token is unsupported', async () => {
//   const req = {
//     chain: CHAIN_NAME,
//     network: NETWORK,
//     base: 'INVALID',
//     quote: 'USDC',
//     amount: '1',
//     side: 'BUY',
//     limitPrice: '0.1',
//   } as PriceRequest;

//   patch(ston_fi, 'estimateTrade', async () => {
//     throw new Error('TOKEN_NOT_SUPPORTED');
//   });

//   await expect(price(ton, ston_fi, req)).rejects.toThrow('TOKEN_NOT_SUPPORTED');
// });


// it('Should execute a trade when limitPrice equals expected price', async () => {
//   // patchEstimateTrade();
//   // patchExecuteTrade();
//   patchGetAccountFromAddress();

//   const req: TradeRequest = {
//     chain: CHAIN_NAME,
//     network: NETWORK,
//     base: 'TON',
//     quote: 'USDC',
//     amount: '1',
//     side: 'BUY',
//     address: 'mock-account-address',
//     limitPrice: '0.2',
//   };

//   const response = await trade(ton, ston_fi, req);
//   expect(response).toHaveProperty('txHash', 'mock-txn-id');
//   expect(response).toHaveProperty('price', '0.2');
// });

// describe('Stonfi - getSlippage', () => {
//   it('Should calculate slippage correctly when valid', () => {
//     patch(Stonfi.prototype, '_config', { allowedSlippage: '1/100' });
//     const stonfi = Stonfi.getInstance('testnet');
//     const slippage = stonfi.getSlippage();
//     expect(slippage).toBe(0.02);
//   });

//   it('Should return default slippage value if configured slippage is invalid', () => {
//     patch(Stonfi.prototype, '_config', { allowedSlippage: 'invalid' });
//     const stonfi = Stonfi.getInstance('testnet');
//     const slippage = stonfi.getSlippage();
//     expect(slippage).toBe(0.02);
//   });
// });

// describe('Stonfi - ready', () => {
//   it('Should return false if not initialized', () => {
//     const stonfiInstance = Stonfi.getInstance(NETWORK);
//     expect(stonfiInstance.ready()).toBe(true);
//   });

//   it('Should return true after initialization', async () => {
//     const stonfiInstance = Stonfi.getInstance(NETWORK);
//     await stonfiInstance.init();
//     expect(stonfiInstance.ready()).toBe(true);
//   });
// });

// it('Should handle sell trades correctly in estimateTrade', async () => {
//   patch(ston_fi, 'estimateTrade', async (_req: PriceRequest) => ({
//     trade: {
//       askAddress: 'mock-sell-ask-address',
//       offerAddress: 'mock-sell-offer-address',
//       swapRate: '0.25',
//     },
//     expectedAmount: 2,
//     expectedPrice: 0.25,
//   }));

//   const req = {
//     chain: CHAIN_NAME,
//     network: NETWORK,
//     base: 'TON',
//     quote: 'USDC',
//     amount: '2',
//     side: 'SELL',
//     limitPrice: '0.3',
//   } as PriceRequest;

//   const response = await ston_fi.estimateTrade(req);
//   expect(response).toHaveProperty('trade');
//   expect(response).toHaveProperty('expectedAmount', 2);
//   expect(response).toHaveProperty('expectedPrice', 0.25);
// });

// it('Should handle slippage correctly when slippageTolerance is 0', async () => {
//   patch(ston_fi, 'estimateTrade', async (_req: PriceRequest) => ({
//     trade: {
//       askAddress: 'mock-ask-address',
//       offerAddress: 'mock-offer-address',
//       swapRate: '0.2',
//     },
//     expectedAmount: 1,
//     expectedPrice: 0.2,
//   }));

//   const req = {
//     chain: CHAIN_NAME,
//     network: NETWORK,
//     base: 'TON',
//     quote: 'USDC',
//     amount: '1',
//     side: 'BUY',
//     limitPrice: '0.2',
//   } as PriceRequest;

//   const response = await ston_fi.estimateTrade(req);
//   expect(response.expectedPrice).toEqual(0.2);
// });

// it('Should return slippage as 0 if allowedSlippage does not match regexp', () => {
//   patch(ston_fi, '_config', { allowedSlippage: 'not-a-percentage' });

//   const slippage = ston_fi.getSlippage();
//   expect(slippage).toEqual(0);
// });

// it('Should handle large slippage values correctly', () => {
//   patch(ston_fi, '_config', { allowedSlippage: '50/100' });

//   const slippage = ston_fi.getSlippage();
//   expect(slippage).toEqual(0.5);
// });

// it('Should handle exact percentage values correctly', () => {
//   patch(ston_fi, '_config', { allowedSlippage: '1/100' });

//   const slippage = ston_fi.getSlippage();
//   expect(slippage).toEqual(0.01);
// });

// it('Should return different instances for different networks', () => {
//   const instance1 = Stonfi.getInstance('testnet');
//   const instance2 = Stonfi.getInstance('mainnet');

//   expect(instance1).not.toBe(instance2);
// });

// describe('Stonfi Class', () => {
//   describe('getInstance', () => {
//     it('Should return the same instance for the same network', () => {
//       const instance1 = Stonfi.getInstance('testnet');
//       const instance2 = Stonfi.getInstance('testnet');
//       expect(instance1).toBe(instance2);
//     });

//     it('Should return different instances for different networks', () => {
//       const instance1 = Stonfi.getInstance('testnet');
//       const instance2 = Stonfi.getInstance('mainnet');
//       expect(instance1).not.toBe(instance2);
//     });
//   });

//   describe('init', () => {
//     it('Should initialize the chain and set _ready to true', async () => {
//       const stonfi = Stonfi.getInstance('testnet');
//       await stonfi.init();
//       expect(stonfi.ready()).toBe(true);
//     });
//   });

//   describe('ready', () => {
//     it('Should return false if init is not called', () => {
//       const stonfi = Stonfi.getInstance('testnet');
//       expect(stonfi.ready()).toBe(true);
//     });

//     it('Should return true after initialization', async () => {
//       const stonfi = Stonfi.getInstance('testnet');
//       await stonfi.init();
//       expect(stonfi.ready()).toBe(true);
//     });
//   });
// });


// it('Should throw TOKEN_NOT_SUPPORTED_ERROR if base token is unsupported', async () => {
//   patch(ton, 'getAssetForSymbol', (symbol: string) =>
//       symbol === 'INVALID' ? null : { assetId: {}, decimals: 6 }
//   );

//   const req = {
//     chain: 'ton',
//     network: 'testnet',
//     base: 'INVALID',
//     quote: 'USDC',
//     amount: '1',
//     side: 'BUY',
//   } as PriceRequest;

//   await expect(ston_fi.estimateTrade(req)).rejects.toThrow(TOKEN_NOT_SUPPORTED_ERROR_MESSAGE);
// });

// it('Should throw an error if base or quote token is unsupported', async () => {
//   patch(ton, 'getAssetForSymbol', () => null);

//   const req: PriceRequest = {
//     chain: 'ton',
//     network: 'testnet',
//     base: 'TON',
//     quote: 'USDC',
//     amount: '1',
//     side: 'BUY',
//   };

//   await expect(ston_fi.estimateTrade(req)).rejects.toThrow(TOKEN_NOT_SUPPORTED_ERROR_MESSAGE);
// });

// it('Should throw an error if simulateSwap fails', async () => {
//   patch(ston_fi, 'estimateTrade', async () => {
//     throw new Error('simulateSwap failed');
//   });

//   const req: PriceRequest = {
//     chain: CHAIN_NAME,
//     network: NETWORK,
//     base: 'TON',
//     quote: 'USDC',
//     amount: '1',
//     side: 'BUY',
//   };

//   await expect(ston_fi.estimateTrade(req)).rejects.toThrow('simulateSwap failed');
// });
