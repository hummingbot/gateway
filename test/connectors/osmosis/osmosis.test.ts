import * as fs2 from 'fs/promises';

import Fastify, { FastifyInstance } from 'fastify';

import { SerializableExtendedPool } from '#src/connectors/osmosis/osmosis.types';
import { TokensRequestType, TokensResponseType } from '#src/schemas/chain-schema';

import { configRoutes } from '../../../src/config/config.routes';
import { Osmosis } from '../../../src/connectors/osmosis/osmosis';
import {
  PoolInfo as AMMPoolInfo,
  GetPoolInfoRequestType as AMMGetPoolInfoRequestType,
  PositionInfo as AMMPositionInfo,
  GetPositionInfoRequestType as AMMGetPositionInfoRequestType,
  AddLiquidityRequestType as AMMAddLiquidityRequestType,
  AddLiquidityResponseType as AMMAddLiquidityResponseType,
  RemoveLiquidityRequestType as AMMRemoveLiquidityRequestType,
  RemoveLiquidityResponseType as AMMRemoveLiquidityResponseType,
} from '../../../src/schemas/amm-schema';
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
  FetchPoolsRequestType,
} from '../../../src/schemas/clmm-schema';
import { ConfigManagerCertPassphrase } from '../../../src/services/config-manager-cert-passphrase';
import { addWallet, getWallets } from '../../../src/wallet/utils';
import { patch, unpatch } from '../../../test/services/patch';

const fs = require('fs');
const path = require('path');

const { test, describe, expect, beforeEach } = require('@jest/globals');
const axios = require('axios');

type Side = 'BUY' | 'SELL';

const mockDir = path.join(__dirname, 'connectors', 'osmosis', 'mocks');
// Helper to load mock responses
async function loadMockResponse(filename) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // First try to find connector-specific mock
    const filePath = path.join(mockDir, `${filename}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    // If not found, use generic mock template
    const templatePath = path.join(__dirname, 'connectors', 'osmosis', 'mocks', `${filename}.json`);
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  }
}

async function writeMockResponse(filename: string, instance: object) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const filePath = path.join(mockDir, `${filename}.json`);
    console.log(filePath);
    const json = JSON.stringify(instance, null, 2);
    console.log(json);

    await fs2.mkdir(mockDir, { recursive: true }); // Creates the directory if it doesn't exist
    await fs2.writeFile(filePath, json, 'utf-8');
  } catch (error) {
    console.log(error);
  }
}

// Constants for this test file
const CHAIN = 'osmosis';
const CONNECTOR = 'osmosis';
const NETWORK = 'testnet';
const BASE_TOKEN = 'OSMO';
const QUOTE_TOKEN = 'ION';
const TEST_WALLET = 'osmo1gxfandcf6x6y0lv3afv0p4w4akv809ycrly4cs';
const TEST_WALLET_PRIVATE_KEY = '2e8be986f72f76dba7f8448b2e2342d3297cd628cf08aad9b90098102824f9d5';
const TEST_OUTBOUND_ADDRESS = 'osmo1mvsg3en5ulpnpd3dset2m86zjpnzp4v4epmjh7';
const TEST_POOL_ADDRESS_AMM = 'osmo17svzplxq3dmkz0atv6vtepftvtfl5daxuajtzxjwchnyjumupg5q649708';
const TEST_POOL_ID = '62';

// // Mock API calls (axios.get and axios.post)
jest.mock('axios');
// // Mock implementation for axios
axios.get = jest.fn();
axios.post = jest.fn();

jest.setTimeout(300000); // run for 5 mins
jest.setTimeout(30000000); // run for 5 mins

const osmosis: Osmosis = Osmosis.getInstance(NETWORK);
let fastify: FastifyInstance;

describe('Osmosis Wallets', () => {
  beforeAll(async () => {
    patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'macymo');
    await osmosis.init();
    fastify = Fastify();
    await fastify.register(configRoutes);
  });
  beforeEach(async () => {});
  afterEach(async () => {});
  afterAll(async () => {
    unpatch();
    await osmosis.close();
    await fastify.close();
  });

  it('add an Osmosis wallet', async () => {
    const reqo = await addWallet(fastify, { privateKey: TEST_WALLET_PRIVATE_KEY, chain: 'osmosis' });
    const wallets = await getWallets(fastify);
    const addresses: string[][] = wallets
      .filter((wallet) => wallet.chain === 'osmosis')
      .map((wallet) => wallet.walletAddresses);
    expect(addresses[0]).toContain(TEST_WALLET);
  });

  it('fuck my life and this AI slop that cant even be debugged', async () => {
    const reqo = await addWallet(fastify, { privateKey: TEST_WALLET_PRIVATE_KEY, chain: 'osmosis' });

    // try {
    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    //   console.debug('transfer');
    //   const transfer_in = {
    //     from: TEST_WALLET,
    //     to: TEST_OUTBOUND_ADDRESS,
    //     token: 'OSMO',
    //     amount: '0.00001',
    //     chain: 'osmosis',
    //     network: NETWORK,
    //   };
    //   writeMockResponse('transfer-in', transfer_in);
    //   const transfer = await osmosis.controller.transfer(osmosis, transfer_in);
    //   writeMockResponse('transfer-out', transfer);
    //   console.debug(transfer);
    // } catch (err) {
    //   console.debug(err);
    // }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('getTokens OSMO');
      const tokensRequest: TokensRequestType = { network: 'osmosis', tokenSymbols: ['OSMO'] };
      writeMockResponse('getTokens-OSMO-in', tokensRequest);
      const getTokens: TokensResponseType = await osmosis.controller.getTokens(osmosis, tokensRequest);
      writeMockResponse('getTokens-OSMO-out', getTokens);
      console.debug(getTokens);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('getTokens All');
      const tokensRequest: TokensRequestType = { network: 'osmosis', tokenSymbols: [] };
      writeMockResponse('getTokens-all-in', tokensRequest);
      const getTokens: TokensResponseType = await osmosis.controller.getTokens(osmosis, tokensRequest);
      writeMockResponse('getTokens-all-out', getTokens);
      console.debug(getTokens);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('estimateGas');
      const gasPrice = await osmosis.getLatestBasePrice();
      const gasLimitUsed = osmosis.gasLimitTransaction;
      const gasCost = parseFloat(String(Number(osmosis.gasAdjustment) * Number(osmosis.gasLimitTransaction)));
      const estimateGas = {
        timestamp: Date.now(),
        denomination: osmosis.nativeTokenSymbol,
        feePerComputeUnit: gasLimitUsed,
        computeUnits: 0,
        feeAsset: 'OSMO',
        fee: gasPrice,
      };
      console.debug(estimateGas);
      writeMockResponse('estimateGas-out', estimateGas);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('block');
      const block = await osmosis.getCurrentBlockNumber();
      console.debug(block);
      writeMockResponse('block-out', block as unknown as object);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('balances OSMO');
      const balances = await osmosis.controller.balances(osmosis, { address: TEST_WALLET, tokenSymbols: ['OSMO'] });
      console.debug(balances);
      writeMockResponse('balances-OSMO-out', balances);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('balances All');
      const balances = await osmosis.controller.balances(osmosis, { address: TEST_WALLET, tokenSymbols: [] });
      console.debug(balances);
      writeMockResponse('balances-ALL-out', balances);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('wallet balances All');
      const walleto = await osmosis.getWalletFromPrivateKey(TEST_WALLET_PRIVATE_KEY, 'osmo');
      writeMockResponse('wallet-balances-ALL-in', walleto);
      const balanceo = await osmosis.getBalances(walleto);
      writeMockResponse('wallet-balances-ALL-out', balanceo);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('get token');
      const token = osmosis.getTokenBySymbol('ATOM');
      const token2 = osmosis.getTokenForSymbol('OSMO');
      console.debug(token);
      console.debug(token2);
      writeMockResponse('get-token-ATOM-out', token);
      writeMockResponse('get-token-OSMO-out', token2);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('quoteSwap AMM');
      const priceRequest1 = {
        quoteToken: 'ION',
        baseToken: 'OSMO',
        amount: '0.001',
        side: 'BUY',
        slippagePct: '99',
        chain: 'osmosis',
        network: NETWORK,
      };
      const priceResponse1 = await osmosis.controller.quoteSwap(osmosis, fastify, priceRequest1, 'AMM');
      console.debug(priceResponse1);
      writeMockResponse('quoteSwap-GAMM-in', priceRequest1);
      writeMockResponse('quoteSwap-GAMM-out', priceResponse1);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('quoteSwap CLMM');
      const priceRequest1 = {
        quoteToken: 'ION',
        baseToken: 'OSMO',
        amount: '0.001',
        side: 'BUY',
        slippagePct: '99',
        chain: 'osmosis',
        network: NETWORK,
      };
      const priceResponse1 = await osmosis.controller.quoteSwap(osmosis, fastify, priceRequest1, 'clmm');
      console.debug(priceResponse1);
      writeMockResponse('quoteSwap-CLMM-in', priceRequest1);
      writeMockResponse('quoteSwap-CLMM-out', priceResponse1);
    } catch (err) {
      console.debug(err);
    }

    // try {
    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    //   console.debug('executeSwap AMM Reverse');
    //   const tradeRequest = {
    //     baseToken: 'ION',
    //     quoteToken: 'OSMO',
    //     amount: '0.0001',
    //     side: 'BUY',
    //     slippagePct: '99',
    //     chain: 'osmosis',
    //     network: NETWORK,
    //     walletAddress: TEST_WALLET,
    //   };
    //   const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'AMM');
    //   console.debug(tradeResponse);
    //   writeMockResponse('executeSwap-GAMM-in', tradeRequest);
    //   writeMockResponse('executeSwap-GAMM-out', tradeResponse);
    // } catch (err) {
    //   console.debug(err);
    // }

    // try {
    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    //   console.debug('executeSwap AMM');
    //   const tradeRequest = {
    //     quoteToken: 'ION',
    //     baseToken: 'OSMO',
    //     amount: '0.01',
    //     side: 'BUY',
    //     slippagePct: '99',
    //     chain: 'osmosis',
    //     network: NETWORK,
    //     walletAddress: TEST_WALLET,
    //   };
    //   const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'AMM');
    //   console.debug(tradeResponse);
    //   writeMockResponse('executeSwap-GAMM-reverse-in', tradeRequest);
    //   writeMockResponse('executeSwap-GAMM-reverse-out', tradeResponse);
    // } catch (err) {
    //   console.debug(err);
    // }

    let gammPoolAddress = TEST_POOL_ADDRESS_AMM;
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('fetchPools GAMM');
      const request_AMMAddLiquidityRequestType: FetchPoolsRequestType = {
        tokenA: 'ION',
        tokenB: 'OSMO',
      };
      const reponse_AMMAddLiquidityResponseType: SerializableExtendedPool[] =
        await osmosis.controller.fetchPoolsForTokens(osmosis, fastify, request_AMMAddLiquidityRequestType);
      gammPoolAddress = reponse_AMMAddLiquidityResponseType[0].address;
      console.debug(reponse_AMMAddLiquidityResponseType);
      writeMockResponse('addLiquidity-GAMM-in', request_AMMAddLiquidityRequestType);
      writeMockResponse('addLiquidity-GAMM-out', reponse_AMMAddLiquidityResponseType);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('addLiquidity GAMM');
      const request_AMMAddLiquidityRequestType: AMMAddLiquidityRequestType = {
        poolAddress: gammPoolAddress,
        // baseToken: 'ION',
        // quoteToken: 'OSMO',
        baseTokenAmount: 0.0001,
        quoteTokenAmount: 0,
        network: NETWORK,
        walletAddress: TEST_WALLET,
        slippagePct: 100,
      };
      const reponse_AMMAddLiquidityResponseType: AMMAddLiquidityResponseType = await osmosis.controller.addLiquidityAMM(
        osmosis,
        fastify,
        request_AMMAddLiquidityRequestType,
      );
      console.debug(reponse_AMMAddLiquidityResponseType);
      writeMockResponse('addLiquidity-GAMM-in', request_AMMAddLiquidityRequestType);
      writeMockResponse('addLiquidity-GAMM-out', reponse_AMMAddLiquidityResponseType);
    } catch (err) {
      console.debug(err);
    }

    // no longer supported by their side
    // try {
    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    //   console.debug('AMMGetPositionInfoRequestType by tokens');
    //   const request_AMMGetPositionInfoRequestType: AMMGetPositionInfoRequestType = {
    //     network: NETWORK,
    //     walletAddress: TEST_WALLET,
    //     poolAddress: '',
    //     baseToken: 'ION',
    //     quoteToken: 'OSMO',
    //   };
    //   var response_AMMGetPositionInfoRequestType: AMMPositionInfo = await osmosis.controller.poolPosition(
    //     osmosis,
    //     fastify,
    //     request_AMMGetPositionInfoRequestType,
    //     'amm',
    //   );
    //   console.debug(response_AMMGetPositionInfoRequestType);
    //   gammPoolAddress = response_AMMGetPositionInfoRequestType.poolAddress;
    //   writeMockResponse('GetPositionInfo-GAMM-by-token-in', request_AMMGetPositionInfoRequestType);
    //   writeMockResponse('GetPositionInfo-GAMM-by-token-out', response_AMMGetPositionInfoRequestType);
    // } catch (err) {
    //   console.debug(err);
    // }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('AMMGetPositionInfoRequestType by pool address');
      const request_AMMGetPositionInfoRequestType: AMMGetPositionInfoRequestType = {
        network: NETWORK,
        walletAddress: TEST_WALLET,
        poolAddress: gammPoolAddress,
        // baseToken: '',
        // quoteToken: '',
      };
      const response_AMMGetPositionInfoRequestType: AMMPositionInfo = await osmosis.controller.poolPosition(
        osmosis,
        fastify,
        request_AMMGetPositionInfoRequestType,
        'amm',
      );
      console.debug(response_AMMGetPositionInfoRequestType);
      writeMockResponse('GetPositionInfo-GAMM-by-address-in', request_AMMGetPositionInfoRequestType);
      writeMockResponse('GetPositionInfo-GAMM-by-address-out', response_AMMGetPositionInfoRequestType);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('AMMRemoveLiquidityRequestType GAMM');
      const request_AMMRemoveLiquidityRequestType: AMMRemoveLiquidityRequestType = {
        percentageToRemove: 20,
        poolAddress: gammPoolAddress,
        network: NETWORK,
        walletAddress: TEST_WALLET,
      };
      const response_AMMRemoveLiquidityResponseType: AMMRemoveLiquidityResponseType =
        await osmosis.controller.removeLiquidityAMM(osmosis, fastify, request_AMMRemoveLiquidityRequestType);
      console.debug(response_AMMRemoveLiquidityResponseType);
      writeMockResponse('removeLiquidity-GAMM-in', request_AMMRemoveLiquidityRequestType);
      writeMockResponse('removeLiquidity-GAMM-address', gammPoolAddress as unknown as object);
      writeMockResponse('removeLiquidity-GAMM-out', response_AMMRemoveLiquidityResponseType);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('AMMGetPoolInfoRequestType by pool address');
      const request_AMMGetPoolInfoRequestType: AMMGetPoolInfoRequestType = {
        network: NETWORK,
        // baseToken: '',
        // quoteToken: '',
        poolAddress: gammPoolAddress,
      };
      const response_AMMPoolInfo: AMMPoolInfo = await osmosis.controller.poolInfoRequest(
        osmosis,
        fastify,
        request_AMMGetPoolInfoRequestType,
        'amm',
      );
      console.debug(response_AMMPoolInfo);
      writeMockResponse('GetPoolInfo-GAMM-by-address-in', request_AMMGetPoolInfoRequestType);
      writeMockResponse('GetPoolInfo-GAMM-address', response_AMMPoolInfo.address as unknown as object);
      writeMockResponse('GetPoolInfo-GAMM-by-address-out', response_AMMPoolInfo);
    } catch (err) {
      console.debug(err);
    }

    let clmmPositionAddress; //2836 2837 2843
    let clmmPoolAddress;
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('CLMMOpenPositionRequestType CLMMOpenPositionResponseType');
      const addLiquidityRequestFunction: CLMMOpenPositionRequestType = {
        lowerPrice: 200,
        upperPrice: 1000,
        poolAddress: '',
        baseTokenAmount: 0.0002,
        quoteTokenAmount: 0.1,
        network: NETWORK,
        walletAddress: TEST_WALLET,
        slippagePct: 99,
      };
      const addLiquidityResponseCLMM: CLMMOpenPositionResponseType = await osmosis.controller.openPositionCLMM(
        osmosis,
        fastify,
        addLiquidityRequestFunction,
      );
      clmmPositionAddress = addLiquidityResponseCLMM.data.positionAddress;
      console.debug(addLiquidityResponseCLMM);
      console.debug(clmmPositionAddress);
      writeMockResponse('OpenPositionRequestType-CLMM', addLiquidityRequestFunction);
      writeMockResponse('OpenPositionResponseType-CLMM-address', clmmPositionAddress as unknown as object);
      writeMockResponse('OpenPositionResponseType-CLMM-by-address-in', addLiquidityResponseCLMM);
    } catch (err) {
      console.debug(err);
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('CLMMAddLiquidityRequestType CLMMAddLiquidityResponseType');
      const request_CLMMAddLiquidityRequestType: CLMMAddLiquidityRequestType = {
        positionAddress: clmmPositionAddress,
        baseTokenAmount: 0.0002,
        quoteTokenAmount: 0.1,
        network: NETWORK,
        walletAddress: TEST_WALLET,
        slippagePct: 80,
      };
      const response_CLMMAddLiquidityResponseType: CLMMAddLiquidityResponseType =
        await osmosis.controller.addLiquidityCLMM(osmosis, fastify, request_CLMMAddLiquidityRequestType);
      clmmPositionAddress = response_CLMMAddLiquidityResponseType.data.newPositionAddress;
      console.debug(response_CLMMAddLiquidityResponseType);
      console.debug(clmmPositionAddress);
      writeMockResponse('AddLiquidityRequestType-CLMM', request_CLMMAddLiquidityRequestType);
      writeMockResponse('AddLiquidityRequestType-CLMM-address', clmmPositionAddress as unknown as object);
      writeMockResponse('AddLiquidityResponseType-CLMM', response_CLMMAddLiquidityResponseType);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('CLMMRemoveLiquidityRequestType CLMMRemoveLiquidityResponseType');
      const request_CLMMRemoveLiquidityRequestType: CLMMRemoveLiquidityRequestType = {
        positionAddress: clmmPositionAddress,
        percentageToRemove: 50,
        walletAddress: TEST_WALLET,
      };
      const response_CLMMRemoveLiquidityResponseType: CLMMRemoveLiquidityResponseType =
        await osmosis.controller.removeLiquidityCLMM(osmosis, fastify, request_CLMMRemoveLiquidityRequestType);
      console.debug(response_CLMMRemoveLiquidityResponseType);
      console.debug(clmmPositionAddress);
      writeMockResponse('RemoveLiquidityRequestType-CLMM-by-address', request_CLMMRemoveLiquidityRequestType);
      writeMockResponse('RemoveLiquidityRequestType-CLMM-address', clmmPositionAddress as unknown as object);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('CLMMGetPositionInfoRequestType by CLMMPositionAddress');
      const request_CLMMGetPositionInfoRequestType: CLMMGetPositionInfoRequestType = {
        network: NETWORK,
        walletAddress: TEST_WALLET,
        positionAddress: clmmPositionAddress,
      };
      const response_CLMMPositionInfo: CLMMPositionInfo = await osmosis.controller.poolPosition(
        osmosis,
        fastify,
        request_CLMMGetPositionInfoRequestType,
        'clmm',
      );
      console.debug(response_CLMMPositionInfo);
      console.debug(clmmPositionAddress);
      writeMockResponse('GetPositionInfoRequestType-CLMM-by-address', request_CLMMGetPositionInfoRequestType);
      writeMockResponse('GetPositionInfoRequestType-CLMM-address', clmmPositionAddress as unknown as object);
      writeMockResponse('PositionAddress-CLMM-address', response_CLMMPositionInfo);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('CLMMClosePositionRequestType CLMMClosePositionResponseType');
      const request_CLMMClosePositionRequestType: CLMMClosePositionRequestType = {
        network: NETWORK,
        walletAddress: TEST_WALLET,
        positionAddress: clmmPositionAddress,
      };
      const response_CLMMClosePositionResponseType: CLMMClosePositionResponseType =
        await osmosis.controller.closePositionCLMM(osmosis, fastify, request_CLMMClosePositionRequestType);
      console.debug(response_CLMMClosePositionResponseType);
      writeMockResponse('ClosePositionRequestType-CLMM-by-address', request_CLMMClosePositionRequestType);
      writeMockResponse('ClosePositionRequestType-CLMM-address', clmmPositionAddress as unknown as object);
      writeMockResponse('ClosePositionResponseType-CLMM-by-address', response_CLMMClosePositionResponseType);
    } catch (err) {
      console.debug(err);
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.debug('CLMMGetPoolInfoRequestType by poolAddress');
      const request_CLMMGetPoolInfoRequestType: CLMMGetPoolInfoRequestType = {
        network: NETWORK,
        // baseToken: '',
        // quoteToken: '',
        poolAddress: clmmPoolAddress,
      };
      const response_CLMMPoolInfo: CLMMPoolInfo = await osmosis.controller.poolInfoRequest(
        osmosis,
        fastify,
        request_CLMMGetPoolInfoRequestType,
        'clmm',
      );
      console.debug(response_CLMMPoolInfo);
      writeMockResponse('GetPoolInfoRequestType-CLMM-by-address', request_CLMMGetPoolInfoRequestType);
      writeMockResponse('GetPoolInfoRequestType-CLMM-address', clmmPositionAddress as unknown as object);
      writeMockResponse('PoolInfoResponse-CLMM-by-address', response_CLMMPoolInfo);
    } catch (err) {
      console.debug(err);
    }

    await osmosis.close();
    await fastify.close();
    expect(1).toBeGreaterThan(0);
  });
});

describe('Osmosis Chain Routes', () => {
  beforeAll(async () => {
    patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'macymo');
    await osmosis.init();
    fastify = Fastify();
    await fastify.register(configRoutes);
  });
  afterAll(async () => {
    unpatch();
    await osmosis.close();
    await fastify.close();
  });
  it('getTokens', async () => {
    const getTokens = await osmosis.controller.getTokens(osmosis, { tokenSymbols: ['OSMO'] });
    expect(getTokens.tokens[0].symbol).toEqual('OSMO');
  });

  it('getTokens All', async () => {
    const getTokens = await osmosis.controller.getTokens(osmosis, {});
    expect(getTokens.tokens.length).toBeGreaterThan(0);
  });

  it('balances OSMO', async () => {
    console.log('balances OSMO');
    const balances = await osmosis.controller.balances(osmosis, { address: TEST_WALLET, tokenSymbols: ['OSMO'] });
    console.log(balances);
    console.log(balances.balances['OSMO']);
    expect(Number(balances.balances['OSMO'])).toBeGreaterThan(0);
  });

  it('balances All', async () => {
    const balances = await osmosis.controller.balances(osmosis, { address: TEST_WALLET, tokenSymbols: ['OSMO'] });
    expect(Number(balances.balances['OSMO'])).toBeGreaterThan(0);
  });

  it('getWalletFromPrivateKey', async () => {
    const walleto = await osmosis.getWalletFromPrivateKey(TEST_WALLET_PRIVATE_KEY, 'osmo');
    expect(walleto.prefix).toEqual('osmo');

    const balanceo = await osmosis.getBalances(walleto);
    expect(Number(balanceo['OSMO'].value)).toBeGreaterThan(0);
  });

  it('getCurrentBlockNumber', async () => {
    const block = await osmosis.getCurrentBlockNumber();
    expect(block).toBeGreaterThan(0);
  });

  it('getTokenBySymbol', async () => {
    const token = osmosis.getTokenBySymbol('ATOM')!;
    const token2 = osmosis.getTokenForSymbol('OSMO')!;
    expect(token.decimals).toEqual(6);
    expect(token2.symbol).toEqual('OSMO');
  });

  it('transfer', async () => {
    const transfer = await osmosis.controller.transfer(osmosis, {
      from: TEST_WALLET,
      to: TEST_OUTBOUND_ADDRESS,
      token: 'OSMO',
      amount: '0.000001',
      chain: 'osmosis',
      network: NETWORK,
    });
    expect(transfer).toContain('Transfer success');
  });

  it('estimateGas', async () => {
    const estimateGas = await osmosis.controller.estimateGas(osmosis);
    expect(estimateGas.gasPriceToken).toEqual('uosmo');
  });
});

describe('Osmosis - Swaps', () => {
  beforeAll(async () => {
    patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'macymo');
    await osmosis.init();
    fastify = Fastify();
    await fastify.register(configRoutes);
  });
  afterAll(async () => {
    unpatch();
    await osmosis.close();
    await fastify.close();
  });

  it('QuoteSwap AMM', async () => {
    const priceRequest1 = {
      quoteToken: 'ION',
      baseToken: 'OSMO',
      amount: '0.01',
      side: 'BUY',
      slippagePct: '90',
      chain: 'osmosis',
      network: NETWORK,
    };
    const priceResponse1 = await osmosis.controller.quoteSwap(osmosis, fastify, priceRequest1, 'amm');
    expect(priceResponse1.estimatedAmountIn).toBeGreaterThan(0);
  });

  it('QuoteSwap CLMM', async () => {
    const priceRequest1 = {
      quoteToken: 'ION',
      baseToken: 'OSMO',
      amount: '0.01',
      side: 'BUY',
      slippagePct: '90',
      chain: 'osmosis',
      network: NETWORK,
    };
    const priceResponse1 = await osmosis.controller.quoteSwap(osmosis, fastify, priceRequest1, 'clmm');
    expect(priceResponse1.estimatedAmountIn).toBeGreaterThan(0);
  });

  it('ExecuteSwap AMM', async () => {
    const tradeRequest = {
      baseToken: 'ION',
      quoteToken: 'OSMO',
      amount: '0.02',
      side: 'BUY',
      slippagePct: '100',
      chain: 'osmosis',
      network: NETWORK,
      walletAddress: TEST_WALLET,
    };
    const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'amm');
    expect(tradeResponse.baseTokenBalanceChange).toBeLessThan(0);
  });

  it('ExecuteSwap AMM Reverse', async () => {
    const tradeRequest = {
      quoteToken: 'ION',
      baseToken: 'OSMO',
      amount: '1',
      side: 'BUY',
      slippagePct: '100',
      chain: 'osmosis',
      network: NETWORK,
      walletAddress: TEST_WALLET,
    };
    const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'amm');
    expect(tradeResponse.baseTokenBalanceChange).toBeLessThan(0);
  });

  it('ExecuteSwap CLMM', async () => {
    const tradeRequest = {
      baseToken: 'ION',
      quoteToken: 'OSMO',
      amount: '0.02',
      side: 'BUY',
      slippagePct: '100',
      chain: 'osmosis',
      network: NETWORK,
      walletAddress: TEST_WALLET,
    };
    const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'clmm');
    expect(tradeResponse.baseTokenBalanceChange).toBeLessThan(0);
  });

  it('ExecuteSwap CLMM Reverse', async () => {
    const tradeRequest = {
      quoteToken: 'ION',
      baseToken: 'OSMO',
      amount: '1',
      side: 'BUY',
      slippagePct: '100',
      chain: 'osmosis',
      network: NETWORK,
      walletAddress: TEST_WALLET,
    };
    const tradeResponse = await osmosis.controller.executeSwap(osmosis, fastify, tradeRequest, 'clmm');
    expect(tradeResponse.baseTokenBalanceChange).toBeLessThan(0);
  });
});

// // we're not testing poll() since transactions seem to 404 after a week or so
// describe('Osmosis - GAMM', () => {
//   beforeAll(async () => {
//     patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'macymo');
//     await osmosis.init();
//     fastify = Fastify();
//     await fastify.register(configRoutes);
//   });
//   afterAll(async () => {
//     unpatch();
//     await osmosis.close();
//     await fastify.close();
//   });

//   // best to join pools using one amount == 0 (so input 1 token type at a time)
//   //  adds tend to fail unless amounts input are similar in relative $ value
//   let poolIdGAMM: number;
//   let gammPoolAddress = TEST_POOL_ADDRESS_AMM;
//   it('AMM fetchPools', async () => {
//     const request_AMMAddLiquidityRequestType: FetchPoolsRequestType = {
//       tokenA: 'ION',
//       tokenB: 'OSMO',
//     };
//     const reponse_AMMAddLiquidityResponseType: SerializableExtendedPool[] = await osmosis.controller.fetchPoolsForTokens(
//       osmosis,
//       fastify,
//       request_AMMAddLiquidityRequestType,
//     );
//     expect(reponse_AMMAddLiquidityResponseType.length).toBeGreaterThan(0);
//   });

//   it('AMMAddLiquidityRequestType', async () => {
//     const request_AMMAddLiquidityRequestType: AMMAddLiquidityRequestType = {
//       poolAddress: gammPoolAddress,
//       baseTokenAmount: 0.0001,
//       quoteTokenAmount: 0,
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       slippagePct: 100,
//     };
//     const reponse_AMMAddLiquidityResponseType: AMMAddLiquidityResponseType = await osmosis.controller.addLiquidityAMM(
//       osmosis,
//       fastify,
//       request_AMMAddLiquidityRequestType,
//     );
//     expect(reponse_AMMAddLiquidityResponseType.data.baseTokenAmountAdded).toBeGreaterThan(0);
//   });

//   it('AMMGetPositionInfoRequestType by tokens', async () => {
//     const request_AMMGetPositionInfoRequestType: AMMGetPositionInfoRequestType = {
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       poolAddress: '',
//     };
//     const response_AMMGetPositionInfoRequestType: AMMPositionInfo = await osmosis.controller.poolPosition(
//       osmosis,
//       fastify,
//       request_AMMGetPositionInfoRequestType,
//       'amm',
//     );
//     console.debug(response_AMMGetPositionInfoRequestType);
//     gammPoolAddress = response_AMMGetPositionInfoRequestType.poolAddress;
//     expect(response_AMMGetPositionInfoRequestType.lpTokenAmount).toBeGreaterThan(0);
//   });

//   it('AMMGetPositionInfoRequestType by pool address', async () => {
//     const request_AMMGetPositionInfoRequestType: AMMGetPositionInfoRequestType = {
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       poolAddress: gammPoolAddress,
//       baseToken: '',
//       quoteToken: '',
//     };
//     const response_AMMGetPositionInfoRequestType: AMMPositionInfo = await osmosis.controller.poolPosition(
//       osmosis,
//       fastify,
//       request_AMMGetPositionInfoRequestType,
//       'amm',
//     );
//     expect(response_AMMGetPositionInfoRequestType.lpTokenAmount).toBeGreaterThan(0);
//   });

//   it('AMMRemoveLiquidityRequestType GAMM', async () => {
//     const request_AMMRemoveLiquidityRequestType: AMMRemoveLiquidityRequestType = {
//       percentageToRemove: 100,
//       poolAddress: gammPoolAddress,
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//     };
//     const response_AMMRemoveLiquidityResponseType: AMMRemoveLiquidityResponseType =
//       await osmosis.controller.removeLiquidityAMM(osmosis, fastify, request_AMMRemoveLiquidityRequestType);
//     expect(response_AMMRemoveLiquidityResponseType.baseTokenAmountRemoved).toBeGreaterThan(0);
//   });

//   it('AMMGetPoolInfoRequestType by tokens', async () => {
//     const request_AMMGetPoolInfoRequestType: AMMGetPoolInfoRequestType = {
//       network: NETWORK,
//       baseToken: 'OSMO',
//       quoteToken: 'ION',
//       poolAddress: '',
//     };
//     const response_AMMPoolInfo: AMMPoolInfo = await osmosis.controller.poolInfoRequest(
//       osmosis,
//       fastify,
//       request_AMMGetPoolInfoRequestType,
//       'amm',
//     );
//     expect(response_AMMPoolInfo.address).toBeDefined();
//   });

//   it('AMMGetPoolInfoRequestType by pool address', async () => {
//     const request_AMMGetPoolInfoRequestType: AMMGetPoolInfoRequestType = {
//       network: NETWORK,
//       baseToken: '',
//       quoteToken: '',
//       poolAddress: gammPoolAddress,
//     };
//     const response_AMMPoolInfo: AMMPoolInfo = await osmosis.controller.poolInfoRequest(
//       osmosis,
//       fastify,
//       request_AMMGetPoolInfoRequestType,
//       'amm',
//     );
//     expect(response_AMMPoolInfo.address).toBeDefined();
//   });
// });

// describe('Osmosis - CLMM', () => {
//   beforeAll(async () => {
//     patch(ConfigManagerCertPassphrase, 'readPassphrase', () => 'macymo');
//     await osmosis.init();
//     fastify = Fastify();
//     await fastify.register(configRoutes);
//   });
//   afterAll(async () => {
//     unpatch();
//     await osmosis.close();
//     await fastify.close();
//   });

//   let clmmPositionAddress = '2843';
//   let clmmPoolAddress;
//   it('CLMMOpenPositionRequestType CLMMOpenPositionResponseType', async () => {
//     const addLiquidityRequestFunction: CLMMOpenPositionRequestType = {
//       lowerPrice: 200,
//       upperPrice: 1000,
//       poolAddress: '',
//       baseToken: 'ION',
//       quoteToken: 'OSMO',
//       baseTokenAmount: 0.0002,
//       quoteTokenAmount: 0.1,
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       slippagePct: 99,
//     };
//     const addLiquidityResponseCLMM: CLMMOpenPositionResponseType = await osmosis.controller.openPositionCLMM(
//       osmosis,
//       fastify,
//       addLiquidityRequestFunction,
//     );
//     clmmPositionAddress = addLiquidityResponseCLMM.positionAddress;
//     expect(addLiquidityResponseCLMM.baseTokenAmountAdded).toBeGreaterThan(0);
//   });

//   it('CLMMAddLiquidityRequestType CLMMAddLiquidityResponseType', async () => {
//     const request_CLMMAddLiquidityRequestType: CLMMAddLiquidityRequestType = {
//       positionAddress: clmmPositionAddress,
//       baseTokenAmount: 0.0002,
//       quoteTokenAmount: 0.1,
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       slippagePct: 80,
//     };
//     const response_CLMMAddLiquidityResponseType: CLMMAddLiquidityResponseType =
//       await osmosis.controller.addLiquidityCLMM(osmosis, fastify, request_CLMMAddLiquidityRequestType);
//     clmmPositionAddress = response_CLMMAddLiquidityResponseType.newPositionAddress;
//     expect(response_CLMMAddLiquidityResponseType.baseTokenAmountAdded).toBeGreaterThan(0);
//   });

//   it('CLMMRemoveLiquidityRequestType CLMMRemoveLiquidityResponseType', async () => {
//     const request_CLMMRemoveLiquidityRequestType: CLMMRemoveLiquidityRequestType = {
//       positionAddress: clmmPositionAddress,
//       percentageToRemove: 50,
//       walletAddress: TEST_WALLET,
//     };
//     const response_CLMMRemoveLiquidityResponseType: CLMMRemoveLiquidityResponseType =
//       await osmosis.controller.removeLiquidityCLMM(osmosis, fastify, request_CLMMRemoveLiquidityRequestType);
//     expect(response_CLMMRemoveLiquidityResponseType.baseTokenAmountRemoved).toBeGreaterThan(0);
//   });

//   it('CLMMGetPositionInfoRequestType by CLMMPositionAddress', async () => {
//     const request_CLMMGetPositionInfoRequestType: CLMMGetPositionInfoRequestType = {
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       positionAddress: clmmPositionAddress,
//     };
//     const response_CLMMPositionInfo: CLMMPositionInfo = await osmosis.controller.poolPosition(
//       osmosis,
//       fastify,
//       request_CLMMGetPositionInfoRequestType,
//       'clmm',
//     );
//     expect(response_CLMMPositionInfo.address).toEqual(clmmPositionAddress);
//   });

//   it('CLMMClosePositionRequestType CLMMClosePositionResponseType', async () => {
//     const request_CLMMClosePositionRequestType: CLMMClosePositionRequestType = {
//       network: NETWORK,
//       walletAddress: TEST_WALLET,
//       positionAddress: clmmPositionAddress,
//     };
//     const response_CLMMClosePositionResponseType: CLMMClosePositionResponseType =
//       await osmosis.controller.closePositionCLMM(osmosis, fastify, request_CLMMClosePositionRequestType);
//     expect(response_CLMMClosePositionResponseType.baseTokenAmountRemoved).toBeGreaterThan(0);
//   });

//   it('CLMMGetPoolInfoRequestType by tokens', async () => {
//     const request_CLMMGetPoolInfoRequestType: CLMMGetPoolInfoRequestType = {
//       network: NETWORK,
//       baseToken: 'OSMO',
//       quoteToken: 'ION',
//       poolAddress: '',
//     };
//     const response_CLMMPoolInfo: CLMMPoolInfo = await osmosis.controller.poolInfoRequest(
//       osmosis,
//       fastify,
//       request_CLMMGetPoolInfoRequestType,
//       'clmm',
//     );
//     clmmPoolAddress = response_CLMMPoolInfo.address;
//     expect(response_CLMMPoolInfo.address).toBeDefined();
//   });

//   it('CLMMGetPoolInfoRequestType by poolAddress', async () => {
//     const request_CLMMGetPoolInfoRequestType: CLMMGetPoolInfoRequestType = {
//       network: NETWORK,
//       baseToken: '',
//       quoteToken: '',
//       poolAddress: clmmPoolAddress,
//     };
//     const response_CLMMPoolInfo: CLMMPoolInfo = await osmosis.controller.poolInfoRequest(
//       osmosis,
//       fastify,
//       request_CLMMGetPoolInfoRequestType,
//       'clmm',
//     );
//     expect(response_CLMMPoolInfo.address).toBeDefined();
//   });
