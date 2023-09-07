import { BigNumber } from 'bignumber.js';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

const configManager = ConfigManagerV2.getInstance();

export interface NetworkConfig {
  name: string;
  nodeURL: string | null;
  chainId: string;
  tokenListType: string;
  tokenListSource: string;
}

export namespace KujiraConfig {
  export const config = {
    chainType: 'KUJIRA',
    tradingTypes: ['CLOB_SPOT'],
    chain: 'kujira',
    networks: new Map<string, NetworkConfig>(
      Object.entries(configManager.get(`kujira.networks`))
    ),
    availableNetworks: [
      {
        chain: 'kujira',
        networks: Object.keys(configManager.get(`kujira.networks`)),
      },
    ],
    connector: 'kujira',
    prefix: configManager.get('kujira.prefix') || 'kujira',
    accountNumber: configManager.get('kujira.accountNumber') || 0,
    nativeToken: 'KUJI',
    gasPrice: BigNumber(configManager.get('kujira.gasPrice') || 0.00125),
    gasPriceSuffix: 'ukuji',
    gasLimitEstimate: BigNumber(
      configManager.get('kujira.gasLimitEstimate') || 0.009147
    ),
    tokens: {
      disallowed: configManager.get(`kujira.tokens.disallowed`),
      allowed: configManager.get(`kujira.tokens.allowed`),
    },
    markets: {
      disallowed: configManager.get(`kujira.markets.disallowed`),
      allowed: configManager.get(`kujira.markets.allowed`),
    },
    fees: {
      maker: BigNumber(0.075), // Percentual value (%)
      taker: BigNumber(0.15), // Percentual value (%)
      serviceProvider: BigNumber(0), // Percentual value (%)
    },
    orders: {
      create: {
        fee: configManager.get(`kujira.orders.create.fee`),
        maxPerTransaction: configManager.get(
          `kujira.orders.create.maxPerTransaction`
        ),
      },
      open: {
        limit: configManager.get(`kujira.orders.open.limit`) | 255,
        paginationLimit:
          configManager.get(`kujira.orders.open.paginationLimit`) | 31,
      },
      filled: {
        limit: configManager.get(`kujira.orders.filled.limit`) | 255,
      },
      cancel: {
        maxPerTransaction: configManager.get(
          `kujira.orders.cancel.maxPerTransaction`
        ),
      },
    },
    transactions: {
      merge: {
        createOrders: configManager.get(
          `kujira.transactions.merge.createOrders`
        ),
        cancelOrders: configManager.get(
          `kujira.transactions.merge.cancelOrders`
        ),
        settleFunds: configManager.get(`kujira.transactions.merge.settleFunds`),
      },
    },
    orderBook: {
      offset: configManager.get(`kujira.orderBook.offset`) || 0,
      limit: configManager.get(`kujira.orderBook.limit`) || 255,
    },
    retry: {
      all: {
        maxNumberOfRetries:
          configManager.get('kujira.retry.all.maxNumberOfRetries') || 0, // 0 means no retries
        delayBetweenRetries:
          configManager.get('kujira.retry.all.delayBetweenRetries') || 0, // 0 means no delay (milliseconds)
      },
    },
    timeout: {
      all: configManager.get('kujira.timeout.all') || 0, // 0 means no timeout (milliseconds)
    },
    parallel: {
      all: {
        batchSize: configManager.get('kujira.parallel.all.batchSize') || 0, // 0 means no batching (group all)
        delayBetweenBatches:
          configManager.get('kujira.parallel.all.delayBetweenBatches') || 0, // 0 means no delay (milliseconds)
      },
    },
  };
}
