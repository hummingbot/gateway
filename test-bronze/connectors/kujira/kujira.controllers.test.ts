import 'jest-extended';
import { BigNumber } from 'bignumber.js';
import { unpatch } from '../../../test/services/patch';
import { KujiraModel } from '../../../src/connectors/kujira/kujira.model';
import { KujiraConfig } from '../../../src/connectors/kujira/kujira.config';
import {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logRequest as helperLogRequest,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logResponse as helperLogResponse,
  sendRequest as helperSendRequest,
  SendRequestFunction,
  SendRequestOptions,
} from './helpers';
import {
  AllMarketsWithdrawsRequest,
  AllMarketsWithdrawsResponse,
  AsyncFunctionType,
  Balance,
  Balances,
  CancelAllOrdersRequest,
  CancelAllOrdersResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  CancelOrdersRequest,
  CancelOrdersResponse,
  GetAllBalancesRequest,
  GetAllBalancesResponse,
  GetAllMarketsRequest,
  GetAllMarketsResponse,
  GetAllOrderBooksRequest,
  GetAllOrderBooksResponse,
  GetAllTickersRequest,
  GetAllTickersResponse,
  GetAllTokensRequest,
  GetAllTokensResponse,
  GetBalanceRequest,
  GetBalanceResponse,
  GetBalancesRequest,
  GetBalancesResponse,
  GetCurrentBlockRequest,
  GetCurrentBlockResponse,
  GetEstimatedFeesRequest,
  GetEstimatedFeesResponse,
  GetMarketRequest,
  GetMarketResponse,
  GetMarketsRequest,
  GetMarketsResponse,
  GetOrderBookRequest,
  GetOrderBookResponse,
  GetOrderBooksRequest,
  GetOrderBooksResponse,
  GetOrderRequest,
  GetOrderResponse,
  GetOrdersRequest,
  GetOrdersResponse,
  GetRootRequest,
  GetRootResponse,
  GetTickerRequest,
  GetTickerResponse,
  GetTickersRequest,
  GetTickersResponse,
  GetTokenRequest,
  GetTokenResponse,
  GetTokensRequest,
  GetTokensResponse,
  GetTransactionRequest,
  GetTransactionResponse,
  GetTransactionsRequest,
  GetTransactionsResponse,
  GetWalletPublicKeyRequest,
  GetWalletPublicKeyResponse,
  GetWalletsPublicKeysRequest,
  GetWalletsPublicKeysResponse,
  IMap,
  Market,
  MarketId,
  MarketName,
  MarketsWithdrawsFundsResponse,
  MarketsWithdrawsRequest,
  MarketWithdrawRequest,
  MarketWithdrawResponse,
  Order,
  OrderBook,
  OrderClientId,
  OrderFee,
  OrderId,
  OrderMarketName,
  OrderSide,
  OrderStatus,
  OrderType,
  OwnerAddress,
  PlaceOrderRequest,
  PlaceOrderResponse,
  PlaceOrdersRequest,
  PlaceOrdersResponse,
  RequestStrategy,
  RESTfulMethod,
  Ticker,
  TickerPrice,
  Token,
  TokenId,
  TokenName,
  TokenSymbol,
  Transaction,
  TransactionHash,
  Withdraw,
} from '../../../src/connectors/kujira/kujira.types';
import * as KujiraController from '../../../src/connectors/kujira/kujira.controllers';
import { Denom, fin, KUJI, MAINNET, NETWORKS } from 'kujira.js';
// import { addWallet } from '../../../src/services/wallet/wallet.controllers';
// import { AddWalletRequest } from '../../../src/services/wallet/wallet.requests';
import lodash from 'lodash';
import { getNotNullOrThrowError } from '../../../src/connectors/kujira/kujira.helpers';
import {
  createPatches,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enableInputOutputWrapper,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  disableInputOutputWrapper,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enablePatches,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  disablePatches,
  getPatch as helperGetPatch,
  useInputOutputWrapper,
  usePatches,
} from './fixtures/patches/patches';
import express from 'express';
import { Express } from 'express-serve-static-core';
import data from './fixtures/patches/data';

enablePatches();
// disablePatches();

// enableInputOutputWrapper();
disableInputOutputWrapper();

// const requestStrategy = RequestStrategy.RESTful;
const requestStrategy = RequestStrategy.Controller;

let patches: IMap<string, AsyncFunctionType<any, any>>;

if (!usePatches || (usePatches && useInputOutputWrapper)) {
  jest.setTimeout(30 * 60 * 1000);
}

let getPatch: any;

let sendRequest: SendRequestFunction;

let testTitle: string;
let logRequest: (target: any) => void;
let logResponse: (target: any) => void;

let allTokens: any;

let kujira: KujiraModel;

const config = KujiraConfig.config;

const network = NETWORKS[MAINNET].toLowerCase();

const networksPairs: Record<string, fin.Pair> = fin.PAIRS[MAINNET];

const kujiToken = KUJI;

const marketsIds = {
  1: networksPairs[
    'kujira193dzcmy7lwuj4eda3zpwwt9ejal00xva0vawcvhgsyyp5cfh6jyq66wfrf'
  ].address, // KUJI/USK
  2: networksPairs[
    'kujira14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9sl4e867'
  ].address, // KUJI/axlUSDC
  3: networksPairs[
    'kujira1rwx6w02alc4kaz7xpyg3rlxpjl4g63x5jq292mkxgg65zqpn5llq202vh5'
  ].address, // axlUSDC/USK
};

const tokensIdsArray = [
  ...new Set(
    Object.values(marketsIds).flatMap((marketId) => [
      networksPairs[marketId].denoms[0].reference,
      networksPairs[marketId].denoms[1].reference,
    ])
  ),
];

const tokensIds: { [key: number]: string } = {};
const tokensDenoms: { [key: number]: Denom } = {};
for (let i = 0; i < tokensIdsArray.length; i++) {
  tokensIds[i + 1] = tokensIdsArray[i];
  tokensDenoms[i + 1] = Denom.from(tokensIdsArray[i]);
}

const transactionsHashes = {
  1: '34F53728E0A3E877A2140D21D69C0E4DC62600A061CD9B7677B43DCCE49B83F4',
  2: '8C80FA65ED1CAD8B79D45AEA6593E1A0E17BAEFBEF69D9677CD7DD10045FF283',
  3: '445FDABE49898EA2B6503D7741B779C527CDD8FAB7E75C095F5CA3A0BB28AD0C',
};

const orders: IMap<OrderClientId, Order> = IMap<
  OrderClientId,
  Order
>().asMutable();

let userBalances: Balances;

let lastPayedFeeSum: OrderFee = BigNumber(0);

const getOrder = (clientId: OrderClientId): Order => {
  return getOrders([clientId]).first();
};

const getOrders = (clientIds: OrderClientId[]): IMap<OrderClientId, Order> => {
  const output = IMap<OrderClientId, Order>().asMutable();
  for (const clientId of clientIds) {
    output.set(clientId, getNotNullOrThrowError<Order>(orders.get(clientId)));
  }

  return output;
};

let ownerAddress: OwnerAddress;

let expressApp: Express;

const mnemonic: string = getNotNullOrThrowError<string>(
  usePatches && !useInputOutputWrapper
    ? data.get('KUJIRA_MNEMONIC')
    : process.env.TEST_KUJIRA_MNEMONIC
);

beforeAll(async () => {
  config.prefix = 'kujira';
  config.accountNumber = 0;
  config.gasPrice = BigNumber(0.00125);
  config.gasPriceSuffix = 'ukuji';
  config.gasLimitEstimate = BigNumber(0.009147);
  config.orderBook.offset = 0;
  config.orderBook.limit = 255;
  config.orders.create.fee = 'auto';
  config.orders.create.maxPerTransaction = 8;
  config.orders.open.limit = 255;
  config.orders.filled.limit = 255;
  config.orders.cancel.maxPerTransaction = 25;
  config.tokens.allowed = null;
  config.tokens.disallowed = null;
  config.markets.allowed = ['KUJI/USK', 'KUJI/axlUSDC', 'axlUSDC/USK'];
  config.markets.disallowed = null;
  config.transactions.merge.createOrders = true;
  config.transactions.merge.cancelOrders = true;
  config.transactions.merge.settleFunds = true;
  config.retry.all.maxNumberOfRetries = 3;
  config.retry.all.delayBetweenRetries = 1000;
  config.timeout.all = 60000;
  config.parallel.all.batchSize = 100;
  config.parallel.all.delayBetweenBatches = 200;

  expressApp = express();
  expressApp.use(express.json());

  // const accountNumber: number = getNotNullOrThrowError<number>(
  //   Number(
  //     usePatches && !useInputOutputWrapper
  //       ? data.get('KUJIRA_ACCOUNT_NUMBER')
  //       : process.env.TEST_KUJIRA_ACCOUNT_NUMBER
  //   ) || config.accountNumber
  // );

  kujira = KujiraModel.getInstance(config.chain, network);

  patches = await createPatches(kujira);

  getPatch = <R = AsyncFunctionType<any, any>>(keyPath: string[]): R =>
    helperGetPatch<R>(patches, keyPath);

  // await getPatch(['global', 'fetch'])('beforeAll');
  await getPatch(['kujira', 'getFastestRpc'])('beforeAll');
  await getPatch(['kujira', 'kujiraGetHttpBatchClient'])('beforeAll');
  await getPatch(['kujira', 'kujiraGetTendermint34Client'])('beforeAll');
  await getPatch(['kujira', 'kujiraGetKujiraQueryClient'])('beforeAll');
  await getPatch(['kujira', 'kujiraGetStargateClient'])('beforeAll');
  await getPatch(['kujira', 'kujiraGetBasicMarkets'])('beforeAll');

  await kujira.init();

  ownerAddress = data.get('KUJIRA_PUBLIC_KEY');

  // ownerAddress = (
  //   await addWallet({
  //     chain: config.chain,
  //     network: network,
  //     privateKey: mnemonic,
  //     address: undefined,
  //     accountId: accountNumber,
  //   } as AddWalletRequest)
  // ).address;

  // Order  |  Type  |  Side  | Market (ID/Name)
  // ====== + ====== + ====== + ================
  //  #01   | LIMIT  |  BUY   | 1 / KUJI/DEMO
  //  #02   | LIMIT  |  SELL  | 2 / KUJI/USK
  //  #03   | MARKET |  SELL  | 3 / DEMO/USK
  //  #04   | LIMIT  |  BUY   | 1 / KUJI/DEMO
  //  #05   | LIMIT  |  SELL  | 2 / KUJI/USK
  //  #06   | LIMIT  |  BUY   | 3 / DEMO/USK
  //  #07   | LIMIT  |  SELL  | 1 / KUJI/DEMO
  //  #08   | LIMIT  |  BUY   | 2 / KUJI/USK
  //  #09   | LIMIT  |  SELL  | 3 / DEMO/USK
  //  #10   | MARKET |  BUY   | 1 / KUJI/DEMO
  //  #11   | MARKET |  SELL  | 2 / KUJI/USK
  //  #12   | LIMIT  |  BUY   | 3 / DEMO/USK
  //  #13   | LIMIT  |  SELL  | 1 / KUJI/DEMO

  orders.set('1', {
    id: undefined,
    clientId: '1',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[1],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(0.001),
    amount: BigNumber(0.1),
    side: OrderSide.BUY,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('2', {
    id: undefined,
    clientId: '2',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[2],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: undefined,
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('3', {
    id: undefined,
    clientId: '3',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[3],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: undefined,
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.MARKET,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('4', {
    id: undefined,
    clientId: '4',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[1],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(0.001),
    amount: BigNumber(0.1),
    side: OrderSide.BUY,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('5', {
    id: undefined,
    clientId: '5',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[2],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(999.999),
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('6', {
    id: undefined,
    clientId: '6',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[3],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: undefined,
    amount: BigNumber(0.1),
    side: OrderSide.BUY,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('7', {
    id: undefined,
    clientId: '7',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[1],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: undefined,
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('8', {
    id: undefined,
    clientId: '8',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[2],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(0.001),
    amount: BigNumber(0.1),
    side: OrderSide.BUY,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('9', {
    id: undefined,
    clientId: '9',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[3],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(999.999),
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('10', {
    id: undefined,
    clientId: '10',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[1],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: undefined,
    amount: BigNumber(0.1),
    side: OrderSide.BUY,
    status: undefined,
    type: OrderType.MARKET,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('11', {
    id: undefined,
    clientId: '11',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[2],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: undefined,
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.MARKET,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('12', {
    id: undefined,
    clientId: '12',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[3],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(0.001),
    amount: BigNumber(0.1),
    side: OrderSide.BUY,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });

  orders.set('13', {
    id: undefined,
    clientId: '13',
    marketName: undefined as unknown as OrderMarketName,
    marketId: marketsIds[1],
    market: undefined as unknown as Market,
    ownerAddress: ownerAddress,
    payerAddress: ownerAddress,
    price: BigNumber(999.99),
    amount: BigNumber(0.1),
    side: OrderSide.SELL,
    status: undefined,
    type: OrderType.LIMIT,
    fee: undefined,
    fillingTimestamp: undefined,
    hashes: undefined,
  });
});

beforeEach(async () => {
  sendRequest = <R>(options: SendRequestOptions<R>) => {
    options.strategy = options.strategy || requestStrategy;
    options.RESTExpress = options.RESTExpress || expressApp;
    options.RESTRoute = `/chain/kujira${options.RESTRoute}`;
    options.model = options.model || kujira;

    return helperSendRequest(options);
  };

  testTitle = expect.getState().currentTestName;
  // logRequest = (target: any) => helperLogRequest(target, testTitle);
  // logResponse = (target: any) => helperLogResponse(target, testTitle);

  logRequest = (_target: any) => {
    return;
  };
  logResponse = (_target: any) => {
    return;
  };

  await getPatch(['kujira', 'decryptWallet'])(testTitle);
  await getPatch(['kujira', 'kujiraFinClientWithdrawOrders'])(testTitle);
  await getPatch(['kujira', 'kujiraGetBasicMarkets'])(testTitle);
  await getPatch(['kujira', 'kujiraGetBasicTokens'])(testTitle);
  await getPatch(['kujira', 'kujiraGetSigningCosmWasmClient'])(testTitle);
  await getPatch(['kujira', 'kujiraGetSigningStargateClient'])(testTitle);
  await getPatch(['kujira', 'kujiraQueryClientWasmQueryContractSmart'])(
    testTitle
  );
  await getPatch(['kujira', 'kujiraSigningStargateClientSignAndBroadcast'])(
    testTitle
  );
  await getPatch(['kujira', 'kujiraStargateClientGetAllBalances'])(testTitle);
  await getPatch(['kujira', 'kujiraStargateClientGetBalanceStaked'])(testTitle);
  await getPatch(['kujira', 'kujiraStargateClientGetHeight'])(testTitle);
  await getPatch(['kujira', 'kujiraStargateClientGetTx'])(testTitle);
});

afterEach(() => {
  unpatch();
});

describe('Kujira', () => {
  const commonRequestBody = {
    chain: config.chain,
    network: network,
    connector: config.connector,
  };

  describe('Root', () => {
    it('Root Info', async () => {
      const request = {
        ...commonRequestBody,
      } as GetRootRequest;

      logRequest(request);

      const response = await sendRequest<GetRootResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/',
        RESTRequest: request,
        controllerFunction: KujiraController.getRoot,
      });

      const responseBody = response.body as GetRootResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeEmpty();
      expect(responseBody.chain).toBe(config.chain);
      expect(responseBody.network).toBe(network);
      expect(responseBody.connector).toBe(config.connector);
      expect(responseBody.connection).toBe(true);
      expect(responseBody.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Block Hashes', () => {
    it('Get Current Block', async () => {
      const request = {
        ...commonRequestBody,
      } as GetCurrentBlockRequest;

      logRequest(request);

      const response = await sendRequest<GetCurrentBlockResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/block/current',
        RESTRequest: request,
        controllerFunction: KujiraController.getCurrentBlock,
      });

      const responseBody = response.body as GetCurrentBlockResponse;

      logResponse(responseBody);

      expect(responseBody).toBeGreaterThan(0);
    });
  });

  describe('Fees', () => {
    it('Estimated Fees', async () => {
      const request = {
        ...commonRequestBody,
      } as GetEstimatedFeesRequest;

      logRequest(request);

      const response = await sendRequest<GetEstimatedFeesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/fees/estimated',
        RESTRequest: request,
        controllerFunction: KujiraController.getEstimatedFees,
      });

      const responseBody = response.body as GetEstimatedFeesResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeEmpty();
      expect(responseBody.token).toBe(KUJI.symbol);
      expect(BigNumber(responseBody.price).gte(0)).toBeTrue();
      expect(BigNumber(responseBody.limit).gte(0)).toBeTrue();
      expect(BigNumber(responseBody.cost).gte(0)).toBeTrue();
    });
  });

  describe('Tokens', () => {
    it('Get token 1 by id', async () => {
      const target = tokensIds[1];

      const requestBody = {
        id: target,
      } as GetTokenRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTokenResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/token',
        RESTRequest: request,
        controllerFunction: KujiraController.getToken,
      });

      const responseBody = response.body as GetTokenResponse;

      logResponse(responseBody);

      const targetDenom = Denom.from(target);

      expect(responseBody).not.toBeEmpty();
      expect(responseBody.id).toBe(request.id);
      expect(responseBody.symbol).toBe(targetDenom.symbol);
      expect(responseBody.decimals).toBe(targetDenom.decimals);
    });

    it('Get token 1 by name', async () => {
      const target = Denom.from(tokensIds[1]);

      const requestBody = {
        name: target.symbol,
      } as GetTokenRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTokenResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/token',
        RESTRequest: request,
        controllerFunction: KujiraController.getToken,
      });

      const responseBody = response.body as GetTokenResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeEmpty();
      expect(responseBody.id).toBe(target.reference);
      expect(responseBody.name).toBe(requestBody.name);
      expect(responseBody.symbol).toBe(target.symbol);
      expect(responseBody.decimals).toBe(target.decimals);
    });

    it('Get token 1 by symbol', async () => {
      const target = Denom.from(tokensIds[1]);

      const requestBody = {
        symbol: target.symbol,
      } as GetTokenRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTokenResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/token',
        RESTRequest: request,
        controllerFunction: KujiraController.getToken,
      });

      const responseBody = response.body as GetTokenResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeEmpty();
      expect(responseBody.id).toBe(target.reference);
      expect(responseBody.symbol).toBe(requestBody.symbol);
      expect(responseBody.decimals).toBe(target.decimals);
    });

    it('Get tokens 2 and 3 by ids', async () => {
      const requestBody = {
        ids: [tokensIds[2], tokensIds[3]],
      } as GetTokensRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTokensResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/tokens',
        RESTRequest: request,
        controllerFunction: KujiraController.getTokens,
      });

      const responseBody = IMap(response.body) as GetTokensResponse as IMap<
        TokenId,
        Token
      >;

      logResponse(responseBody);

      expect(responseBody.size).toBe(requestBody.ids?.length);

      for (const token of responseBody.values()) {
        const targetToken = Denom.from(token.id);
        expect(token).not.toBeEmpty();
        expect(token.id).toBe(targetToken.reference);
        expect(token.symbol).toBe(targetToken.symbol);
        expect(token.decimals).toBe(targetToken.decimals);
      }

      for (const tokenId of getNotNullOrThrowError<TokenId[]>(
        requestBody.ids
      )) {
        const token = Denom.from(tokenId);
        const targetToken = getNotNullOrThrowError<Token>(
          responseBody.get(tokenId)
        );
        expect(targetToken).not.toBeEmpty();
        expect(targetToken.id).toBe(token.reference);
        expect(targetToken.symbol).toBe(token.symbol);
        expect(targetToken.decimals).toBe(token.decimals);
      }
    });

    it('Get tokens 2 and 3 by names', async () => {
      const targetsIds = [tokensIds[2], tokensIds[3]];
      const targetsDenoms: Denom[] = [];
      for (const targetId of targetsIds) {
        targetsDenoms.push(Denom.from(targetId));
      }

      const requestBody = {
        names: [targetsDenoms[0].symbol, targetsDenoms[1].symbol],
      } as GetTokensRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTokensResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/tokens',
        RESTRequest: request,
        controllerFunction: KujiraController.getTokens,
      });

      const responseBody = IMap(response.body) as GetTokensResponse as IMap<
        TokenId,
        Token
      >;

      logResponse(responseBody);

      expect(responseBody.size).toBe(requestBody.names?.length);

      for (const token of responseBody.values()) {
        const targetToken = Denom.from(token.id);
        expect(token).not.toBeEmpty();
        expect(token.id).toBe(targetToken.reference);
        expect(token.symbol).toBe(targetToken.symbol);
        expect(token.decimals).toBe(targetToken.decimals);
      }

      for (const tokenName of getNotNullOrThrowError<TokenName[]>(
        requestBody.names
      )) {
        const token = Denom.from(tokenName);
        const targetToken = getNotNullOrThrowError<Token>(
          responseBody.filter((item: Token) => item.name == tokenName).first()
        );
        expect(targetToken).not.toBeEmpty();
        expect(targetToken.symbol).toBe(token.reference);
        expect(targetToken.decimals).toBe(token.decimals);
      }
    });

    it('Get tokens 2 and 3 by symbols', async () => {
      const targetsIds = [tokensIds[2], tokensIds[3]];
      const targetsDenoms: Denom[] = [];
      for (const targetId of targetsIds) {
        targetsDenoms.push(Denom.from(targetId));
      }

      const requestBody = {
        symbols: [targetsDenoms[0].symbol, targetsDenoms[1].symbol],
      } as GetTokensRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTokensResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/tokens',
        RESTRequest: request,
        controllerFunction: KujiraController.getTokens,
      });

      const responseBody = IMap(response.body) as GetTokensResponse as IMap<
        TokenId,
        Token
      >;

      logResponse(responseBody);

      expect(responseBody.size).toBe(requestBody.symbols?.length);

      for (const token of responseBody.values()) {
        const targetToken = Denom.from(token.id);
        expect(token).not.toBeEmpty();
        expect(token.id).toBe(targetToken.reference);
        expect(token.symbol).toBe(targetToken.symbol);
        expect(token.decimals).toBe(targetToken.decimals);
      }

      for (const tokenName of getNotNullOrThrowError<TokenSymbol[]>(
        requestBody.symbols
      )) {
        const token = Denom.from(tokenName);
        const targetToken = getNotNullOrThrowError<Token>(
          responseBody.filter((item: Token) => item.name == tokenName).first()
        );
        expect(targetToken).not.toBeEmpty();
        expect(targetToken.symbol).toBe(token.reference);
        expect(targetToken.decimals).toBe(token.decimals);
      }
    });

    it('Get all tokens', async () => {
      const requestBody = {} as GetAllTokensRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetAllTokensResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/tokens/all',
        RESTRequest: request,
        controllerFunction: KujiraController.getAllTokens,
      });

      allTokens = IMap(response.body) as GetAllTokensResponse as IMap<
        TokenId,
        Token
      >;

      logResponse(allTokens);

      for (const tokenId of Object.values(tokensIds)) {
        const token = Denom.from(tokenId);
        const targetToken = getNotNullOrThrowError<Token>(
          allTokens.filter((item: Token) => item.id == tokenId).toArray()[0][1]
        );
        expect(targetToken).not.toBeEmpty();
        expect(targetToken.id).toBe(token.reference);
        expect(targetToken.symbol).toBe(token.symbol);
        expect(targetToken.decimals).toBe(token.decimals);
      }
    });
  });

  describe('Markets', () => {
    it('Get market 1 by id', async () => {
      const requestBody = {
        id: marketsIds[1],
      } as GetMarketRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetMarketResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/market',
        RESTRequest: request,
        controllerFunction: KujiraController.getMarket,
      });

      const responseBody = response.body as GetMarketResponse;

      logResponse(responseBody);

      const networkPair = networksPairs[marketsIds[1]];
      expect(responseBody.id).toEqual(marketsIds[1]);
      expect([responseBody.baseToken.id, responseBody.quoteToken.id]).toEqual([
        networkPair.denoms[0].reference,
        networkPair.denoms[1].reference,
      ]);
      expect(responseBody.precision).toEqual(
        'decimal_places' in networkPair.precision
          ? networkPair.precision.decimal_places
          : 'significant_figures' in networkPair.precision
          ? networkPair.precision.significant_figures
          : undefined
      );
    });

    it('Get market 1 by name', async () => {
      const networkPair = networksPairs[marketsIds[1]];

      const requestBody = {
        name: networkPair.denoms[0].symbol + '/' + networkPair.denoms[1].symbol,
      } as GetMarketRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetMarketResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/market',
        RESTRequest: request,
        controllerFunction: KujiraController.getMarket,
      });

      const responseBody = response.body as GetMarketResponse;

      logResponse(responseBody);

      expect(responseBody.id).toEqual(marketsIds[1]);
      expect([responseBody.baseToken.id, responseBody.quoteToken.id]).toEqual([
        networkPair.denoms[0].reference,
        networkPair.denoms[1].reference,
      ]);
      expect(responseBody.precision).toEqual(
        'decimal_places' in networkPair.precision
          ? networkPair.precision.decimal_places
          : 'significant_figures' in networkPair.precision
          ? networkPair.precision.significant_figures
          : undefined
      );
    });

    it('Get markets 2 and 3 by ids', async () => {
      const targetMarketIds = [marketsIds[2], marketsIds[3]];

      const requestBody = {
        ids: targetMarketIds,
      } as GetMarketsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetMarketsResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/markets',
        RESTRequest: request,
        controllerFunction: KujiraController.getMarkets,
      });

      const responseBody = IMap(response.body) as GetMarketsResponse as IMap<
        MarketId,
        Market
      >;

      logResponse(responseBody);

      expect(targetMarketIds.length).toEqual(responseBody.size);

      targetMarketIds.forEach((marketId) => {
        const networkPair = networksPairs[marketId];
        const responseToken = getNotNullOrThrowError<Market>(
          responseBody.get(marketId)
        );

        expect(responseToken.id).toEqual(marketId);
        expect([
          responseToken.baseToken.id,
          responseToken.quoteToken.id,
        ]).toEqual([
          networkPair.denoms[0].reference,
          networkPair.denoms[1].reference,
        ]);
        expect(responseToken.precision).toEqual(
          'decimal_places' in networkPair.precision
            ? networkPair.precision.decimal_places
            : 'significant_figures' in networkPair.precision
            ? networkPair.precision.significant_figures
            : undefined
        );
      });
    });

    it('Get markets 2 and 3 by names', async () => {
      const targetMarketIds = [marketsIds[2], marketsIds[3]];
      const targetNames = [];

      for (const target of targetMarketIds.values()) {
        targetNames.push(
          networksPairs[target].denoms[0].symbol +
            '/' +
            networksPairs[target].denoms[1].symbol
        );
      }

      const requestBody = {
        names: targetNames,
      } as GetMarketsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetMarketsResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/markets',
        RESTRequest: request,
        controllerFunction: KujiraController.getMarkets,
      });

      const responseBody = IMap(response.body) as GetMarketsResponse as IMap<
        MarketId,
        Market
      >;

      logResponse(responseBody);

      expect(targetMarketIds.length).toEqual(responseBody.size);

      for (const target of targetMarketIds) {
        const networkPair = networksPairs[target];
        const responseToken = getNotNullOrThrowError<Market>(
          responseBody.get(target)
        );

        expect(responseToken.id).toEqual(target);
        expect([
          responseToken.baseToken.id,
          responseToken.quoteToken.id,
        ]).toEqual([
          networkPair.denoms[0].reference,
          networkPair.denoms[1].reference,
        ]);
        expect(responseToken.precision).toEqual(
          'decimal_places' in networkPair.precision
            ? networkPair.precision.decimal_places
            : 'significant_figures' in networkPair.precision
            ? networkPair.precision.significant_figures
            : undefined
        );
      }
    });

    it('Get all markets', async () => {
      const targetMarketIds = [marketsIds[1], marketsIds[2], marketsIds[3]];
      const requestBody = {} as GetAllMarketsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetAllMarketsResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/markets/all',
        RESTRequest: request,
        controllerFunction: KujiraController.getAllMarkets,
      });

      const responseBody = IMap(response.body) as GetAllMarketsResponse as IMap<
        MarketId,
        Market
      >;

      logResponse(responseBody);

      targetMarketIds.forEach((marketId) => {
        const networkPair = networksPairs[marketId];
        const responseToken = getNotNullOrThrowError<Market>(
          responseBody.get(marketId)
        );

        expect(responseToken.id).toEqual(marketId);
        expect([
          responseToken.baseToken.id,
          responseToken.quoteToken.id,
        ]).toEqual([
          networkPair.denoms[0].reference,
          networkPair.denoms[1].reference,
        ]);
        expect(responseToken.precision).toEqual(
          'decimal_places' in networkPair.precision
            ? networkPair.precision.decimal_places
            : 'significant_figures' in networkPair.precision
            ? networkPair.precision.significant_figures
            : undefined
        );
      });
    });
  });

  describe('Order books', () => {
    it('Get order book from market 1 by id', async () => {
      const requestBody = {
        marketId: marketsIds[1],
      } as GetOrderBookRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderBookResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orderBook',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrderBook,
      });

      const responseBody = response.body as GetOrderBookResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeUndefined();
      expect(responseBody.market.id).toBe(request.marketId);
      expect(responseBody.bids).not.toBeUndefined();
      expect(responseBody.asks).not.toBeUndefined();

      if (response.body.bids.size) {
        expect(responseBody.bestBid).not.toBeUndefined();
      }

      if (response.body.asks.size) {
        expect(responseBody.bestAsk).not.toBeUndefined();
      }
    });

    it('Get order book from market 1 by name', async () => {
      const networkPair = networksPairs[marketsIds[1]];

      const requestBody = {
        marketName:
          networkPair.denoms[0].symbol + '/' + networkPair.denoms[1].symbol,
      } as GetOrderBookRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderBookResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orderBook',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrderBook,
      });

      const responseBody = response.body as GetOrderBookResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeUndefined();
      expect(responseBody.market.name).toBe(request.marketName);
      expect(responseBody.market.id).toBe(marketsIds[1]);
      expect(responseBody.bids).not.toBeUndefined();
      expect(responseBody.asks).not.toBeUndefined();

      if (response.body.bids.size) {
        expect(responseBody.bestBid).not.toBeUndefined();
      }

      if (response.body.asks.size) {
        expect(responseBody.bestAsk).not.toBeUndefined();
      }
    });

    it('Get order books from the markets 2 and 3 by ids', async () => {
      const requestBody = {
        marketIds: [marketsIds[2], marketsIds[3]],
      } as GetOrderBooksRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderBooksResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orderBooks',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrderBooks,
      });

      const responseBody = IMap(response.body) as GetOrderBooksResponse;

      logResponse(responseBody);

      expect(responseBody.size).toEqual(requestBody.marketIds?.length);

      for (const marketId of getNotNullOrThrowError<MarketId[]>(
        request.marketIds
      )) {
        const orderBook = getNotNullOrThrowError<OrderBook>(
          responseBody.get(marketId)
        );
        expect(orderBook.market.id).toBe(marketId);
        expect(orderBook.bids).not.toBeUndefined();
        expect(orderBook.asks).not.toBeUndefined();

        if (orderBook.bids.size) {
          expect(orderBook.bestBid).not.toBeUndefined();
        }

        if (orderBook.asks.size) {
          expect(orderBook.bestAsk).not.toBeUndefined();
        }
      }
    });

    it('Get order books from the markets 2 and 3 by names', async () => {
      const targetMarketIds = [marketsIds[2], marketsIds[3]];
      const targetNames = [];

      for (const target of targetMarketIds.values()) {
        targetNames.push(
          networksPairs[target].denoms[0].symbol +
            '/' +
            networksPairs[target].denoms[1].symbol
        );
      }

      const requestBody = {
        marketNames: targetNames,
      } as GetOrderBooksRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderBooksResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orderBooks',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrderBooks,
      });

      const responseBody = IMap(response.body) as GetOrderBooksResponse;

      logResponse(responseBody);

      expect(responseBody.size).toEqual(requestBody.marketNames?.length);

      for (const marketName of getNotNullOrThrowError<MarketName[]>(
        request.marketNames
      )) {
        const orderBook = getNotNullOrThrowError<OrderBook>(
          responseBody.get(marketName)
        );
        expect(orderBook.market.name).toBe(marketName);
        expect(orderBook.bids).not.toBeUndefined();
        expect(orderBook.asks).not.toBeUndefined();

        if (orderBook.bids.size) {
          expect(orderBook.bestBid).not.toBeUndefined();
        }

        if (orderBook.asks.size) {
          expect(orderBook.bestAsk).not.toBeUndefined();
        }
      }
    });

    it('Get all order books', async () => {
      const requestBody = {} as GetAllOrderBooksRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetAllOrderBooksResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orderBooks/all',
        RESTRequest: request,
        controllerFunction: KujiraController.getAllOrderBooks,
      });

      const responseBody = IMap(response.body) as GetAllOrderBooksResponse;

      logResponse(responseBody);

      Object.values(marketsIds).forEach((marketId) => {
        const orderBook = getNotNullOrThrowError<OrderBook>(
          responseBody.get(marketId)
        );
        expect(orderBook.market.id).toBe(marketId);
        expect(orderBook.bids).not.toBeUndefined();
        expect(orderBook.asks).not.toBeUndefined();

        if (orderBook.bids.size) {
          expect(orderBook.bestBid).not.toBeUndefined();
        }

        if (orderBook.asks.size) {
          expect(orderBook.bestAsk).not.toBeUndefined();
        }
      });
    });
  });

  describe('Tickers', () => {
    it('Get ticker from market 1 by id', async () => {
      const requestBody = {
        marketId: marketsIds[1],
      } as GetTickerRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTickerResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/ticker',
        RESTRequest: request,
        controllerFunction: KujiraController.getTicker,
      });

      const responseBody = response.body as GetTickerResponse;

      logResponse(responseBody);

      expect(responseBody.market.id).toEqual(marketsIds[1]);

      const price = BigNumber(
        getNotNullOrThrowError<TickerPrice>(responseBody.price)
      );

      if (price.isNaN()) {
        expect(price).toBeNaN();
      } else {
        expect(price.gt(0)).toBeTrue();
      }
    });

    it('Get ticker from market 1 by name', async () => {
      const networkPair = networksPairs[marketsIds[1]];

      const requestBody = {
        marketName:
          networkPair.denoms[0].symbol + '/' + networkPair.denoms[1].symbol,
      } as GetTickerRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      const response = await sendRequest<GetTickerResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/ticker',
        RESTRequest: request,
        controllerFunction: KujiraController.getTicker,
      });

      const responseBody = response.body as GetTickerResponse;

      logResponse(responseBody);

      expect(responseBody.market.name).toEqual(request.marketName);
      expect(responseBody.market.id).toEqual(marketsIds[1]);

      const price = BigNumber(
        getNotNullOrThrowError<TickerPrice>(responseBody.price)
      );

      if (price.isNaN()) {
        expect(price).toBeNaN();
      } else {
        expect(price.gt(0)).toBeTrue();
      }

      expect(responseBody.timestamp).toBeGreaterThan(0);
    });

    it('Get tickers from markets 2 and 3 by ids', async () => {
      const targetMarketsIds = [marketsIds[2], marketsIds[3]];
      const requestBody = {
        marketIds: targetMarketsIds,
      } as GetTickersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTickersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/tickers',
        RESTRequest: request,
        controllerFunction: KujiraController.getTickers,
      });

      const responseBody = IMap(response.body) as GetTickersResponse;

      logResponse(responseBody);

      targetMarketsIds.forEach((marketId) => {
        const ticker = getNotNullOrThrowError<Ticker>(
          responseBody.get(marketId)
        );
        expect(ticker.market.id).toEqual(marketId);

        const price = BigNumber(
          getNotNullOrThrowError<TickerPrice>(ticker.price)
        );

        if (price.isNaN()) {
          expect(price).toBeNaN();
        } else {
          expect(price.gt(0)).toBeTrue();
        }

        expect(ticker.timestamp).toBeGreaterThan(0);
      });
    });

    it('Get tickers from markets 2 and 3 by names', async () => {
      const targetMarketIds = [marketsIds[2], marketsIds[3]];
      const targetNames = [];

      for (const target of targetMarketIds.values()) {
        targetNames.push(
          networksPairs[target].denoms[0].symbol +
            '/' +
            networksPairs[target].denoms[1].symbol
        );
      }
      const requestBody = {
        marketNames: targetNames,
      } as GetTickersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTickersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/tickers',
        RESTRequest: request,
        controllerFunction: KujiraController.getTickers,
      });

      const responseBody = IMap(response.body) as GetTickersResponse;

      logResponse(responseBody);

      for (const marketName of targetNames.values()) {
        const ticker = getNotNullOrThrowError<Ticker>(
          responseBody.get(marketName)
        );
        expect(ticker.market.name).toEqual(marketName);

        const price = BigNumber(
          getNotNullOrThrowError<TickerPrice>(ticker.price)
        );

        if (price.isNaN()) {
          expect(price).toBeNaN();
        } else {
          expect(price.gt(0)).toBeTrue();
        }

        expect(ticker.timestamp).toBeGreaterThan(0);
      }
    });

    it('Get all tickers', async () => {
      const targetMarketsIds = [marketsIds[1], marketsIds[2], marketsIds[3]];
      const requestBody = {} as GetAllTickersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetAllTickersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/ticker/all',
        RESTRequest: request,
        controllerFunction: KujiraController.getAllTickers,
      });

      const responseBody = IMap(response.body) as GetAllTickersResponse;

      logResponse(responseBody);

      targetMarketsIds.forEach((marketId) => {
        const ticker = getNotNullOrThrowError<Ticker>(
          responseBody.get(marketId)
        );
        expect(ticker.market.id).toEqual(marketId);

        const price = BigNumber(
          getNotNullOrThrowError<TickerPrice>(ticker.price)
        );

        if (price.isNaN()) {
          expect(price).toBeNaN();
        } else {
          expect(price.gt(0)).toBeTrue();
        }

        expect(ticker.timestamp).toBeGreaterThan(0);
      });
    });
  });

  describe('User', () => {
    it('Get balance of token 1 by id', async () => {
      const requestBody = {
        tokenId: tokensDenoms[1].reference,
        ownerAddress: ownerAddress,
      } as GetBalanceRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalanceResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balance',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalance,
      });

      const responseBody = response.body as GetBalanceResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeUndefined();
      expect((responseBody.token as Token).id).toBe(requestBody.tokenId);
    });

    it('Get balance of token 1 by symbol', async () => {
      const requestBody = {
        tokenSymbol: tokensDenoms[1].symbol,
        ownerAddress: ownerAddress,
      } as GetBalanceRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalanceResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balance',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalance,
      });

      const responseBody = response.body as GetBalanceResponse;

      logResponse(responseBody);

      expect(responseBody).not.toBeUndefined();
      expect(getNotNullOrThrowError<any>(responseBody.token).symbol).toBe(
        request.tokenSymbol
      );
    });

    it('Get balances of tokens 2 and 3 by ids', async () => {
      const requestBody = {
        tokenIds: [tokensIds[2], tokensIds[3]],
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      expect(IMap(responseBody.tokens).size).toEqual(request.tokenIds?.length);

      for (const tokenId of getNotNullOrThrowError<TokenId[]>(
        request.tokenIds
      )) {
        const balance = getNotNullOrThrowError<Balance>(
          IMap(responseBody.tokens).get(tokenId)
        );
        expect(balance).not.toBeUndefined();
        expect((balance.token as Token).id).toBe(tokenId);
      }
    });

    it('Get balances of tokens 2 and 3 by symbols', async () => {
      const targetsSymbols: TokenSymbol[] = [
        tokensDenoms[2].symbol,
        tokensDenoms[3].symbol,
      ];

      const requestBody = {
        tokenSymbols: targetsSymbols,
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      expect(IMap(responseBody.tokens).size).toEqual(
        request.tokenSymbols?.length
      );

      for (const tokenSymbol of getNotNullOrThrowError<TokenSymbol[]>(
        requestBody.tokenSymbols
      )) {
        const balance = getNotNullOrThrowError<Balance>(
          IMap(responseBody.tokens)
            .filter(
              (token) =>
                getNotNullOrThrowError<Token>(token.token)?.symbol ==
                tokenSymbol
            )
            .first()
        );
        expect(balance).not.toBeUndefined();
        expect(getNotNullOrThrowError<Token>(balance.token)?.symbol).toBe(
          tokenSymbol
        );
      }
    });

    it('Get all balances', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
      } as GetAllBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetAllBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances/all',
        RESTRequest: request,
        controllerFunction: KujiraController.getAllBalances,
      });

      const responseBody = response.body as GetAllBalancesResponse;

      logResponse(responseBody);

      Object.values(tokensIds).forEach((tokenId) => {
        const balance = getNotNullOrThrowError<Balance>(
          IMap(responseBody.tokens).get(tokenId)
        );
        expect(balance).not.toBeUndefined();
        expect((balance.token as Token).id).toBe(tokenId);
      });
    });
  });

  describe('Transactions', () => {
    it('Get transaction 1', async () => {
      const requestBody = {
        hash: transactionsHashes[1],
      } as GetTransactionRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTransactionResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/transaction',
        RESTRequest: request,
        controllerFunction: KujiraController.getTransaction,
      });

      const responseBody = response.body as GetTransactionResponse;

      logResponse(responseBody);

      expect(responseBody.hash).toEqual(request.hash);
      expect(responseBody.blockNumber).toBeGreaterThan(0);
      expect(responseBody.gasUsed).toBeGreaterThan(0);
      expect(responseBody.gasWanted).toBeGreaterThan(0);
      expect(responseBody.code).toBe(0);
      expect(responseBody.data).toContain('retract_orders');
      expect(responseBody.data).toContain('order_idxs');
    });

    it('Get transactions 2 and 3', async () => {
      const requestBody = {
        hashes: [transactionsHashes[2], transactionsHashes[3]],
      } as GetTransactionsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetTransactionsResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/transactions',
        RESTRequest: request,
        controllerFunction: KujiraController.getTransactions,
      });

      const responseBody = IMap<TransactionHash, Transaction>(
        response.body
      ) as GetTransactionsResponse;

      logResponse(responseBody);

      requestBody.hashes.forEach((hash) => {
        const transaction = getNotNullOrThrowError<Transaction>(
          responseBody.get(hash)
        );

        expect(transaction.hash).toEqual(hash);
        expect(transaction.blockNumber).toBeGreaterThan(0);
        expect(transaction.gasUsed).toBeGreaterThan(0);
        expect(transaction.gasWanted).toBeGreaterThan(0);
        expect(transaction.code).toBe(0);
        expect(transaction.data).toContain('submit_order');
        expect(transaction.data).toContain('price');
      });
    });
  });

  describe('Orders', () => {
    /*
    Full flow for testing orders
    =============================
    market 1: token1/token2
    market 2: token1/token3
    market 3: token2/token3

    cancel all open orders

    settle funds for all markets

    get the wallet balances from the tokens 1, 2, and 3

    create a limit buy order 1 for market 1

    check the available wallet balances from the tokens 1 and 3

    get the open order 1

    create a limit sell order 2 for market 2 (slightly better than the market price)

    check the available wallet balances from the tokens 1 and 3

    get the filled order 2

    create a market sell order 3 for market 3

    check the available wallet balances from the tokens 2 and 3

    get the filled order 3

    create 8 orders at once as the following:
      order 4, limit, buy, market 1
      order 5, limit, sell, market 2
      order 6, limit, buy, market 3  (slightly better than the market price)
      order 7, limit, sell, market 1  (slightly better than the market price)
      order 8, limit, buy, market 2
      order 9, limit, sell, market 3
      order 10, market, buy, market 1
      order 11, market, sell, market 2

    check the wallet balances from the tokens 1, 2, and 3

    get the open orders 8 and 9

    get all open orders and check that the orders 2, 3, 6, 7, 10, and 11 are missing

    cancel the order 1

    check the wallet balances from the tokens 1 and 2

    check that it's not possible to get the cancelled order 1

    get all open orders and check that orders 1, 2, 3, 6, 7, 10, and 11 are missing

    cancel the orders 4 and 5

    check the wallet balances from the tokens 1, 2, and 3

    check that it's not possible to get the cancelled orders 4 and 5

    get all open orders and check that the orders 1, 2, 3, 4, 5, 6, 7, 10, and 11 are missing

    get all filled orders and check that the orders 2, 3, 6, 7, 10, and 11 are present

    get all orders (open or filled) and check that the orders 2, 3, 6, 7, 10, and 11 are present and the orders 1, 4, 5 are missing

    cancel all the open orders

    check the wallet balances from the tokens 1, 2 and 3

    get all open orders and check that there are no open orders

    get all orders (open or filled) and check that the orders 2, 3, 6, 7, 10, and 11 are present

    create 2 orders at once as the following:
      order 12, limit, buy, market 3
      order 13, limit, sell, market 1

    get all open orders and check that the orders 12 and 13 are present

    get all orders (open or filled) and check that the orders 2, 3, 6, 7, 10, 11, 12, and 13 are present

    cancel all open orders

    check the wallet balances from the tokens 1, 2 and 3

    get all open orders and check that there are no open orders

    settle funds for market 1

    check the wallet balances from the tokens 1, 2 and 3

    settle funds for markets 2 and 3

    check the wallet balances from the tokens 1, 2 and 3

    settle funds for all markets
    */

    it('Cancel all open orders - 1', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
      } as CancelAllOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<CancelAllOrdersResponse>({
        RESTMethod: RESTfulMethod.DELETE,
        RESTRoute: '/orders/all',
        RESTRequest: request,
        controllerFunction: KujiraController.cancelAllOrders,
      });

      const responseBody = response.body as CancelAllOrdersResponse;

      logResponse(responseBody);
    });

    it('Settle funds for all markets - 1', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
      } as AllMarketsWithdrawsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<AllMarketsWithdrawsResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/market/withdraws/all',
        RESTRequest: request,
        controllerFunction: KujiraController.withdrawFromAllMarkets,
      });

      const responseBody = response.body as AllMarketsWithdrawsResponse;

      logResponse(responseBody);
    });

    it('Get the wallet balances from the tokens 1, 2, and 3', async () => {
      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      expect(BigNumber(responseBody.total.free).gte(0)).toBeTrue();
      expect(BigNumber(responseBody.total.unsettled).gte(0)).toBeTrue();
      expect(BigNumber(responseBody.total.lockedInOrders).gte(0)).toBeTrue();

      const tokens = IMap(responseBody.tokens);
      for (const balance of tokens.values()) {
        expect(BigNumber(balance.free).gte(0)).toBeTrue();
        expect(BigNumber(balance.unsettled).gte(0)).toBeTrue();
        expect(BigNumber(balance.lockedInOrders).gte(0)).toBeTrue();
      }

      userBalances = {
        ...responseBody,
        tokens: IMap(responseBody.tokens).asMutable(),
      };
    });

    it('Create a limit buy order 1 for market 1', async () => {
      const candidate = getOrder('1');

      const requestBody = { ...candidate } as PlaceOrderRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<PlaceOrderResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.placeOrder,
      });

      const responseBody = response.body as PlaceOrderResponse;

      logResponse(responseBody);

      candidate.id = responseBody.id;
      candidate.marketName = responseBody.marketName;
      candidate.market = responseBody.market;
      candidate.status = responseBody.status;
      candidate.fee = responseBody.fee;
      candidate.hashes = responseBody.hashes;

      expect(responseBody).toBeObject();
      expect(responseBody.id?.length).toBeGreaterThan(0);
      expect(responseBody.marketId).toBe(candidate.marketId);
      expect(responseBody.ownerAddress).toBe(candidate.ownerAddress);
      expect(
        BigNumber(getNotNullOrThrowError(responseBody.price)).toString()
      ).toEqual(candidate.price?.toString());
      expect(BigNumber(responseBody.amount).toString()).toEqual(
        candidate.amount.toString()
      );
      expect(responseBody.side).toBe(candidate.side);
      expect(responseBody.marketName).toBe(candidate.marketName);
      expect(responseBody.payerAddress).toBe(candidate.payerAddress);
      expect(responseBody.status).toBe(OrderStatus.OPEN);
      expect(responseBody.hashes?.creation?.length).toBeCloseTo(64);

      lastPayedFeeSum = BigNumber(
        getNotNullOrThrowError<BigNumber>(responseBody.fee)
      );
    });

    it('Check the available wallet balances from the tokens 1 and 2', async () => {
      const targetOrder = getOrder('1');

      const requestBody = {
        tokenIds: [
          targetOrder.market.baseToken.id,
          targetOrder.market.quoteToken.id,
        ],
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = {
        ...response.body,
        tokens: IMap(response.body.tokens),
      } as GetBalancesResponse;

      logResponse(responseBody);

      // Verifying token 1 (base) balance
      const currentBaseBalance = BigNumber(
        getNotNullOrThrowError<any>(
          userBalances.tokens.get(targetOrder.market.baseToken.id)
        ).free
      ).minus(lastPayedFeeSum);

      expect(
        BigNumber(
          getNotNullOrThrowError(
            responseBody.tokens.get(targetOrder.market.baseToken.id)?.free
          )
        )
      ).toEqual(currentBaseBalance);

      const userBalancesSetter = getNotNullOrThrowError<Balance>(
        userBalances.tokens.get(targetOrder.market.baseToken.id)
      );
      userBalancesSetter.free = currentBaseBalance;

      // Verifying token 2 (quote) balance
      const currentQuoteBalance = BigNumber(
        getNotNullOrThrowError<any>(
          userBalances.tokens.get(targetOrder.market.quoteToken.id)
        ).free
      ).minus(getNotNullOrThrowError<any>(targetOrder.amount));

      expect(
        BigNumber(
          getNotNullOrThrowError(
            responseBody.tokens.get(targetOrder.market.quoteToken.id)?.free
          )
        )
      ).toEqual(currentQuoteBalance);

      // Updating Quote Balances (free and lockedInOrders)
      userBalances.tokens.set(targetOrder.market.quoteToken.id, {
        token: targetOrder.market.quoteToken,
        free: currentQuoteBalance,
        lockedInOrders: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(targetOrder.market.quoteToken.id)
              ?.lockedInOrders
          )
        ).plus(targetOrder.amount),
        unsettled: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(targetOrder.market.quoteToken.id)?.unsettled
          )
        ),
      });
    });

    it('Get the open order 1', async () => {
      const target = getOrder('1');

      const requestBody = {
        id: target.id,
        status: OrderStatus.OPEN,
        marketId: target.marketId,
        ownerAddress: ownerAddress,
      } as GetOrderRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrder,
      });

      const responseBody = response.body as GetOrderResponse;

      logResponse(responseBody);

      expect(responseBody).toBeObject();
      expect(responseBody.status).toEqual(OrderStatus.OPEN);
      expect(responseBody.id).toEqual(target.id);
      expect(responseBody.marketName).toBe(target.marketName);
      expect(responseBody.marketId).toBe(target.marketId);
      expect(responseBody.ownerAddress).toEqual(target.ownerAddress);
      expect(
        BigNumber(getNotNullOrThrowError(responseBody.price)).toString()
      ).toEqual(target.price?.toString());
      expect(responseBody.amount.toString()).toEqual(target.amount.toString());
    });

    it('Create a limit sell order 2 for market 2 (slightly better than the market price)', async () => {
      const candidate = getOrder('2');

      const orderBookRequest = {
        marketId: candidate.marketId,
      } as GetOrderBookRequest;

      const orderBookResponse = await kujira.getOrderBook(orderBookRequest);

      const marketPrecision = getNotNullOrThrowError<number>(
        orderBookResponse.market.precision
      );

      const spread = 1; // 1%
      candidate.price = getNotNullOrThrowError<BigNumber>(
        orderBookResponse.bestBid?.price
      )
        .times((100 - spread) / 100)
        .decimalPlaces(marketPrecision);

      const orderRequestBody = { ...candidate } as PlaceOrderRequest;

      const request = {
        ...commonRequestBody,
        ...orderRequestBody,
      };

      logRequest(request);

      const response = await sendRequest<PlaceOrderResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.placeOrder,
      });

      const responseBody = response.body as PlaceOrderResponse;

      logResponse(responseBody);

      lastPayedFeeSum = getNotNullOrThrowError<OrderFee>(responseBody.fee);

      expect(responseBody).toBeObject();
      expect(responseBody.id?.length).toBeGreaterThan(0);
      expect(responseBody.marketId).toBe(candidate.marketId);
      expect(responseBody.ownerAddress).toBe(candidate.ownerAddress);
      expect(
        BigNumber(getNotNullOrThrowError(responseBody.price)).toString()
      ).toEqual(candidate.price.toString());
      expect(
        BigNumber(getNotNullOrThrowError(responseBody.amount)).toString()
      ).toEqual(candidate.amount.toString());
      expect(responseBody.side).toBe(candidate.side);
      expect(responseBody.marketName).toBe('KUJI/axlUSDC');
      expect(responseBody.payerAddress).toBe(candidate.payerAddress);
      expect(responseBody.hashes?.creation?.length).toBeCloseTo(64);

      candidate.id = responseBody.id;
      candidate.marketName = responseBody.marketName;
      candidate.market = responseBody.market;
      candidate.status = responseBody.status;
      candidate.fee = responseBody.fee;
      candidate.hashes = responseBody.hashes;
    });

    it('Check the available wallet balances from the tokens 1 and 3', async () => {
      const targetOrder = getOrder('2');

      const requestBody = {
        tokenIds: [
          targetOrder.market.baseToken.id,
          targetOrder.market.quoteToken.id,
        ],
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = {
        ...response.body,
        tokens: IMap(response.body.tokens),
      } as GetBalancesResponse;

      logResponse(responseBody);

      // Verifying token 1 (base) balance
      const currentBaseBalance = BigNumber(
        getNotNullOrThrowError<any>(
          userBalances.tokens.get(targetOrder.market.baseToken.id)
        ).free
      ).minus(
        getNotNullOrThrowError<any>(
          BigNumber(lastPayedFeeSum).plus(targetOrder.amount)
        )
      );

      expect(
        BigNumber(
          getNotNullOrThrowError<any>(
            responseBody.tokens.get(targetOrder.market.baseToken.id)?.free
          )
        )
      ).toEqual(currentBaseBalance);

      // Updating Base Balances (free and lockedInOrders)
      userBalances.tokens.set(targetOrder.market.baseToken.id, {
        token: targetOrder.market.baseToken,
        free: currentBaseBalance,
        lockedInOrders: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(targetOrder.market.baseToken.id)
              ?.lockedInOrders
          )
        ).plus(targetOrder.amount),
        unsettled: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(targetOrder.market.baseToken.id)?.unsettled
          )
        ),
      });

      // Verifying token 2 (quote) balance
      const currentQuoteBalance = BigNumber(
        getNotNullOrThrowError<any>(
          userBalances.tokens.get(targetOrder.market.quoteToken.id)
        ).free
      ).minus(
        getNotNullOrThrowError<Balance>(
          responseBody.tokens.get(targetOrder.market.quoteToken.id)
        ).unsettled
      );

      expect(
        BigNumber(
          getNotNullOrThrowError<any>(
            responseBody.tokens.get(targetOrder.market.quoteToken.id)?.free
          )
        )
      ).toEqual(currentQuoteBalance);

      // Updating Quote Balances (free and unsettled)
      userBalances.tokens.set(targetOrder.market.quoteToken.id, {
        token: targetOrder.market.quoteToken,
        free: currentQuoteBalance,
        lockedInOrders: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(targetOrder.market.quoteToken.id)
              ?.lockedInOrders
          )
        ),
        unsettled: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(targetOrder.market.quoteToken.id)?.unsettled
          )
        ).plus(getNotNullOrThrowError<any>(targetOrder.price)),
      });
    });

    it('Get the filled order 2', async () => {
      const target = getOrder('2');

      const requestBody = {
        id: target.id,
        status: OrderStatus.FILLED,
        marketId: target.marketId,
        ownerAddress: ownerAddress,
      } as GetOrderRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrder,
      });

      const responseBody = response.body as GetOrderResponse;

      logResponse(responseBody);

      expect(responseBody).toBeObject();
      expect(responseBody.status).toEqual(OrderStatus.FILLED);
      expect(responseBody.id).toEqual(target.id);
      expect(responseBody.marketName).toBe(target.marketName);
      expect(responseBody.marketId).toBe(target.marketId);
      expect(responseBody.ownerAddress).toEqual(target.ownerAddress);
      expect(
        BigNumber(getNotNullOrThrowError(responseBody.price)).toString()
      ).toBe(target.price?.toString());
      expect(
        BigNumber(getNotNullOrThrowError(responseBody.amount)).toString()
      ).toEqual(target.amount.toString());
    });

    it('Create a market sell order 3 for market 3', async () => {
      const candidate = getOrder('3');

      const requestBody = { ...candidate } as PlaceOrderRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<PlaceOrderResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.placeOrder,
      });

      const responseBody = response.body as PlaceOrderResponse;

      logResponse(responseBody);

      candidate.marketName = responseBody.marketName;
      candidate.market = responseBody.market;
      candidate.price = responseBody.price;
      candidate.status = responseBody.status;
      candidate.fee = responseBody.fee;
      candidate.hashes = responseBody.hashes;
      candidate.id = responseBody.id;

      expect(responseBody).toBeObject();
      expect(responseBody.marketId).toBe(candidate.marketId);
      expect(responseBody.ownerAddress).toBe(candidate.ownerAddress);
      expect(responseBody.side).toBe(candidate.side);
      expect(responseBody.hashes?.creation?.length).toBeCloseTo(64);
      expect(responseBody.payerAddress).toBe(candidate.payerAddress);
      expect(
        BigNumber(getNotNullOrThrowError<any>(responseBody.amount))
      ).toEqual(candidate.amount);

      lastPayedFeeSum = getNotNullOrThrowError<OrderFee>(responseBody.fee);
    });

    it.skip('Check the available wallet balances from the tokens 2 and 3', async () => {
      const primaryTargetOrder = getOrder('3');

      const requestBody = {
        tokenIds: [
          primaryTargetOrder.market.baseToken.id,
          primaryTargetOrder.market.quoteToken.id,
        ],
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = {
        ...response.body,
        tokens: IMap(response.body.tokens),
      } as GetBalancesResponse;

      logResponse(responseBody);

      const secundaryTargetOrder = getOrder('2');

      // Verifying token 2 (base) balance
      const currentBaseBalance = BigNumber(
        getNotNullOrThrowError<any>(
          userBalances.tokens.get(primaryTargetOrder.market.baseToken.id)
        ).free
      ).minus(primaryTargetOrder.amount);

      expect(
        BigNumber(
          getNotNullOrThrowError<any>(
            responseBody.tokens.get(primaryTargetOrder.market.baseToken.id)
              ?.free
          )
        ).decimalPlaces(2)
      ).toEqual(currentBaseBalance.decimalPlaces(2));

      // Updating Base Balances (free and lockedInOrders)
      userBalances.tokens.set(primaryTargetOrder.market.baseToken.id, {
        token: primaryTargetOrder.market.baseToken,
        free: currentBaseBalance,
        lockedInOrders: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(primaryTargetOrder.market.baseToken.id)
              ?.lockedInOrders
          )
        ),
        unsettled: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(primaryTargetOrder.market.baseToken.id)
              ?.unsettled
          )
        ),
      });

      // Verifying token 3 (quote) balance
      const expectedCurrentQuoteFreeBalance = BigNumber(
        getNotNullOrThrowError<any>(
          userBalances.tokens.get(primaryTargetOrder.market.quoteToken.id)
        ).free
      ).plus(BigNumber(getNotNullOrThrowError<any>(primaryTargetOrder.price)));
      // .plus(getNotNullOrThrowError<any>(secundaryTargetOrder.price));

      expect(
        BigNumber(
          getNotNullOrThrowError<any>(
            responseBody.tokens.get(primaryTargetOrder.market.quoteToken.id)
          ).free
        )
      ).toEqual(expectedCurrentQuoteFreeBalance);

      // Updating Quote Balances (free and unsettled)
      userBalances.tokens.set(primaryTargetOrder.market.quoteToken.id, {
        token: primaryTargetOrder.market.quoteToken,
        free: expectedCurrentQuoteFreeBalance,
        lockedInOrders: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(primaryTargetOrder.market.quoteToken.id)
              ?.lockedInOrders
          )
        ),
        unsettled: BigNumber(
          getNotNullOrThrowError<any>(
            userBalances.tokens.get(secundaryTargetOrder.market.quoteToken.id)
              ?.unsettled
          )
        ).plus(getNotNullOrThrowError<any>(primaryTargetOrder.price)),
      });
    });

    // it('Get the filled order 3', async () => {});

    it('Create 8 orders at once', async () => {
      const candidates = getOrders(['4', '5', '6', '7', '8', '9', '10', '11']);

      const orderBookRequest = {
        marketIds: [
          candidates.valueSeq().toArray()[2].marketId,
          candidates.valueSeq().toArray()[3].marketId,
        ],
      } as GetOrderBooksRequest;

      const orderBookResponse = await kujira.getOrderBooks(orderBookRequest);

      const marketPrecisions: any[] = [];
      for (const item of orderBookResponse.valueSeq().toArray()) {
        marketPrecisions.push(item.market.precision);
      }

      const spread = 2; // 2%

      for (const candidate of candidates.valueSeq()) {
        if (candidate.clientId == '6' || candidate.clientId == '7') {
          if (candidate.side == OrderSide.BUY) {
            candidate.price = BigNumber(
              getNotNullOrThrowError<BigNumber>(
                orderBookResponse.valueSeq().toArray()[0].bestAsk?.price
              )
                .times((100 + spread) / 100)
                .decimalPlaces(marketPrecisions[0])
            );
          } else {
            candidate.price = BigNumber(
              getNotNullOrThrowError<BigNumber>(
                orderBookResponse.valueSeq().toArray()[1].bestBid?.price
              )
                .times((100 - spread) / 100)
                .decimalPlaces(marketPrecisions[1])
            );
          }
        }
      }

      const requestBody = {
        orders: candidates
          .valueSeq()
          .map((candidate) => ({ ...candidate }))
          .toArray(),
      } as PlaceOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<PlaceOrdersResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.placeOrders,
      });

      const responseBody = IMap<OrderId, Order>(
        response.body
      ) as PlaceOrdersResponse;

      logResponse(responseBody);

      responseBody
        .valueSeq()
        .toArray()
        .forEach((order: Order) => {
          const clientId = getNotNullOrThrowError<OrderClientId>(
            order.clientId
          );
          const candidate = getNotNullOrThrowError<Order>(
            candidates.get(clientId)
          );
          candidate.id = order.id;
          candidate.marketName = order.marketName;
          candidate.market = order.market;
          candidate.status = order.status;
          candidate.fee = order.fee;
          candidate.hashes = order.hashes;
        });

      for (const [orderId, order] of (
        responseBody as IMap<OrderId, Order>
      ).entries()) {
        const clientId = getNotNullOrThrowError<OrderClientId>(order.clientId);
        const candidate = orders.get(clientId);

        expect(order).toBeObject();
        expect(orderId).toBe(order.id);
        expect(order.id?.length).toBeGreaterThan(0);
        expect(order.id).toBe(candidate?.id);
        expect(order.marketId).toBe(candidate?.marketId);
        expect(order.ownerAddress).toBe(candidate?.ownerAddress);
        if (candidate?.type != OrderType.MARKET) {
          expect(
            BigNumber(getNotNullOrThrowError(order.price)).toString()
          ).toEqual(candidate?.price?.toString());
        } else {
          expect(BigNumber(getNotNullOrThrowError(order.price)).toString());
        }
        expect(
          BigNumber(getNotNullOrThrowError(order.amount)).toString()
        ).toEqual(candidate?.amount.toString());
        expect(order.side).toBe(candidate?.side);
        expect(order.payerAddress).toBe(candidate?.payerAddress);
        expect(order.status).toBe(OrderStatus.OPEN);
        expect(order.hashes?.creation?.length).toBeCloseTo(64);
      }

      lastPayedFeeSum = BigNumber(0);
      for (const order of (responseBody as IMap<OrderId, Order>).values()) {
        lastPayedFeeSum = lastPayedFeeSum.plus(
          getNotNullOrThrowError<BigNumber>(order.fee)
        );
      }
    });

    it.skip('Check the wallet balances from the tokens 1, 2, and 3', async () => {
      const targetOrders = getOrders([
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        '10',
        '11',
      ]);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;

      getNotNullOrThrowError<Order>(targetOrders.get('10')).status =
        OrderStatus.FILLED;

      getNotNullOrThrowError<Order>(targetOrders.get('11')).status =
        OrderStatus.FILLED;
    });

    it('Get the open orders 8 and 9', async () => {
      const targets = getOrders(['8', '9']);

      const targetsIds: OrderId[] = [];
      targets
        .valueSeq()
        .toArray()
        .forEach((order) =>
          targetsIds.push(getNotNullOrThrowError<OrderId>(order.id))
        );

      const requestBody = {
        ids: targetsIds,
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      expect(responseBody.size).toBe(targets.size);

      for (const candidate of targets.values()) {
        const order = getNotNullOrThrowError<Order>(
          responseBody.get(getNotNullOrThrowError(candidate.id))
        );

        expect(order).toBeObject();
        expect(order.id?.length).toBeGreaterThan(0);
        expect(order.id).toBe(candidate?.id);
        expect(order.marketId).toBe(candidate?.marketId);
        expect(order.ownerAddress).toBe(candidate?.ownerAddress);
        expect(
          BigNumber(getNotNullOrThrowError(order.price)).toString()
        ).toEqual(candidate?.price?.toString());
        expect(
          BigNumber(getNotNullOrThrowError(order.amount)).toString()
        ).toEqual(candidate?.amount.toString());
        expect(order.side).toBe(candidate?.side);
        expect(order.payerAddress).toBe(candidate?.payerAddress);
        expect(order.status).toBe(OrderStatus.OPEN);
        expect(order.type).toBe(candidate?.type);
      }
    });

    it('Get all open orders and check that the orders 2, 3, 6, 7, 10, and 11 are missing', async () => {
      const targets = getOrders(['2', '3', '6', '7', '10', '11']);

      const targetsIds = [];

      for (const target of targets.valueSeq()) {
        if (target.type != OrderType.MARKET) {
          targetsIds.push(target.id);
        }
      }

      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds: OrderId[] = [];
      (responseBody as IMap<OrderId, Order>)
        .valueSeq()
        .toArray()
        .forEach((order) =>
          responseOrdersIds.push(getNotNullOrThrowError(order.id))
        );

      targetsIds.forEach((orderId) =>
        expect(
          responseOrdersIds.includes(getNotNullOrThrowError(orderId))
        ).toBeFalse()
      );
    });

    it('Cancel the order 1', async () => {
      const target = getOrder('1');

      const requestBody = {
        id: target.id,
        marketId: target.marketId,
        ownerAddress: target.ownerAddress,
      } as CancelOrderRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<CancelOrderResponse>({
        RESTMethod: RESTfulMethod.DELETE,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.cancelOrder,
      });

      const responseBody = response.body as CancelOrderResponse;

      logResponse(responseBody);

      expect(responseBody).toBeObject();
      expect(responseBody.id?.length).toBeGreaterThan(0);
      expect(responseBody.id).toEqual(target.id);
      expect(responseBody.marketId).toBe(target.marketId);
      expect(responseBody.ownerAddress).toBe(target.ownerAddress);
      expect(responseBody.marketName).toBe(target.marketName);
      expect(responseBody.payerAddress).toBe(target.payerAddress);
      expect(responseBody.status).toBe(OrderStatus.CANCELLED);
      expect(responseBody.hashes?.cancellation?.length).toBeCloseTo(64);

      target.fee = responseBody.fee;
      target.hashes = responseBody.hashes;
      target.status = OrderStatus.CANCELLED;

      lastPayedFeeSum = getNotNullOrThrowError<OrderFee>(responseBody.fee);
    });

    it.skip('Check the wallet balances from the tokens 1 and 2', async () => {
      const targetOrder = getOrder('1');

      const requestBody = {
        tokenIds: [
          targetOrder.market.baseToken.id,
          targetOrder.market.quoteToken.id,
        ],
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      // Verifying token 1 (base) balance
      const currentBaseBalance = getNotNullOrThrowError<any>(
        userBalances.tokens.get(targetOrder.market.baseToken.id)
      ).free.minus(lastPayedFeeSum);

      expect(
        responseBody.tokens.get(targetOrder.market.baseToken.id)?.free
      ).toEqual(currentBaseBalance);

      userBalances.tokens.set(
        targetOrder.market.baseToken.id,
        currentBaseBalance
      );

      // Verifying token 2 (quote) balance
      const currentQuoteBalance = getNotNullOrThrowError<any>(
        userBalances.tokens.get(targetOrder.market.quoteToken.id)
      ).free.add(targetOrder.amount);

      expect(
        responseBody.tokens.get(targetOrder.market.quoteToken.id)?.free
      ).toEqual(currentQuoteBalance);

      userBalances.tokens.set(
        targetOrder.market.quoteToken.id,
        currentQuoteBalance
      );
    });

    it("Check that it's not possible to get the cancelled order 1", async () => {
      const target = getOrder('1');

      const requestBody = {
        id: target.id,
        ownerAddress: target.ownerAddress,
        marketId: target.marketId,
      } as GetOrderRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrderResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/order',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrder,
      });

      const responseBody = response.body as GetOrderResponse;

      logResponse(responseBody);

      expect(responseBody).toBeOneOf([null, undefined, '']);
    });

    it('Get all open orders and check that orders 1, 2, 3, 6, 7, 10, and 11 are missing', async () => {
      const targets = getOrders(['1', '2', '3', '6', '7', '10', '11']);

      const targetsIds = [];

      for (const target of targets.valueSeq()) {
        if (target.type != OrderType.MARKET) {
          targetsIds.push(target.id);
        }
      }

      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds = (responseBody as IMap<OrderId, Order>)
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      targetsIds.forEach((orderId) =>
        expect(responseOrdersIds.includes(orderId)).toBeFalse()
      );
    });

    it('Cancel the orders 4 and 5', async () => {
      const candidates = getOrders(['4', '5']);

      const candidatesIds = [];

      for (const target of candidates.valueSeq()) {
        if (target.type != OrderType.MARKET) {
          candidatesIds.push(target.id);
        }
      }

      const candidatesMarketsIds = [];

      for (const target of candidates.valueSeq()) {
        if (target.type != OrderType.MARKET) {
          candidatesMarketsIds.push(target.marketId);
        }
      }

      const requestBody = {
        ids: candidatesIds,
        marketIds: candidatesMarketsIds,
        ownerAddress: ownerAddress,
      } as CancelOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<CancelOrdersResponse>({
        RESTMethod: RESTfulMethod.DELETE,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.cancelOrders,
      });

      const responseBody = IMap(response.body) as CancelOrdersResponse as IMap<
        OrderId,
        Order
      >;

      logResponse(responseBody);

      expect(responseBody.size).toBe(candidatesIds.length);
      expect(responseBody.keySeq().toArray()).toIncludeSameMembers(
        candidatesIds
      );

      for (const order of responseBody.valueSeq()) {
        for (const candidate of candidates.valueSeq()) {
          if (order.id == candidate.id) {
            expect(order).toBeObject();
            expect(order.id?.length).toBeGreaterThan(0);
            expect(order.marketId).toBe(candidate?.marketId);
            expect(order.ownerAddress).toBe(candidate?.ownerAddress);
            expect(order.payerAddress).toBe(candidate?.payerAddress);
            expect(order.hashes?.cancellation?.length).toBeCloseTo(64);
          }
        }
      }
    });

    it.skip('Check the wallet balances from the tokens 1, 2, and 3', async () => {
      const targetOrders = getOrders(['4', '5']);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;
    });

    it("Check that it's not possible to get the cancelled orders 4 and 5", async () => {
      const targets = getOrders(['4', '5']);

      const targetsIds = targets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const requestBody = {
        ids: targetsIds,
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      expect(responseBody.size).toEqual(0);
    });

    it('Get all open orders and check that the orders 1, 2, 3, 4, 5, 6, 7, 10, and 11 are missing', async () => {
      const targets = getOrders([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '10',
        '11',
      ]);

      const targetsIds = [];

      for (const target of targets.valueSeq()) {
        if (target.type != OrderType.MARKET) {
          targetsIds.push(target.id);
        }
      }

      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap<OrderId, Order>(
        response.body
      ) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds: OrderId[] = [];

      for (const order of responseBody) {
        responseOrdersIds.push(getNotNullOrThrowError<any>(order)[0]);
      }

      for (const targetId of targetsIds) {
        expect(
          responseOrdersIds.includes(getNotNullOrThrowError<any>(targetId))
        ).toBeFalse();
      }
    });

    it('Get all filled orders and check that the orders 2, 6, and 7 are present', async () => {
      const targets = getOrders(['2', '6', '7']);

      const targetsIds = [];

      for (const target of targets.valueSeq()) {
        if (target.type != OrderType.MARKET) {
          targetsIds.push(target.id);
        }
      }

      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.FILLED,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap<OrderId, Order>(
        response.body
      ) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds: OrderId[] = [];

      for (const order of responseBody) {
        responseOrdersIds.push(getNotNullOrThrowError<any>(order)[0]);
      }

      for (const targetId of targetsIds) {
        expect(
          responseOrdersIds.includes(getNotNullOrThrowError<any>(targetId))
        ).toBeTrue();
      }
    });

    it('Get all orders (open or filled) and check that the orders 2, 3, 6, 7, 10, and 11 are present and the orders 1, 4, 5 are missing', async () => {
      const openLimitOrdersTargets = getOrders(['8', '9']);
      const filledLimitOrdersTargets = getOrders(['2', '6', '7']);
      const filledMarketOrdersTargets = getOrders(['3', '10', '11']);
      const cancelledOrdersTargets = getOrders(['1', '4', '5']);

      const openLimitOrdersTargetsIds = openLimitOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const filledLimitOrdersTargetsIds = filledLimitOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const filledMarketOrdersTargetsIds = filledMarketOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray()
        ? filledMarketOrdersTargets
            .map((order) => order.id)
            .valueSeq()
            .toArray()
        : undefined;

      const cancelledOrdersTargetsIds = cancelledOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const requestBody = {
        ownerAddress: ownerAddress,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap<OrderId, Order>(
        response.body
      ) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds: OrderId[] = [];

      for (const order of responseBody) {
        responseOrdersIds.push(getNotNullOrThrowError<any>(order)[0]);
      }

      openLimitOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );

      filledLimitOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );

      getNotNullOrThrowError<OrderId[]>(filledMarketOrdersTargetsIds).forEach(
        (orderId) => {
          expect(orderId).toBeUndefined();
        }
      );

      cancelledOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).not.toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );
    });

    it('Cancel all open orders - 2', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
      } as CancelAllOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<CancelAllOrdersResponse>({
        RESTMethod: RESTfulMethod.DELETE,
        RESTRoute: '/orders/all',
        RESTRequest: request,
        controllerFunction: KujiraController.cancelAllOrders,
      });

      const responseBody = getNotNullOrThrowError<IMap<OrderId, Order>>(
        IMap<OrderId, Order>(response.body) as CancelAllOrdersResponse
      );

      logResponse(responseBody);

      const candidates = getOrders(['3', '6', '7', '8', '9', '10', '11']);

      const candidatesIds = [];

      for (const target of candidates.values()) {
        if (target.type != OrderType.MARKET) {
          if (responseBody.get(getNotNullOrThrowError<OrderId>(target.id))) {
            candidatesIds.push(target.id);
          }
        }
      }

      const responseOrdersIds: OrderId[] = [];

      for (const order of responseBody.valueSeq()) {
        responseOrdersIds.push(
          getNotNullOrThrowError<any>(getNotNullOrThrowError<Order>(order).id)
        );
      }

      for (const target of candidatesIds) {
        expect(
          responseOrdersIds.includes(getNotNullOrThrowError<OrderId>(target))
        ).toBeTrue();
      }

      for (const order of responseBody.valueSeq()) {
        for (const candidate of candidates.valueSeq()) {
          if (order.id == candidate.id) {
            expect(order).toBeObject();
            expect(order.id?.length).toBeGreaterThan(0);
            expect(order.marketId).toBe(candidate?.marketId);
            expect(order.ownerAddress).toBe(candidate?.ownerAddress);
            expect(order.payerAddress).toBe(candidate?.payerAddress);
            expect(order.hashes?.cancellation?.length).toBeCloseTo(64);
          }
        }
      }
    });

    it.skip('Check the wallet balances from the tokens 1, 2 and 3', async () => {
      const targetOrders = getOrders(['8', '9']);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;
    });

    it('Get all open orders and check that there are no open orders', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      expect(responseBody.size).toEqual(0);
    });

    it('Get all orders (open or filled) and check that the orders 2, 3, 6, 7, 10, and 11 are present', async () => {
      const openLimitOrdersTargets = getOrders(['8', '9']);
      const filledLimitOrdersTargets = getOrders(['2', '6', '7']);
      const filledMarketOrdersTargets = getOrders(['3', '10', '11']);
      const cancelledOrdersTargets = getOrders(['1', '4', '5']);

      const openLimitOrdersTargetsIds = openLimitOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const filledLimitOrdersTargetsIds = filledLimitOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const filledMarketOrdersTargetsIds = filledMarketOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const cancelledOrdersTargetsIds = cancelledOrdersTargets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const requestBody = {
        ownerAddress: ownerAddress,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds = (responseBody as IMap<OrderId, Order>)
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      openLimitOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).not.toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );

      filledLimitOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );

      filledMarketOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).not.toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );

      cancelledOrdersTargetsIds.forEach((orderId) =>
        expect(responseOrdersIds).not.toInclude(
          getNotNullOrThrowError<OrderId>(orderId)
        )
      );
    });

    it('Create orders 12 and 13 at once', async () => {
      const candidates = getOrders(['12', '13']);

      const requestBody = {
        orders: candidates
          .valueSeq()
          .map((target) => ({ ...target }))
          .toArray(),
      } as PlaceOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<PlaceOrdersResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.placeOrders,
      });

      const responseBody = IMap(response.body) as PlaceOrdersResponse;

      logResponse(responseBody);

      responseBody
        .valueSeq()
        .toArray()
        .map((order: Order) => {
          const clientId = getNotNullOrThrowError<OrderClientId>(
            order.clientId
          );
          const candidate = getNotNullOrThrowError<Order>(
            candidates.get(clientId)
          );
          candidate.id = order.id;
          candidate.marketName = order.marketName;
          candidate.market = order.market;
          candidate.status = order.status;
          candidate.fee = order.fee;
          candidate.hashes = order.hashes;
        });

      expect(responseBody.size).toBe(candidates.size);

      for (const [orderId, order] of (
        responseBody as IMap<OrderId, Order>
      ).entries()) {
        const clientId = getNotNullOrThrowError<OrderClientId>(order.clientId);
        const candidate = orders.get(clientId);

        expect(order).toBeObject();
        expect(orderId).toBe(order.id);
        expect(order.id?.length).toBeGreaterThan(0);
        expect(order.id).toBe(candidate?.id);
        expect(order.marketId).toBe(candidate?.marketId);
        expect(order.ownerAddress).toBe(candidate?.ownerAddress);
        expect(
          BigNumber(getNotNullOrThrowError(order.price)).toString()
        ).toEqual(candidate?.price?.toString());
        expect(
          BigNumber(getNotNullOrThrowError(order.amount)).toString()
        ).toEqual(candidate?.amount.toString());
        expect(order.side).toBe(candidate?.side);
        expect(order.payerAddress).toBe(candidate?.payerAddress);
        expect(order.status).toBe(OrderStatus.OPEN);
        expect(order.hashes?.creation?.length).toBeCloseTo(64);
      }
    });

    it.skip('Check the wallet balances from the tokens 1, 2 and 3', async () => {
      const targetOrders = getOrders(['12', '13']);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;
    });

    it('Get all open orders and check that the orders 12 and 13 are present', async () => {
      const targets = getOrders(['12', '13']);

      const targetsIds = targets
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds = (responseBody as IMap<OrderId, Order>)
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      targetsIds.forEach((orderId) =>
        expect(responseOrdersIds.includes(orderId)).toBeTrue()
      );
    });

    it('Get all orders (open or filled) and check that the orders 2, 3, 6, 7, 10, 11, 12, and 13 are present', async () => {
      const openLimitOrdersTargets = getOrders(['12', '13']);
      const filledLimitOrdersTargets = getOrders(['2', '6', '7']);
      const filledMarketOrdersTargets = getOrders(['3', '10', '11']);
      const cancelledOrdersTargets = getOrders(['1', '4', '5', '8', '9']);

      const openLimitOrdersTargetsIds: OrderId[] = [];
      openLimitOrdersTargets
        .valueSeq()
        .toArray()
        .forEach((order) =>
          openLimitOrdersTargetsIds.push(
            getNotNullOrThrowError<OrderId>(order.id)
          )
        );

      const filledLimitOrdersTargetsIds: OrderId[] = [];
      filledLimitOrdersTargets
        .valueSeq()
        .toArray()
        .forEach((order) =>
          filledLimitOrdersTargetsIds.push(
            getNotNullOrThrowError<OrderId>(order.id)
          )
        );

      const filledMarketOrdersTargetsIds: OrderId[] = [];
      filledMarketOrdersTargets
        .valueSeq()
        .toArray()
        .forEach((order) =>
          filledMarketOrdersTargetsIds.push(
            getNotNullOrThrowError<OrderId>(order.id)
          )
        );

      const cancelledOrdersTargetsIds: OrderId[] = [];
      cancelledOrdersTargets
        .valueSeq()
        .toArray()
        .forEach((order) =>
          cancelledOrdersTargetsIds.push(
            getNotNullOrThrowError<OrderId>(order.id)
          )
        );

      const requestBody = {
        ownerAddress: ownerAddress,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      const responseOrdersIds = (responseBody as IMap<OrderId, Order>)
        .map((order) => order.id)
        .valueSeq()
        .toArray();

      expect(responseOrdersIds).toIncludeAllMembers(openLimitOrdersTargetsIds);

      expect(responseOrdersIds).not.toIncludeAllMembers(
        filledMarketOrdersTargetsIds
      );

      expect(responseOrdersIds).not.toIncludeAllMembers(
        cancelledOrdersTargetsIds
      );
    });

    it('Cancel all open orders - 3', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
      } as CancelAllOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<CancelAllOrdersResponse>({
        RESTMethod: RESTfulMethod.DELETE,
        RESTRoute: '/orders/all',
        RESTRequest: request,
        controllerFunction: KujiraController.cancelAllOrders,
      });

      const responseBody = getNotNullOrThrowError<IMap<OrderId, Order>>(
        IMap<OrderId, Order>(response.body) as CancelAllOrdersResponse
      );

      logResponse(responseBody);

      const candidates = getOrders(['12', '13']);

      const candidatesIds = [];

      for (const target of candidates.values()) {
        if (target.type != OrderType.MARKET) {
          if (responseBody.get(getNotNullOrThrowError<OrderId>(target.id))) {
            candidatesIds.push(target.id);
          }
        }
      }

      const responseOrdersIds: OrderId[] = [];

      for (const order of responseBody.valueSeq()) {
        responseOrdersIds.push(
          getNotNullOrThrowError<any>(getNotNullOrThrowError<Order>(order).id)
        );
      }

      for (const target of candidatesIds) {
        expect(
          responseOrdersIds.includes(getNotNullOrThrowError<OrderId>(target))
        ).toBeTrue();
      }

      for (const order of responseBody.valueSeq()) {
        for (const candidate of candidates.valueSeq()) {
          if (order.id == candidate.id) {
            expect(order).toBeObject();
            expect(order.id?.length).toBeGreaterThan(0);
            expect(order.marketId).toBe(candidate?.marketId);
            expect(order.ownerAddress).toBe(candidate?.ownerAddress);
            expect(order.payerAddress).toBe(candidate?.payerAddress);
            expect(order.hashes?.cancellation?.length).toBeCloseTo(64);
          }
        }
      }
    });

    it.skip('Check the wallet balances from the tokens 1, 2 and 3', async () => {
      const targetOrders = getOrders(['12', '13']);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;
    });

    it('Get all open orders and check that there are no open orders', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
        status: OrderStatus.OPEN,
      } as GetOrdersRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetOrdersResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/orders',
        RESTRequest: request,
        controllerFunction: KujiraController.getOrders,
      });

      const responseBody = IMap(response.body) as GetOrdersResponse;

      logResponse(responseBody);

      expect(responseBody.size).toEqual(0);
    });

    it('Settle funds for market 1', async () => {
      const requestBody = {
        marketId: marketsIds[1],
        ownerAddress: ownerAddress,
      } as MarketWithdrawRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<MarketWithdrawResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/market/withdraw',
        RESTRequest: request,
        controllerFunction: KujiraController.withdrawFromMarket,
      });

      const responseBody = response.body as MarketWithdrawResponse;

      logResponse(responseBody);

      expect((responseBody as Withdraw).hash.length).toBeCloseTo(64);
    });

    it.skip('Check the wallet balances from the tokens 1, 2 and 3', async () => {
      const targetOrders = getOrders(['12', '13']);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;
    });

    it('Settle funds for markets 2 and 3', async () => {
      const requestBody = {
        marketIds: [marketsIds[2], marketsIds[3]],
        ownerAddress: ownerAddress,
      } as MarketsWithdrawsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<MarketsWithdrawsFundsResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/market/withdraws',
        RESTRequest: request,
        controllerFunction: KujiraController.withdrawFromMarkets,
      });

      const responseBody = IMap(response.body) as MarketsWithdrawsFundsResponse;

      logResponse(responseBody);

      expect(responseBody.size).toBe(
        getNotNullOrThrowError<MarketId[]>(request.marketIds).length
      );

      for (const [marketId, withdraw] of (
        responseBody as IMap<MarketId, Withdraw>
      ).entries()) {
        expect(request.marketIds).toInclude(marketId);
        expect(withdraw.hash.length).toBeCloseTo(64);
      }
    });

    it.skip('Check the wallet balances from the tokens 1, 2 and 3', async () => {
      const targetOrders = getOrders(['12', '13']);

      const requestBody = {
        tokenIds: Object.values(tokensIds),
        ownerAddress: ownerAddress,
      } as GetBalancesRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetBalancesResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/balances',
        RESTRequest: request,
        controllerFunction: KujiraController.getBalances,
      });

      const responseBody = response.body as GetBalancesResponse;

      logResponse(responseBody);

      const currentBalances = lodash.cloneDeep(responseBody);

      for (const order of targetOrders.values()) {
        const baseBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.baseToken.id)
        );

        const quoteBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get(order.market.quoteToken.id)
        );

        if (order.type == OrderType.LIMIT) {
          if (order.status == OrderStatus.OPEN) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.plus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.minus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.plus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.FILLED) {
            if (order.side == OrderSide.BUY) {
              baseBalance.free = baseBalance.free.minus(order.amount);

              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );

              baseBalance.unsettled = baseBalance.unsettled.minus(order.amount);
            } else if (order.side == OrderSide.SELL) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);

              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );

              quoteBalance.unsettled = quoteBalance.unsettled.minus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          } else if (order.status == OrderStatus.CANCELLED) {
            if (order.side == OrderSide.BUY) {
              quoteBalance.free = quoteBalance.free.minus(order.amount);
              quoteBalance.lockedInOrders = quoteBalance.lockedInOrders.plus(
                order.amount
              );
            } else if (order.side == OrderSide.SELL) {
              baseBalance.free = baseBalance.free.minus(order.amount);
              baseBalance.lockedInOrders = baseBalance.lockedInOrders.plus(
                order.amount
              );
            } else {
              throw new Error('Invalid order side');
            }
          }
        } else if (order.type == OrderType.MARKET) {
          if (order.side == OrderSide.BUY) {
            baseBalance.free = baseBalance.free.minus(order.amount);
            quoteBalance.free = quoteBalance.free.plus(order.amount);
          } else if (order.side == OrderSide.SELL) {
            baseBalance.free = baseBalance.free.plus(order.amount);
            quoteBalance.free = quoteBalance.free.minus(order.amount);
          } else {
            throw new Error('Invalid order side');
          }
        }
      }

      const kujiBalance = getNotNullOrThrowError<Balance>(
        currentBalances.tokens.get(kujiToken.reference)
      );

      kujiBalance.free = kujiBalance.free.plus(lastPayedFeeSum);

      for (const balance of userBalances.tokens.values()) {
        const currentBalance = getNotNullOrThrowError<Balance>(
          currentBalances.tokens.get((balance.token as Token).id)
        );

        expect(balance.free).toBe(currentBalance.free);
        expect(balance.lockedInOrders).toBe(currentBalance.lockedInOrders);
        expect(balance.unsettled).toBe(currentBalance.unsettled);
      }

      userBalances = responseBody;
    });

    it('Settle funds for all markets - 2', async () => {
      const requestBody = {
        ownerAddress: ownerAddress,
      } as AllMarketsWithdrawsRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<AllMarketsWithdrawsResponse>({
        RESTMethod: RESTfulMethod.POST,
        RESTRoute: '/market/withdraws/all',
        RESTRequest: request,
        controllerFunction: KujiraController.withdrawFromAllMarkets,
      });

      const responseBody = IMap(response.body) as AllMarketsWithdrawsResponse;

      logResponse(responseBody);

      expect(responseBody.size).toBeGreaterThan(0);
      const targetMarketsIds = Object.values(marketsIds);
      const responseMarketsIds = responseBody.keySeq().toArray();
      expect(responseMarketsIds).toIncludeAllMembers(targetMarketsIds);
    });
  });

  describe('Wallets', () => {
    it('Get Wallet Public Key', async () => {
      const requestBody = {
        mnemonic: mnemonic,
        accountNumber: 0,
      } as GetWalletPublicKeyRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetWalletPublicKeyResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/wallet/publicKey',
        RESTRequest: request,
        controllerFunction: KujiraController.getWalletPublicKey,
      });

      const responseBody = response.body as GetWalletPublicKeyResponse;

      logResponse(responseBody);

      expect(responseBody).toStartWith('kujira');
      expect(responseBody).toHaveLength(45);
    });

    it('Get Wallets Public Keys', async () => {
      const requestBody = {} as GetWalletsPublicKeysRequest;

      const request = {
        ...commonRequestBody,
        ...requestBody,
      };

      logRequest(request);

      const response = await sendRequest<GetWalletsPublicKeysResponse>({
        RESTMethod: RESTfulMethod.GET,
        RESTRoute: '/wallet/publicKeys',
        RESTRequest: request,
        controllerFunction: KujiraController.getWalletsPublicKeys,
      });

      const responseBody = response.body as GetWalletsPublicKeysResponse;

      logResponse(responseBody);

      expect(responseBody).toBeArray();
      for (const publicKey of responseBody) {
        expect(publicKey).toStartWith('kujira');
        expect(publicKey).toHaveLength(45);
      }
    });
  });
});
