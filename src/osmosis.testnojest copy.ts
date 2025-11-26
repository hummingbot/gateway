// import * as fs from 'fs';
// import * as fsog from 'fs/promises';
// import * as fs2 from 'fs/promises';
// import * as https from 'https';
// import * as path from 'path';
// import * as pathog from 'path';

// import { Type, Static } from '@sinclair/typebox';
// import axios from 'axios';
// import Decimal from 'decimal.js-light';
// import Fastify, { FastifyInstance } from 'fastify';

// // AMM routes
// import { addLiquidityAMM } from './connectors/osmosis/amm-routes/addLiquidity';
// import { osmosisPoolInfo as poolInfoAMM } from './connectors/osmosis/amm-routes/poolInfo';
// import { osmosisPoolPositionInfo as positionInfoAMM } from './connectors/osmosis/amm-routes/positionInfo';
// import { positionsOwned as positionsOwnedAMM } from './connectors/osmosis/amm-routes/positionsOwned';
// import { removeLiquidityAMM } from './connectors/osmosis/amm-routes/removeLiquidity';
// import { osmosisFetchPools } from './connectors/osmosis/amm-routes/fetchPools';

// // AMM/CLMM (and maybe router)
// import { osmosisExecuteSwap, osmosisQuoteSwap } from './connectors/osmosis/osmosis.swap';

// // CLMM routes
// import { addLiquidityCLMM } from './connectors/osmosis/clmm-routes/addLiquidity';
// import { osmosisClosePositionCLMM as closePositionCLMM } from './connectors/osmosis/clmm-routes/closePosition';
// import { osmosisPoolInfo as poolInfoCLMM } from './connectors/osmosis/clmm-routes/poolInfo';
// import { osmosisPoolPositionInfo as positionInfoCLMM } from './connectors/osmosis/clmm-routes/positionInfo';
// import { positionsOwned as positonsOwnedCLMM } from './connectors/osmosis/clmm-routes/positionsOwned';
// import { removeLiquidityCLMM } from './connectors/osmosis/clmm-routes/removeLiquidity';

// // import { configRoutes } from '../../../src/config/config.routes';

// type method = 'GET' | 'POST';
// const certPath = '/home/chase/pecu/hummingbot/certs';
// // const httpsAgent = axios.create({
// //   httpsAgent: new https.Agent({
// //     ca: fs.readFileSync(certPath.concat('/ca_cert.pem'), {
// //       encoding: 'utf-8',
// //     }),
// //     cert: fs.readFileSync(certPath.concat('/client_cert.pem'), {
// //       encoding: 'utf-8',
// //     }),
// //     key: fs.readFileSync(certPath.concat('/client_key.pem'), {
// //       encoding: 'utf-8',
// //     }),
// //     host: '127.0.0.1',
// //     port: 15888,
// //     requestCert: true,
// //     rejectUnauthorized: false,
// //   }),
// // });
// // const request = async (
// //   method: method,
// //   path: string,
// //   params: Record<string, any>
// // ) => {
// //   try { await new Promise(resolve => setTimeout(resolve, 5000));
// //     let response;
// //     const gatewayAddress = 'https://127.0.0.1:15888';
// //     if (method === 'GET') {
// //       response = await httpsAgent.get(gatewayAddress + path);
// //     } else {
// //       response = await httpsAgent.post(gatewayAddress + path, params);
// //     }
// //     return response.data;
// //   } catch (err) {
// //     console.log(`${method} ${path} - ${err}`);
// //   }
// // };

// // import { osmosis } from '../../../src/chains/osmosis/osmosis';
// // import { Side } from '../../../src/amm/liquidity/amm.requests';

// // import { price, trade, addLiquidity, removeLiquidity, poolPrice, poolPosition, transfer, getTokens, } from '../../../src/chains/osmosis/osmosis.controllers'; //getTradeInfo, price
// import {
//   PoolInfo as AMMPoolInfo,
//   GetPoolInfoRequestType as AMMGetPoolInfoRequestType,
//   PositionInfo as AMMPositionInfo,
//   GetPositionInfoRequestType as AMMGetPositionInfoRequestType,
//   AddLiquidityRequestType as AMMAddLiquidityRequestType,
//   AddLiquidityResponseType as AMMAddLiquidityResponseType,
//   RemoveLiquidityRequestType as AMMRemoveLiquidityRequestType,
//   RemoveLiquidityResponseType as AMMRemoveLiquidityResponseType,
//   PositionInfoSchema as AMMPositionInfoSchema,
// } from './schemas/amm-schema';
// import {
//   CollectFeesRequestType as CLMMCollectFeesRequestType,
//   CollectFeesResponseType as CLMMCollectFeesResponseType,
//   OpenPositionRequestType as CLMMOpenPositionRequestType,
//   OpenPositionResponseType as CLMMOpenPositionResponseType,
//   ClosePositionRequestType as CLMMClosePositionRequestType,
//   ClosePositionResponseType as CLMMClosePositionResponseType,
//   PoolInfo as CLMMPoolInfo,
//   GetPoolInfoRequestType as CLMMGetPoolInfoRequestType,
//   PositionInfo as CLMMPositionInfo,
//   GetPositionInfoRequestType as CLMMGetPositionInfoRequestType,
//   AddLiquidityRequestType as CLMMAddLiquidityRequestType,
//   AddLiquidityResponseType as CLMMAddLiquidityResponseType,
//   RemoveLiquidityRequestType as CLMMRemoveLiquidityRequestType,
//   RemoveLiquidityResponseType as CLMMRemoveLiquidityResponseType,
//   PositionInfoSchema as CLMMPositionInfoSchema,
//   GetPositionInfoRequest as CLMMGetPositionInfoRequest,
//   FetchPoolsRequestType,
//   QuotePositionRequestType,
//   QuotePositionResponseType,
// } from './schemas/clmm-schema';

// const PositionsOwnedRequest = Type.Object({
//   network: Type.Optional(Type.String({ examples: ['mainnet'], default: 'mainnet' })),
//   walletAddress: Type.String({ examples: ['<osmosis wallet address>'] }),
//   poolType: Type.Optional(Type.String({ examples: ['clmm', 'amm'], default: 'clmm' })),
// });
// type PositionsOwnedRequestType = Static<typeof PositionsOwnedRequest>;
// const AMMAllPositionsOwnedResponse = Type.Array(AMMPositionInfoSchema);
// const CLMMAllPositionsOwnedResponse = Type.Array(CLMMPositionInfoSchema);
// type AMMAllPositionsOwnedResponseType = Static<typeof AMMAllPositionsOwnedResponse>;
// type CLMMAllPositionsOwnedResponseType = Static<typeof CLMMAllPositionsOwnedResponse>;

// import { Osmosis } from './connectors/osmosis/osmosis';
// import { SerializableExtendedPool } from './connectors/osmosis/osmosis.types';
// import {
//   TokensRequestType,
//   TokensResponseType,
//   TokensRequestSchema,
//   TokensResponseSchema,
// } from './schemas/chain-schema';
// import { addWallet, getWallets } from './wallet/utils';
// import { getOsmosisBalances } from './connectors/osmosis/chain-routes/balances';
// // import { poll } from './connectors/osmosis/chain-routes/poll';
// // import { getStatus } from './connectors/osmosis/chain-routes/status';

// const CHAIN = 'osmosis';
// const CONNECTOR = 'osmosis';
// const NETWORK = 'testnet';
// const BASE_TOKEN = 'OSMO';
// const QUOTE_TOKEN = 'ION';
// const TEST_WALLET = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
// const TEST_WALLET_PRIVATE_KEY = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5';
// const TEST_OUTBOUND_ADDRESS = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7';
// const TEST_POOL = '62';
// const TEST_POOL_ADDRESS_AMM = 'osmo17svzplxq3dmkz0atv6vtepftvtfl5daxuajtzxjwchnyjumupg5q649708';

// const mockDir = path.join(__dirname, '..', 'test', 'connectors', 'osmosis', 'mocks');

// // Helper to load mock responses
// async function loadMockResponse(filename) {
//   try {
//     await new Promise((resolve) => setTimeout(resolve, 5000));
//     // First try to find connector-specific mock
//     const filePath = path.join(mockDir, `${filename}.json`);
//     return JSON.parse(fs.readFileSync(filePath, 'utf8'));
//   } catch (error) {
//     // If not found, use generic mock template
//     const templatePath = path.join(__dirname, '..', 'test', 'connectors', 'osmosis', 'mocks', `${filename}.json`);
//     return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
//   }
// }

// async function writeMockResponse(filename: string, instance: object) {
//   try {
//     await new Promise((resolve) => setTimeout(resolve, 5000));
//     const filePath = path.join(__dirname, '..', 'test', 'connectors', 'osmosis', 'mocks', `${filename}.json`);
//     console.log(filePath);
//     const json = JSON.stringify(instance, null, 2);
//     // console.log(json);

//     await fs2.mkdir(mockDir, { recursive: true }); // Creates the directory if it doesn't exist
//     await fs2.writeFile(filePath, json, 'utf-8');
//   } catch (error) {
//     console.log(error);
//   }
// }

// async function testnojest() {
//   const osmosis: Osmosis = Osmosis.getInstance(NETWORK);
//   await osmosis.init();

//   const fastify = Fastify();

//   // await fastify.register(configRoutes);

//   // // DISABLED ENDPOINTS
//   // try { await new Promise(resolve => setTimeout(resolve, 5000));
//   //   console.debug('allowances');
//   //   var allowances_obj = {'address':TEST_WALLET, 'spender':TEST_OUTBOUND_ADDRESS, 'tokenSymbols':[], 'chain':'osmosis', 'network':NETWORK};
//   //   var allowances = await osmosis.CosmosBase.allowances(osmosis, allowances_obj);
//   //   writeMockResponse('allowances-in', allowances_obj)
//   //   console.debug(allowances);
//   // } catch (err) {
//   //   console.debug(err);
//   // }
//   // try { await new Promise(resolve => setTimeout(resolve, 5000));
//   //   console.debug('cancel');
//   //   var cancel_obj = {'address':TEST_WALLET, 'nonce':0, 'chain':'osmosis', 'network':NETWORK};
//   //   var cancel = await osmosis.controller.cancel(osmosis, cancel_obj);
//   //   writeMockResponse('cancel-in', cancel_obj)
//   //   console.debug(cancel);
//   // } catch (err) {
//   //   console.debug(err);
//   // }
//   // try { await new Promise(resolve => setTimeout(resolve, 5000));
//   //   console.debug('approve');
//   //   var approve_obj = {'nonce':0, 'address':TEST_WALLET, 'spender':TEST_OUTBOUND_ADDRESS, token:'OSMO', 'chain':'osmosis', 'network':NETWORK};
//   //   var approve = await osmosis.controller.approve(osmosis, approve_obj);
//   //   writeMockResponse('approve-in', approve_obj)
//   //   console.debug(approve);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // TESTED ENDPOINTS

//   // console.debug('Osmosis Chain Routes');
//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   const wal = { privateKey: TEST_WALLET_PRIVATE_KEY, chain: 'cosmos' };
//   //   const request = await addWallet(fastify, wal);
//   //   const wallets = await getWallets(fastify);

//   //   const addresses: string[][] = wallets
//   //     .filter((wallet) => wallet.chain === 'cosmos')
//   //     .map((wallet) => wallet.walletAddresses);
//   //   writeMockResponse('addWallet-in', wal);
//   //   writeMockResponse('addWallet-out', addresses);
//   //   console.debug(addresses);

//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('transfer');
//   //   const transfer_in = {
//   //     from: TEST_WALLET,
//   //     to: TEST_OUTBOUND_ADDRESS,
//   //     token: 'OSMO',
//   //     amount: '0.00001',
//   //     chains: 'cosmos',
//   //     network: NETWORK,
//   //   };
//   //   writeMockResponse('transfer-in', transfer_in);
//   //   const transfer = await osmosis.controller.transfer(osmosis, transfer_in);
//   //   writeMockResponse('transfer-out', transfer);
//   //   console.debug(transfer);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTokens OSMO');
//   //   var tokensRequest: TokensRequestType = { network: 'osmosis', tokenSymbols: ['OSMO'] };
//   //   writeMockResponse('getTokens-OSMO-in', tokensRequest);
//   //   var getTokens: TokensResponseType = await osmosis.controller.getTokens(osmosis, tokensRequest);
//   //   writeMockResponse('getTokens-OSMO-out', getTokens);
//   //   console.debug(getTokens);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTokens All');
//   //   var tokensRequest: TokensRequestType = { network: 'osmosis', tokenSymbols: [] };
//   //   writeMockResponse('getTokens-all-in', tokensRequest);
//   //   var getTokens: TokensResponseType = await osmosis.controller.getTokens(osmosis, tokensRequest);
//   //   writeMockResponse('getTokens-all-out', getTokens);
//   //   console.debug(getTokens);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('estimateGas');
//   //   const estimateGas = await osmosis.controller.estimateGas(osmosis);
//   //   console.debug(estimateGas);
//   //   writeMockResponse('estimateGas-out', estimateGas);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('status');
//   //   const status = await getStatus(NETWORK);
//   //   console.debug(status);
//   //   writeMockResponse('status-out', status);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('poll');
//   //   const poll_signature = "344A0C038C05D1FA938E78828925109879E30C397100BD84D0BA08A463B2FF82";
//   //   const poll_return = await osmosis.controller.poll(osmosis, poll_signature);
//   //   console.debug(poll_return);
//   //   writeMockResponse('poll-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-out', poll_return);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // var response_list = [];
//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx AddLiqudity CL success');
//   //   const poll_signature = "BE289923881712E3DD4BC36A7A216DACF67E179555EFCB232839F8FE9E468403";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-AddLiquidity-CLMM-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-AddLiquidity-CLMM-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx AddLiqudity GAMM success');
//   //   const poll_signature = "344A0C038C05D1FA938E78828925109879E30C397100BD84D0BA08A463B2FF82";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-AddLiquidity-GAMM-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-AddLiquidity-GAMM-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx RemoveLiquidity CLMM success');
//   //   const poll_signature = "F6B158C9C0E61CFB4C96E620EB4F4BC53C1A64D1E1FD5810A8EE8978F27242BE";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-RemoveLiquidity-CLMM-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-RemoveLiquidity-CLMM-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx RemoveLiquidity GAMM all success');
//   //   const poll_signature = "902CD46D3EB876EEB722D954A5AB77887618C2F396864F6851A126561DF7E1D1";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-RemoveLiquidity-GAMM-all-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-RemoveLiquidity-GAMM-all-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx RemoveLiquidity GAMM partial success');
//   //   const poll_signature = "C28B2C266522BD0680DEA17CA81383196C3EF87D5B3E5BB7BF2D8B9CE00BD854";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-RemoveLiquidity-GAMM-partial-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-RemoveLiquidity-GAMM-partial-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx closePosition CLMM success');
//   //   const poll_signature = "F39C951A894D511B94721923560D644B9C5038231224402C0A7341EA71E04CD6";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-closePosition-CLMM-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-closePosition-CLMM-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx executeSwap GAMM success');
//   //   const poll_signature = "CDA1F1D32E3371BD9F191D287AD70BA5FDCEED7DF1AFB0AF8AE3F0DE99D43774";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-executeSwap-GAMM-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-executeSwap-GAMM-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx openPosition CLMM success');
//   //   const poll_signature = "CA53D19A19F4B6F7E9A97CDCEE0E45F165DAF4BDE54BA16016663BA4856760B3";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-openPosition-CLMM-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-openPosition-CLMM-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('getTx transfer success');
//   //   const poll_signature = "426D2164B9494B9EFA4AE6B30F915D9B7BDEB4062C1C89D4C80372498D38D159";
//   //   const response = await osmosis.controller.poll(osmosis, {signature: poll_signature, walletAddress:TEST_WALLET});
//   //   //console.debug(response);
//   //   response_list.push(response);
//   //   writeMockResponse('poll-transfer-success-in', poll_signature as unknown as object);
//   //   writeMockResponse('poll-transfer-success-out', response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('block');
//   //   const block = await osmosis.getCurrentBlockNumber();
//   //   console.debug(block);
//   //   writeMockResponse('block-out', block as unknown as object);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('balances OSMO');
//   //   const balances = await osmosis.controller.balances(osmosis, { address: TEST_WALLET, tokenSymbols: ['OSMO'] });
//   //   const b2 = await getOsmosisBalances(fastify, NETWORK, TEST_WALLET, []);
//   //   console.debug(b2);
//   //   console.debug(balances);
//   //   writeMockResponse('balances-OSMO-out', b2);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('wallet balances All');
//   //   const walleto = await osmosis.getWalletFromPrivateKey(TEST_WALLET_PRIVATE_KEY, 'osmo');
//   //   writeMockResponse('wallet-balances-ALL-in', walleto);
//   //   const balanceo = await osmosis.getBalances(walleto);
//   //   writeMockResponse('wallet-balances-ALL-out', balanceo);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('get token');
//   //   const token = osmosis.getTokenBySymbol('ATOM');
//   //   const token2 = osmosis.getTokenForSymbol('OSMO');
//   //   console.debug(token);
//   //   console.debug(token2);
//   //   writeMockResponse('get-token-ATOM-out', token);
//   //   writeMockResponse('get-token-OSMO-out', token2);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('quoteSwap AMM');
//   //   const priceRequest1 = {
//   //     quoteToken: 'ION',
//   //     baseToken: 'OSMO',
//   //     amount: '0.001',
//   //     side: 'BUY',
//   //     slippagePct: '99',
//   //     chains: 'cosmos',
//   //     network: NETWORK,
//   //   };
//   //   const priceResponse1 = await osmosis.controller.quoteSwap(osmosis, fastify, priceRequest1, 'AMM');
//   //   console.debug(priceResponse1);
//   //   writeMockResponse('quoteSwap-GAMM-in', priceRequest1);
//   //   writeMockResponse('quoteSwap-GAMM-out', priceResponse1);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('quoteSwap CLMM');
//   //   const priceRequest1 = {
//   //     quoteToken: 'ION',
//   //     baseToken: 'OSMO',
//   //     amount: '0.001',
//   //     side: 'BUY',
//   //     slippagePct: '99',
//   //     chains: 'cosmos',
//   //     network: NETWORK,
//   //   }
//   //   const priceResponse1 = await osmosis.controller.quoteSwap(osmosis, fastify, priceRequest1, 'clmm');
//   //   console.debug(priceResponse1);
//   //   writeMockResponse('quoteSwap-CLMM-in', priceRequest1);
//   //   writeMockResponse('quoteSwap-CLMM-out', priceResponse1);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('executeSwap AMM Reverse');
//   //   const tradeRequest = {
//   //     baseToken: 'ION',
//   //     quoteToken: 'OSMO',
//   //     amount: '0.0001',
//   //     side: 'BUY',
//   //     slippagePct: '99',
//   //     chains: 'cosmos',
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //   };
//   //   const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'AMM');
//   //   console.debug(tradeResponse);
//   //   writeMockResponse('executeSwap-GAMM-in', tradeRequest);
//   //   writeMockResponse('executeSwap-GAMM-out', tradeResponse);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('executeSwap AMM');
//   //   const tradeRequest = {
//   //     quoteToken: 'ION',
//   //     baseToken: 'OSMO',
//   //     amount: '0.01',
//   //     side: 'BUY',
//   //     slippagePct: '99',
//   //     chains: 'cosmos',
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //   };
//   //   const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'AMM');
//   //   console.debug(tradeResponse);
//   //   writeMockResponse('executeSwap-GAMM-reverse-in', tradeRequest);
//   //   writeMockResponse('executeSwap-GAMM-reverse-out', tradeResponse);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // let gammPoolAddress = TEST_POOL_ADDRESS_AMM;
//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('fetchPools GAMM');
//   //   const request_AMMAddLiquidityRequestType: FetchPoolsRequestType = {
//   //     tokenA: 'ION',
//   //     tokenB: 'OSMO',
//   //   };
//   //   const response_AMMAddLiquidityResponseType: SerializableExtendedPool[] = await osmosis.controller.fetchPoolsForTokens(
//   //     osmosis,
//   //     fastify,
//   //     request_AMMAddLiquidityRequestType,
//   //     'amm',
//   //   );
//   //   gammPoolAddress = response_AMMAddLiquidityResponseType[0].address;
//   //   console.debug(response_AMMAddLiquidityResponseType);
//   //   writeMockResponse('fetchPools-GAMM-in', request_AMMAddLiquidityRequestType);
//   //   writeMockResponse('fetchPools-GAMM-out', response_AMMAddLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('addLiquidity GAMM');
//   //   const request_AMMAddLiquidityRequestType: AMMAddLiquidityRequestType = {
//   //     poolAddress: gammPoolAddress,
//   //     baseTokenAmount: 0.0001,
//   //     quoteTokenAmount: 0,
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     slippagePct: 100,
//   //   };
//   //   const reponse_AMMAddLiquidityResponseType: AMMAddLiquidityResponseType = await osmosis.controller.addLiquidityAMM(
//   //     osmosis,
//   //     fastify,
//   //     request_AMMAddLiquidityRequestType,
//   //   );
//   //   console.debug(reponse_AMMAddLiquidityResponseType);
//   //   writeMockResponse('addLiquidity-GAMM-in', request_AMMAddLiquidityRequestType);
//   //   writeMockResponse('addLiquidity-GAMM-out', reponse_AMMAddLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('AMMGetPositionInfoRequestType by pool address');
//   //   const request_AMMGetPositionInfoRequestType: AMMGetPositionInfoRequestType = {
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     poolAddress: gammPoolAddress,
//   //   };
//   //   var response_AMMGetPositionInfoRequestType: AMMPositionInfo = await osmosis.controller.poolPosition(
//   //     osmosis,
//   //     fastify,
//   //     request_AMMGetPositionInfoRequestType,
//   //     'amm',
//   //   );
//   //   console.debug(response_AMMGetPositionInfoRequestType);
//   //   writeMockResponse('positionInfo-GAMM-by-address-in', request_AMMGetPositionInfoRequestType);
//   //   writeMockResponse('positionInfo-GAMM-by-address-out', response_AMMGetPositionInfoRequestType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('positionsOwned AMM for wallet');
//   //   const request_positionsOwned: PositionsOwnedRequestType  = {
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     poolType: 'amm',
//   //   };
//   //   const response_positionsOwned: AMMAllPositionsOwnedResponseType | CLMMAllPositionsOwnedResponseType = await osmosis.controller.allPoolPositions(
//   //     osmosis,
//   //     fastify,
//   //     TEST_WALLET,
//   //     'amm',
//   //   );
//   //   writeMockResponse('positionsOwned-AMM-in', request_positionsOwned);
//   //   writeMockResponse('positionsOwned-AMM-out', response_positionsOwned);
//   //   gammPoolAddress = response_positionsOwned[0].poolAddress;
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('AMMRemoveLiquidityRequestType GAMM');
//   //   const request_AMMRemoveLiquidityRequestType: AMMRemoveLiquidityRequestType = {
//   //     percentageToRemove: 20,
//   //     poolAddress: gammPoolAddress,
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //   };
//   //   const response_AMMRemoveLiquidityResponseType: AMMRemoveLiquidityResponseType =
//   //     await osmosis.controller.removeLiquidityAMM(osmosis, fastify, request_AMMRemoveLiquidityRequestType);
//   //   console.debug(response_AMMRemoveLiquidityResponseType);
//   //   writeMockResponse('removeLiquidity-GAMM-partial-in', request_AMMRemoveLiquidityRequestType);
//   //   writeMockResponse('removeLiquidity-GAMM-partial-out', response_AMMRemoveLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('AMMRemoveLiquidityRequestType GAMM');
//   //   const request_AMMRemoveLiquidityRequestType: AMMRemoveLiquidityRequestType = {
//   //     percentageToRemove: 100,
//   //     poolAddress: gammPoolAddress,
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //   };
//   //   const response_AMMRemoveLiquidityResponseType: AMMRemoveLiquidityResponseType =
//   //     await osmosis.controller.removeLiquidityAMM(osmosis, fastify, request_AMMRemoveLiquidityRequestType);
//   //   console.debug(response_AMMRemoveLiquidityResponseType);
//   //   writeMockResponse('removeLiquidity-GAMM-all-in', request_AMMRemoveLiquidityRequestType);
//   //   writeMockResponse('removeLiquidity-GAMM-all-out', response_AMMRemoveLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('AMMGetPoolInfoRequestType by pool address');
//   //   const request_AMMGetPoolInfoRequestType: AMMGetPoolInfoRequestType = {
//   //     network: NETWORK,
//   //     poolAddress: gammPoolAddress,
//   //   };
//   //   var response_AMMPoolInfo: AMMPoolInfo = await osmosis.controller.poolInfoRequest(
//   //     osmosis,
//   //     fastify,
//   //     request_AMMGetPoolInfoRequestType,
//   //     'amm',
//   //   );
//   //   console.debug(response_AMMPoolInfo);
//   //   writeMockResponse('poolInf-GAMM-by-address-in', request_AMMGetPoolInfoRequestType);
//   //   // writeMockResponse('poolInf-GAMM-address', response_AMMPoolInfo.address as unknown as object);
//   //   writeMockResponse('poolInf-GAMM-by-address-out', response_AMMPoolInfo);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // let clmmPositionAddress = '3486'; //'3479'; //2836 2837 2843
//   // let clmmPoolAddress = 'osmo1rdm79d008fel4ppkgdcf8pgjwazf72sjfhpyx5kpzlck86slpjusek2en6';
//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('fetchPools CLMM');
//   //   const request_CLMMAddLiquidityRequestType: FetchPoolsRequestType = {
//   //     tokenA: 'ION',
//   //     tokenB: 'OSMO',
//   //   };
//   //   const response_CLMMAddLiquidityResponseType: SerializableExtendedPool[] = await osmosis.controller.fetchPoolsForTokens(
//   //     osmosis,
//   //     fastify,
//   //     request_CLMMAddLiquidityRequestType,
//   //     'clmm',
//   //   );
//   //   clmmPoolAddress = response_CLMMAddLiquidityResponseType[0].address;
//   //   console.debug(response_CLMMAddLiquidityResponseType);
//   //   writeMockResponse('fetchPools-CLMM-in', request_CLMMAddLiquidityRequestType);
//   //   writeMockResponse('fetchPools-CLMM-out', response_CLMMAddLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMM Quote Position Stub');
//   //   const quotePosition_request: QuotePositionRequestType = {
//   //     poolAddress: clmmPoolAddress,
//   //     lowerPrice: 200,
//   //     upperPrice: 1000,
//   //     baseTokenAmount: 0.0002,
//   //     quoteTokenAmount: 0.1,
//   //     network: NETWORK,
//   //     slippagePct: 99,
//   //   };
//   //   const quotePositon_response: QuotePositionResponseType = await osmosis.QuotePositionCLMM(
//   //     quotePosition_request,
//   //   );
//   //   console.debug(quotePositon_response);
//   //   console.debug(clmmPositionAddress);
//   //   writeMockResponse('quotePosition-CLMM-in', quotePosition_request);
//   //   writeMockResponse('quotePosition-CLMM-out', quotePositon_response);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMM Open Position by clmmPoolAddress: CLMMOpenPositionRequestType CLMMOpenPositionResponseType');
//   //   const addLiquidityRequestFunction: CLMMOpenPositionRequestType = {
//   //     lowerPrice: 200,
//   //     upperPrice: 1000,
//   //     poolAddress: clmmPoolAddress,
//   //     baseTokenAmount: 0.0002,
//   //     quoteTokenAmount: 0.1,
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     slippagePct: 100, // very unbalanced, only accepting ION
//   //   };
//   //   const addLiquidityResponseCLMM: CLMMOpenPositionResponseType = await osmosis.controller.openPositionCLMM(
//   //     osmosis,
//   //     fastify,
//   //     addLiquidityRequestFunction,
//   //   );
//   //   clmmPositionAddress = addLiquidityResponseCLMM.data.positionAddress;
//   //   console.debug(addLiquidityResponseCLMM);
//   //   console.debug(clmmPositionAddress);
//   //   writeMockResponse('openPosition-CLMM-in', addLiquidityRequestFunction);
//   //   // writeMockResponse('openPosition-CLMM-positionAddress', clmmPositionAddress as unknown as object);
//   //   writeMockResponse('openPosition-CLMM-out', addLiquidityResponseCLMM);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('positionsOwned CLMM for wallet');
//   //   const request_positionsOwned: PositionsOwnedRequestType  = {
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     poolType: 'clmm',
//   //   };
//   //   const response_positionsOwned: AMMAllPositionsOwnedResponseType | CLMMAllPositionsOwnedResponseType = await osmosis.controller.allPoolPositions(
//   //     osmosis,
//   //     fastify,
//   //     TEST_WALLET,
//   //     'clmm',
//   //   );
//   //   writeMockResponse('positionsOwned-CLMM-in', request_positionsOwned);
//   //   writeMockResponse('positionsOwned-CLMM-out', response_positionsOwned);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMMAddLiquidityRequestType CLMMAddLiquidityResponseType');
//   //   const request_CLMMAddLiquidityRequestType: CLMMAddLiquidityRequestType = {
//   //     positionAddress: clmmPositionAddress,
//   //     baseTokenAmount: 0.0002,
//   //     quoteTokenAmount: 0.1,
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     slippagePct: 100,
//   //   };
//   //   const response_CLMMAddLiquidityResponseType: CLMMAddLiquidityResponseType =
//   //     await osmosis.controller.addLiquidityCLMM(osmosis, fastify, request_CLMMAddLiquidityRequestType);
//   //   clmmPositionAddress = response_CLMMAddLiquidityResponseType.data.newPositionAddress;
//   //   console.debug(response_CLMMAddLiquidityResponseType);
//   //   console.debug(clmmPositionAddress);
//   //   writeMockResponse('addLiquidity-CLMM-in', request_CLMMAddLiquidityRequestType);
//   //   // writeMockResponse('addLiquidity-CLMM-address', clmmPositionAddress as unknown as object);
//   //   writeMockResponse('addLiquidity-CLMM-out', response_CLMMAddLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMMRemoveLiquidityRequestType CLMMRemoveLiquidityResponseType');
//   //   const request_CLMMRemoveLiquidityRequestType: CLMMRemoveLiquidityRequestType = {
//   //     positionAddress: clmmPositionAddress,
//   //     percentageToRemove: 50,
//   //     walletAddress: TEST_WALLET,
//   //   };
//   //   const response_CLMMRemoveLiquidityResponseType: CLMMRemoveLiquidityResponseType =
//   //     await osmosis.controller.removeLiquidityCLMM(osmosis, fastify, request_CLMMRemoveLiquidityRequestType);
//   //   console.debug(response_CLMMRemoveLiquidityResponseType);
//   //   console.debug(clmmPositionAddress);
//   //   writeMockResponse('removeLiquidity-CLMM-in', request_CLMMRemoveLiquidityRequestType);
//   //   writeMockResponse('removeLiquidity-CLMM-out', response_CLMMRemoveLiquidityResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMMGetPositionInfoRequestType by CLMMPositionAddress');
//   //   const request_CLMMGetPositionInfoRequestType: CLMMGetPositionInfoRequestType = {
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     positionAddress: clmmPositionAddress,
//   //   };
//   //   const response_CLMMPositionInfo: CLMMPositionInfo = await osmosis.controller.poolPosition(
//   //     osmosis,
//   //     fastify,
//   //     request_CLMMGetPositionInfoRequestType,
//   //     'clmm',
//   //   );
//   //   console.debug(response_CLMMPositionInfo);
//   //   console.debug(clmmPositionAddress);
//   //   writeMockResponse('poolPosition-CLMM-in', request_CLMMGetPositionInfoRequestType);
//   //   // writeMockResponse('poolPosition-CLMM-address', clmmPositionAddress as unknown as object);
//   //   writeMockResponse('poolPosition-CLMM-out', response_CLMMPositionInfo);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMMClosePositionRequestType CLMMClosePositionResponseType');
//   //   const request_CLMMClosePositionRequestType: CLMMClosePositionRequestType = {
//   //     network: NETWORK,
//   //     walletAddress: TEST_WALLET,
//   //     positionAddress: clmmPositionAddress,
//   //   };
//   //   const response_CLMMClosePositionResponseType: CLMMClosePositionResponseType =
//   //     await osmosis.controller.closePositionCLMM(osmosis, fastify, request_CLMMClosePositionRequestType); // just collectRewards and removeLiq with 100%
//   //   console.debug(response_CLMMClosePositionResponseType);
//   //   writeMockResponse('closePosition-CLMM-in', request_CLMMClosePositionRequestType);
//   //   writeMockResponse('closePosition-CLMM-out', response_CLMMClosePositionResponseType);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   // try {
//   //   await new Promise((resolve) => setTimeout(resolve, 5000));
//   //   console.debug('CLMMGetPoolInfoRequestType by poolAddress');
//   //   const request_CLMMGetPoolInfoRequestType: CLMMGetPoolInfoRequestType = {
//   //     network: NETWORK,
//   //     poolAddress: clmmPoolAddress,
//   //   };
//   //   var response_CLMMPoolInfo: CLMMPoolInfo = await osmosis.controller.poolInfoRequest(
//   //     osmosis,
//   //     fastify,
//   //     request_CLMMGetPoolInfoRequestType,
//   //     'clmm',
//   //   );
//   //   console.debug(response_CLMMPoolInfo);
//   //   writeMockResponse('poolInfo-CLMM-in', request_CLMMGetPoolInfoRequestType);
//   //   writeMockResponse('poolInfo-CLMM-out', response_CLMMPoolInfo);
//   // } catch (err) {
//   //   console.debug(err);
//   // }

//   await osmosis.close();
//   await fastify.close();
// }

// function main() {
//   testnojest()
//     .then(() => process.exit(0))
//     .catch((err) => {
//       console.error(err);
//       process.exit(1);
//     });
// }

// main();
