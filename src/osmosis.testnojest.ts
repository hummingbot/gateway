import * as fs from 'fs';
import * as fsog from 'fs/promises';
import * as fs2 from 'fs/promises';
import * as https from 'https';
import * as path from 'path';
import * as pathog from 'path';

import sensible from '@fastify/sensible';
import { Type, Static } from '@sinclair/typebox';
import axios from 'axios';
import Decimal from 'decimal.js-light';
import Fastify, { FastifyInstance } from 'fastify';

// AMM routes
import { addLiquidity as addLiquidityAMM } from './connectors/osmosis/amm-routes/addLiquidity';
import { fetchPools as fetchPoolsAMM } from './connectors/osmosis/amm-routes/fetchPools';
import { poolInfo as poolInfoAMM } from './connectors/osmosis/amm-routes/poolInfo';
import { positionInfo as positionInfoAMM } from './connectors/osmosis/amm-routes/positionInfo';
import { positionsOwned as positionsOwnedAMM } from './connectors/osmosis/amm-routes/positionsOwned';
import { removeLiquidity as removeLiquidityAMM } from './connectors/osmosis/amm-routes/removeLiquidity';

// AMM/CLMM (and maybe router)
import { balances } from './connectors/osmosis/chain-routes/balances';
import { estimateGas } from './connectors/osmosis/chain-routes/estimateGas';
import { poll } from './connectors/osmosis/chain-routes/poll';
import { status } from './connectors/osmosis/chain-routes/status';
import { tokens } from './connectors/osmosis/chain-routes/tokens';
import { addLiquidity as addLiquidityCLMM } from './connectors/osmosis/clmm-routes/addLiquidity';
import { closePosition as closePositionCLMM } from './connectors/osmosis/clmm-routes/closePosition';
import { collectFees } from './connectors/osmosis/clmm-routes/collectFees';
import { fetchPools as fetchPoolsCLMM } from './connectors/osmosis/clmm-routes/fetchPools';
import { openPosition } from './connectors/osmosis/clmm-routes/openPosition';
import { poolInfo as poolInfoCLMM } from './connectors/osmosis/clmm-routes/poolInfo';
import { positionInfo as positionInfoCLMM } from './connectors/osmosis/clmm-routes/positionInfo';
import { positionsOwned as positionsOwnedCLMM } from './connectors/osmosis/clmm-routes/positionsOwned';
import { removeLiquidity as removeLiquidityCLMM } from './connectors/osmosis/clmm-routes/removeLiquidity';
import { executeSwap, quoteSwap } from './connectors/osmosis/osmosis.swap';

// CLMM routes

// chain routes

// import { configRoutes } from '../../../src/config/config.routes';

type method = 'GET' | 'POST';
const certPath = '/home/chase/pecu/hummingbot/certs';

// import { price, trade, addLiquidity, removeLiquidity, poolPrice, poolPosition, transfer, getTokens, } from '../../../src/chains/osmosis/osmosis.controllers'; //getTradeInfo, price
import {
  PoolInfo as AMMPoolInfo,
  GetPoolInfoRequestType as AMMGetPoolInfoRequestType,
  PositionInfo as AMMPositionInfo,
  GetPositionInfoRequestType as AMMGetPositionInfoRequestType,
  AddLiquidityRequestType as AMMAddLiquidityRequestType,
  AddLiquidityResponseType as AMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as AMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as AMMRemoveLiquidityResponseType,
  PositionInfoSchema as AMMPositionInfoSchema,
} from './schemas/amm-schema';
import {
  CollectFeesRequestType as CLMMCollectFeesRequestType,
  CollectFeesResponseType as CLMMCollectFeesResponseType,
  OpenPositionRequestType as CLMMOpenPositionRequestType,
  OpenPositionResponseType as CLMMOpenPositionResponseType,
  ClosePositionRequestType as CLMMClosePositionRequestType,
  ClosePositionResponseType as CLMMClosePositionResponseType,
  PoolInfo as CLMMPoolInfo,
  GetPoolInfoRequestType as CLMMGetPoolInfoRequestType,
  PositionInfo as CLMMPositionInfo,
  GetPositionInfoRequestType as CLMMGetPositionInfoRequestType,
  AddLiquidityRequestType as CLMMAddLiquidityRequestType,
  AddLiquidityResponseType as CLMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as CLMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as CLMMRemoveLiquidityResponseType,
  PositionInfoSchema as CLMMPositionInfoSchema,
  FetchPoolsRequestType,
  QuotePositionRequestType,
  QuotePositionResponseType,
  CollectFeesResponseType,
} from './schemas/clmm-schema';

const PositionsOwnedRequest = Type.Object({
  network: Type.Optional(Type.String({ examples: ['mainnet'], default: 'mainnet' })),
  walletAddress: Type.String({ examples: ['<osmosis wallet address>'] }),
  poolType: Type.Optional(Type.String({ examples: ['clmm', 'amm'], default: 'clmm' })),
});
type PositionsOwnedRequestType = Static<typeof PositionsOwnedRequest>;
const AMMAllPositionsOwnedResponse = Type.Array(AMMPositionInfoSchema);
const CLMMAllPositionsOwnedResponse = Type.Array(CLMMPositionInfoSchema);
type AMMAllPositionsOwnedResponseType = Static<typeof AMMAllPositionsOwnedResponse>;
type CLMMAllPositionsOwnedResponseType = Static<typeof CLMMAllPositionsOwnedResponse>;

import { Osmosis } from './connectors/osmosis/osmosis';
import { SerializableExtendedPool } from './connectors/osmosis/osmosis.types';
import {
  TokensRequestType,
  TokensResponseType,
  TokensRequestSchema,
  TokensResponseSchema,
} from './schemas/chain-schema';
import { ConfigManagerV2 } from './services/config-manager-v2';
import { logger } from './services/logger';
import { displayChainConfigurations } from './services/startup-banner';
import { tokensRoutes } from './tokens/tokens.routes';
import { tradingRoutes, tradingClmmRoutes } from './trading/trading.routes';
import { GATEWAY_VERSION } from './version';
import { addWallet, getWallets } from './wallet/utils';
import { CosmosAsset } from './chains/cosmos/cosmos.universaltypes';
import { getOsmoWallet } from './connectors/osmosis/osmosis.controllers';
import { isValidCosmosAddress } from './chains/cosmos/cosmos.validators';

// ALL ROUTES/recreate
import { ethereumRoutes } from './chains/ethereum/ethereum.routes';
import { solanaRoutes } from './chains/solana/solana.routes';
import { configRoutes } from './config/config.routes';
import { register0xRoutes } from './connectors/0x/0x.routes';
import { jupiterRoutes } from './connectors/jupiter/jupiter.routes';
import { meteoraRoutes } from './connectors/meteora/meteora.routes';
import { osmosisChainRoutes } from './connectors/osmosis/chain-routes';
import { osmosisRoutes } from './connectors/osmosis/osmosis.routes';
import { pancakeswapRoutes } from './connectors/pancakeswap/pancakeswap.routes';
import { pancakeswapSolRoutes } from './connectors/pancakeswap-sol/pancakeswap-sol.routes';
import { raydiumRoutes } from './connectors/raydium/raydium.routes';
import { uniswapRoutes } from './connectors/uniswap/uniswap.routes';
import { getHttpsOptions } from './https';
import { poolRoutes } from './pools/pools.routes';
import { walletRoutes } from './wallet/wallet.routes';

const CHAIN = 'cosmos';
const CONNECTOR = 'osmosis';
const NETWORK = 'testnet';
const BASE_TOKEN = 'OSMO';
const QUOTE_TOKEN = 'ION';
const TEST_WALLET = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const TEST_WALLET_PRIVATE_KEY = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5';
const TEST_OUTBOUND_ADDRESS = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7';
const TEST_POOL = '62';
const TEST_POOL_ADDRESS_AMM = 'osmo17svzplxq3dmkz0atv6vtepftvtfl5daxuajtzxjwchnyjumupg5q649708';

const mockDir = path.join(__dirname, '..', 'test', 'connectors', 'osmosis', 'mocks');

// Helper to load mock responses
async function loadMockResponse(filename) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // First try to find connector-specific mock
    const filePath = path.join(mockDir, `${filename}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    // If not found, use generic mock template
    const templatePath = path.join(__dirname, '..', 'test', 'connectors', 'osmosis', 'mocks', `${filename}.json`);
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  }
}

async function writeMockResponse(filename: string, instance: object) {
  try {
    const filePath = path.join(__dirname, '..', 'test', 'connectors', 'osmosis', 'mocks', `${filename}.json`);
    console.log(filePath);
    const json = JSON.stringify(instance, null, 2);
    // fs.mkdirSync(mockDir); // Creates the directory if it doesn't exist
    fs.writeFileSync(filePath, json, 'utf-8');
  } catch (error) {
    console.log(error);
  }
}

async function testnojest() {
  const osmosis: Osmosis = Osmosis.getInstance(NETWORK);
  await osmosis.init();
  const fastify = Fastify();
  // let fastify: FastifyInstance;
  // fastify = gatewayApp;
  await fastify.register(sensible);

  fastify.register(configRoutes, { prefix: '/config' });
  fastify.register(walletRoutes, { prefix: '/wallet' });
  fastify.register(tokensRoutes, { prefix: '/tokens' });
  fastify.register(poolRoutes, { prefix: '/pools' });
  fastify.register(tradingRoutes, { prefix: '/trading/swap' });
  fastify.register(tradingClmmRoutes, { prefix: '/trading/clmm' });
  fastify.register(solanaRoutes, { prefix: '/chains/solana' });
  fastify.register(ethereumRoutes, { prefix: '/chains/ethereum' });
  fastify.register(osmosisChainRoutes, { prefix: '/chains/cosmos' });
  fastify.register(jupiterRoutes.router, {
    prefix: '/connectors/jupiter/router',
  });
  fastify.register(meteoraRoutes.clmm, { prefix: '/connectors/meteora/clmm' });
  fastify.register(raydiumRoutes.amm, { prefix: '/connectors/raydium/amm' });
  fastify.register(raydiumRoutes.clmm, { prefix: '/connectors/raydium/clmm' });
  fastify.register(uniswapRoutes.router, {
    prefix: '/connectors/uniswap/router',
  });
  fastify.register(uniswapRoutes.amm, { prefix: '/connectors/uniswap/amm' });
  fastify.register(uniswapRoutes.clmm, { prefix: '/connectors/uniswap/clmm' });
  fastify.register(register0xRoutes);
  fastify.register(pancakeswapRoutes.router, {
    prefix: '/connectors/pancakeswap/router',
  });
  fastify.register(pancakeswapRoutes.amm, { prefix: '/connectors/pancakeswap/amm' });
  fastify.register(pancakeswapRoutes.clmm, { prefix: '/connectors/pancakeswap/clmm' });
  fastify.register(pancakeswapSolRoutes, { prefix: '/connectors/pancakeswap-sol' });
  fastify.register(osmosisRoutes.amm, { prefix: '/connectors/osmosis/amm' });
  fastify.register(osmosisRoutes.clmm, { prefix: '/connectors/osmosis/clmm' });

  // (fastify as any).httpErrors = {
  //   badRequest: (msg: string) => {
  //     const error: any = new Error(msg);
  //     error.statusCode = 400;
  //     return error;
  //   },
  //   notFound: (msg: string) => {
  //     const error: any = new Error(msg);
  //     error.statusCode = 404;
  //     return error;
  //   },
  //   internalServerError: (msg: string) => {
  //     const error: any = new Error(msg);
  //     error.statusCode = 500;
  //     return error;
  //   },
  // };

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
  } catch (err) {
    console.debug(err);
  }

  // TESTED ENDPOINTS

  console.debug('Osmosis Chain Routes');
  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   const wal = { privateKey: TEST_WALLET_PRIVATE_KEY, chain: 'cosmos' };
  //   const request = await addWallet(fastify, wal);
  //   const wallets = await getWallets(fastify);

  //   const addresses: string[][] = wallets
  //     .filter((wallet) => wallet.chain === 'cosmos')
  //     .map((wallet) => wallet.walletAddresses);
  //   writeMockResponse('addWallet-in', wal);
  //   writeMockResponse('addWallet-out', addresses);
  //   console.debug(addresses);

  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('transfer');
  //   const transfer_in = {
  //     from: TEST_WALLET,
  //     to: TEST_OUTBOUND_ADDRESS,
  //     token: 'OSMO',
  //     amount: '0.00001',
  //     chains: 'cosmos',
  //     network: NETWORK,
  //   };
  //   writeMockResponse('transfer-in', transfer_in);
  //   const transfer = await osmosis.controller.transfer(osmosis, transfer_in);
  //   writeMockResponse('transfer-out', transfer);
  //   console.debug(transfer);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('tokens all');
  //   var tokensRequest: TokensRequestType = { network: NETWORK, tokenSymbols: [] };
  //   writeMockResponse('tokens-all-in', tokensRequest);
  //   var getTokens: TokensResponseType = await tokens(fastify, tokensRequest);
  //   writeMockResponse('tokens-all-out', getTokens);
  //   console.debug(getTokens);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('tokens OSMO');
  //   var tokensRequest: TokensRequestType = { network: NETWORK, tokenSymbols: ['OSMO'] };
  //   writeMockResponse('tokens-OSMO-in', tokensRequest);
  //   var getTokens: TokensResponseType = await tokens(fastify, tokensRequest);
  //   writeMockResponse('tokens-OSMO-out', getTokens);
  //   console.debug(getTokens);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('estimateGas');
  //   const response = await estimateGas(fastify, NETWORK);
  //   console.debug(response);
  //   writeMockResponse('estimateGas-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('status');
  //   const response = await status(fastify, NETWORK);
  //   console.debug(response);
  //   writeMockResponse('status-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('poll');
  //   const poll_signature = "344A0C038C05D1FA938E78828925109879E30C397100BD84D0BA08A463B2FF82";
  //   const request = { network: NETWORK, signature:poll_signature, tokens:[], walletAddress:TEST_WALLET }
  //   const poll_return = await poll(fastify, request);
  //   console.debug(poll_return);
  //   writeMockResponse('poll-in', request);
  //   writeMockResponse('poll-out', poll_return);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('block');
  //   const block = await osmosis.getCurrentBlockNumber();
  //   console.debug(block);
  //   writeMockResponse('block-out', block as unknown as object);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('balances OSMO');
  //   const request = { address: TEST_WALLET, tokens: ['OSMO'], network:NETWORK, };
  //   const response = await balances(fastify, request);
  //   console.debug(response);
  //   writeMockResponse('balances-OSMO-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('balances ALL');
  //   const request = { address: TEST_WALLET, tokens: [], network:NETWORK, fetchAll:true };
  //   const response = await balances(fastify, request);
  //   console.debug(response);
  //   writeMockResponse('balances-ALL-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  //// AMM
  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('quoteSwap AMM');
  //   const request = {
  //     slippagePct: 99,
  //     network: NETWORK,
  //     quoteToken: 'ION',
  //     baseToken: 'OSMO',
  //     amount: 0.001,
  //     side: 'BUY',
  //   };
  //   const response = await quoteSwap(fastify, request, 'AMM');
  //   console.debug(response);
  //   writeMockResponse('quoteSwap-GAMM-in', request);
  //   writeMockResponse('quoteSwap-GAMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('quoteSwap CLMM');
  //   const request = {
  //     slippagePct: 99,
  //     network: NETWORK,
  //     quoteToken: 'ION',
  //     baseToken: 'OSMO',
  //     amount: 0.001,
  //     side: 'BUY',
  //   };
  //   const response = await quoteSwap(fastify, request, 'CLMM');
  //   console.debug(response);
  //   writeMockResponse('quoteSwap-CLMM-in', request);
  //   writeMockResponse('quoteSwap-CLMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('executeSwap AMM');
  //   const request = {
  //     baseToken: 'ION',
  //     quoteToken: 'OSMO',
  //     amount: 0.0001,
  //     side: 'BUY',
  //     slippagePct: 99,
  //     chains: 'cosmos',
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //   };
  //   const response = await executeSwap(fastify, request, 'AMM');
  //   console.debug(response);
  //   writeMockResponse('executeSwap-GAMM-in', request);
  //   writeMockResponse('executeSwap-GAMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('executeSwap AMM reverse');
  //   const request = {
  //     baseToken: 'OSMO',
  //     quoteToken: 'ION',
  //     amount: 0.1,
  //     side: 'BUY',
  //     slippagePct: 99,
  //     chains: 'cosmos',
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //   };
  //   const response = await executeSwap(fastify, request, 'AMM');
  //   console.debug(response);
  //   writeMockResponse('executeSwap-GAMM-reverse-in', request);
  //   writeMockResponse('executeSwap-GAMM-reverse-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('executeSwap CLMM');
  //   const request = {
  //     baseToken: 'ION',
  //     quoteToken: 'OSMO',
  //     amount: 0.0001,
  //     side: 'BUY',
  //     slippagePct: 99,
  //     chains: 'cosmos',
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //   };
  //   const response = await executeSwap(fastify, request, 'CLMM');
  //   console.debug(response);
  //   writeMockResponse('executeSwap-CLMM-in', request);
  //   writeMockResponse('executeSwap-CLMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // let gammPoolAddress = TEST_POOL_ADDRESS_AMM;
  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('fetchPools GAMM');
  //   const request: FetchPoolsRequestType = {
  //     network: NETWORK,
  //     tokenA: 'ION',
  //     tokenB: 'OSMO',
  //   };
  //   const response: SerializableExtendedPool[] = await fetchPoolsAMM(
  //     fastify,
  //     request,
  //     'amm',
  //   );
  //   gammPoolAddress = response[0].address;
  //   console.debug(response);
  //   writeMockResponse('fetchPools-GAMM-in', request);
  //   writeMockResponse('fetchPools-GAMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('addLiquidity GAMM');
  //   const request: AMMAddLiquidityRequestType = {
  //     poolAddress: gammPoolAddress,
  //     baseTokenAmount: 0.01,
  //     quoteTokenAmount: 0,
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     slippagePct: 100,
  //   };
  //   const response: AMMAddLiquidityResponseType = await addLiquidityAMM(
  //     fastify,
  //     request,
  //   );
  //   console.debug(response);
  //   writeMockResponse('addLiquidity-GAMM-in', request);
  //   writeMockResponse('addLiquidity-GAMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('AMMGetPositionInfoRequestType by pool address');
  //   const request: AMMGetPositionInfoRequestType = {
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     poolAddress: gammPoolAddress,
  //   };
  //   var response: AMMPositionInfo = await positionInfoAMM(
  //     fastify,
  //     request,
  //     'amm',
  //   ) as AMMPositionInfo;
  //   console.debug(response);
  //   writeMockResponse('positionInfo-GAMM-by-address-in', request);
  //   writeMockResponse('positionInfo-GAMM-by-address-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('positionsOwned AMM for wallet');
  //   const request: PositionsOwnedRequestType  = {
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     poolType: 'amm',
  //   };
  //   const response_positionsOwned: AMMAllPositionsOwnedResponseType | CLMMAllPositionsOwnedResponseType = await positionsOwnedAMM(
  //     fastify,
  //     request,
  //     'amm',
  //   );
  //   writeMockResponse('positionsOwned-AMM-in', request);
  //   writeMockResponse('positionsOwned-AMM-out', response_positionsOwned);
  //   gammPoolAddress = response_positionsOwned[0].poolAddress;
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('removeLiquidityAMM partial');
  //   const request: AMMRemoveLiquidityRequestType = {
  //     percentageToRemove: 20,
  //     poolAddress: gammPoolAddress,
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //   };
  //   const response: AMMRemoveLiquidityResponseType =
  //     await removeLiquidityAMM(fastify, request);
  //   console.debug(response);
  //   writeMockResponse('removeLiquidity-GAMM-partial-in', request);
  //   writeMockResponse('removeLiquidity-GAMM-partial-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('removeLiquidityAMM all');
  //   const request: AMMRemoveLiquidityRequestType = {
  //     percentageToRemove: 100,
  //     poolAddress: gammPoolAddress,
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //   };
  //   const response: AMMRemoveLiquidityResponseType =
  //     await removeLiquidityAMM(fastify, request);
  //   console.debug(response);
  //   writeMockResponse('removeLiquidity-GAMM-all-in', request);
  //   writeMockResponse('removeLiquidity-GAMM-all-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('AMMGetPoolInfoRequestType by pool address');
  //   const request: AMMGetPoolInfoRequestType = {
  //     network: NETWORK,
  //     poolAddress: gammPoolAddress,
  //   };
  //   const response: AMMPoolInfo = await poolInfoAMM(
  //     fastify,
  //     request,
  //     'amm',
  //   );
  //   console.debug(response);
  //   writeMockResponse('poolInfo-GAMM-by-address-in', request);
  //   writeMockResponse('poolInfo-GAMM-by-address-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // let clmmPositionAddress = '3486'; //'3479'; //2836 2837 2843
  // let clmmPoolAddress = 'osmo1rdm79d008fel4ppkgdcf8pgjwazf72sjfhpyx5kpzlck86slpjusek2en6';
  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('fetchPools CLMM');
  //   const request_CLMMAddLiquidityRequestType: FetchPoolsRequestType = {
  //     network: NETWORK,
  //     tokenA: 'ION',
  //     tokenB: 'OSMO',
  //   };
  //   const response_CLMMAddLiquidityResponseType: SerializableExtendedPool[] = await fetchPoolsCLMM(
  //     fastify,
  //     request_CLMMAddLiquidityRequestType,
  //     'clmm',
  //   );
  //   clmmPoolAddress = response_CLMMAddLiquidityResponseType[0].address;
  //   console.debug(response_CLMMAddLiquidityResponseType);
  //   writeMockResponse('fetchPools-CLMM-in', request_CLMMAddLiquidityRequestType);
  //   writeMockResponse('fetchPools-CLMM-out', response_CLMMAddLiquidityResponseType);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMM Quote Position Stub');
  //   const quotePosition_request: QuotePositionRequestType = {
  //     poolAddress: clmmPoolAddress,
  //     lowerPrice: 200,
  //     upperPrice: 1000,
  //     baseTokenAmount: 0.0002,
  //     quoteTokenAmount: 0.1,
  //     network: NETWORK,
  //     slippagePct: 99,
  //   };
  //   const quotePositon_response: QuotePositionResponseType = await osmosis.QuotePositionCLMM(
  //     quotePosition_request,
  //   );
  //   console.debug(quotePositon_response);
  //   console.debug(clmmPositionAddress);
  //   writeMockResponse('quotePosition-CLMM-in', quotePosition_request);
  //   writeMockResponse('quotePosition-CLMM-out', quotePositon_response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMM Open Position by clmmPoolAddress: CLMMOpenPositionRequestType CLMMOpenPositionResponseType');
  //   const request: CLMMOpenPositionRequestType = {
  //     lowerPrice: 200,
  //     upperPrice: 1000,
  //     poolAddress: clmmPoolAddress,
  //     baseTokenAmount: 0.0002,
  //     quoteTokenAmount: 0.1,
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     slippagePct: 100, // very unbalanced, only accepting ION
  //   };
  //   const response: CLMMOpenPositionResponseType = await openPosition(
  //     fastify,
  //     request,
  //   );
  //   clmmPositionAddress = response.data.positionAddress;
  //   console.debug(response);
  //   console.debug(clmmPositionAddress);
  //   writeMockResponse('openPosition-CLMM-in', request);
  //   // writeMockResponse('openPosition-CLMM-positionAddress', clmmPositionAddress as unknown as object);
  //   writeMockResponse('openPosition-CLMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // let collect_clmmPositionAddress = '';
  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('positionsOwned CLMM for wallet');
  //   const request_positionsOwned: PositionsOwnedRequestType  = {
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     poolType: 'clmm',
  //   };
  //   const response: AMMAllPositionsOwnedResponseType | CLMMAllPositionsOwnedResponseType = await positionsOwnedCLMM(
  //     fastify,
  //     request_positionsOwned,
  //     'clmm',
  //   );
  //   collect_clmmPositionAddress = response[10].address;
  //   writeMockResponse('positionsOwned-CLMM-in', request_positionsOwned);
  //   writeMockResponse('positionsOwned-CLMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMMCollectFeesRequestType CLMMClosePositionResponseType');
  //   const request: CLMMCollectFeesRequestType = {
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     positionAddress: collect_clmmPositionAddress,
  //   };
  //   const response: CollectFeesResponseType =
  //     await collectFees(fastify, request); // just collectRewards and removeLiq with 100%
  //   console.debug(response);
  //   writeMockResponse('collectFees-CLMM-in', request);
  //   writeMockResponse('collectFees-CLMM-out', response);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMMAddLiquidityRequestType CLMMAddLiquidityResponseType');
  //   const request_CLMMAddLiquidityRequestType: CLMMAddLiquidityRequestType = {
  //     positionAddress: clmmPositionAddress,
  //     baseTokenAmount: 0.0002,
  //     quoteTokenAmount: 0.1,
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     slippagePct: 100,
  //   };
  //   const response_CLMMAddLiquidityResponseType: CLMMAddLiquidityResponseType =
  //     await addLiquidityCLMM(fastify, request_CLMMAddLiquidityRequestType);
  //   clmmPositionAddress = response_CLMMAddLiquidityResponseType.data.newPositionAddress;
  //   console.debug(response_CLMMAddLiquidityResponseType);
  //   console.debug(clmmPositionAddress);
  //   writeMockResponse('addLiquidity-CLMM-in', request_CLMMAddLiquidityRequestType);
  //   // writeMockResponse('addLiquidity-CLMM-address', clmmPositionAddress as unknown as object);
  //   writeMockResponse('addLiquidity-CLMM-out', response_CLMMAddLiquidityResponseType);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMMRemoveLiquidityRequestType CLMMRemoveLiquidityResponseType');
  //   const request_CLMMRemoveLiquidityRequestType: CLMMRemoveLiquidityRequestType = {
  //     network: NETWORK,
  //     positionAddress: clmmPositionAddress,
  //     percentageToRemove: 50,
  //     walletAddress: TEST_WALLET,
  //   };
  //   const response_CLMMRemoveLiquidityResponseType: CLMMRemoveLiquidityResponseType =
  //     await removeLiquidityCLMM(fastify, request_CLMMRemoveLiquidityRequestType);
  //   console.debug(response_CLMMRemoveLiquidityResponseType);
  //   console.debug(clmmPositionAddress);
  //   writeMockResponse('removeLiquidity-CLMM-in', request_CLMMRemoveLiquidityRequestType);
  //   writeMockResponse('removeLiquidity-CLMM-out', response_CLMMRemoveLiquidityResponseType);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMMGetPositionInfoRequestType by CLMMPositionAddress');
  //   const request_CLMMGetPositionInfoRequestType: CLMMGetPositionInfoRequestType = {
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     positionAddress: clmmPositionAddress,
  //   };
  //   const response_CLMMPositionInfo: CLMMPositionInfo = await positionInfoCLMM(
  //     fastify,
  //     request_CLMMGetPositionInfoRequestType,
  //     'clmm',
  //   ) as CLMMPositionInfo;
  //   console.debug(response_CLMMPositionInfo);
  //   console.debug(clmmPositionAddress);
  //   writeMockResponse('positionInfo-CLMM-in', request_CLMMGetPositionInfoRequestType);
  //   writeMockResponse('positionInfo-CLMM-out', response_CLMMPositionInfo);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMMClosePositionRequestType CLMMClosePositionResponseType');
  //   const request_CLMMClosePositionRequestType: CLMMClosePositionRequestType = {
  //     network: NETWORK,
  //     walletAddress: TEST_WALLET,
  //     positionAddress: clmmPositionAddress,
  //   };
  //   const response_CLMMClosePositionResponseType: CLMMClosePositionResponseType =
  //     await closePositionCLMM(fastify, request_CLMMClosePositionRequestType); // just collectRewards and removeLiq with 100%
  //   console.debug(response_CLMMClosePositionResponseType);
  //   writeMockResponse('closePosition-CLMM-in', request_CLMMClosePositionRequestType);
  //   writeMockResponse('closePosition-CLMM-out', response_CLMMClosePositionResponseType);
  // } catch (err) {
  //   console.debug(err);
  // }

  // try {
  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  //   console.debug('CLMMGetPoolInfoRequestType by poolAddress');
  //   const request_CLMMGetPoolInfoRequestType: CLMMGetPoolInfoRequestType = {
  //     network: NETWORK,
  //     poolAddress: clmmPoolAddress,
  //   };
  //   var response_CLMMPoolInfo: CLMMPoolInfo = await poolInfoCLMM(
  //     fastify,
  //     request_CLMMGetPoolInfoRequestType,
  //     'clmm',
  //   ) as CLMMPoolInfo;
  //   console.debug(response_CLMMPoolInfo);
  //   writeMockResponse('poolInfo-CLMM-in', request_CLMMGetPoolInfoRequestType);
  //   writeMockResponse('poolInfo-CLMM-out', response_CLMMPoolInfo);
  // } catch (err) {
  //   console.debug(err);
  // }

  await osmosis.close();
  await fastify.close();
}

function main() {
  testnojest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

main();
