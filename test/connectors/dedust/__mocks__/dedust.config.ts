// ConfigManagerV2 is imported here because it's used in the mock implementation below
jest.mock('../../../../src/services/config-manager-v2', () => ({
  ConfigManagerV2: {
    getInstance: jest.fn().mockReturnValue({
      get: (key: string) => {
        const config: { [key: string]: any } = {
          'dedust.allowedSlippage': '2/100',
          'dedust.maxPriceImpact': 15,
          'server.logPath': './logs',
          'server.db': './db',
          'server.configPath': './config',
          'server.configFilePath': './config/config.yml',
          'server.certPassphrasePath': './config/cert-passphrase',
          'server.logToStdOut': true,
          'server.telemetry_enabled': false,
          'server.nonceDbPath': 'nonce.test.level',
          'server.transactionDbPath': 'transaction.test.level',
          'ton.network.maxLRUCacheInstances': 10,
          'ton.network.name': 'mainnet',
          'ton.network.nodeURL': 'https://toncenter.com/api/v2/jsonRPC',
          'ton.nativeCurrencySymbol': 'TON',
        };
        return config[key];
      },
      getNamespace: (namespace: string) => {
        const namespaces: { [key: string]: any } = {
          dedust: {
            allowedSlippage: '2/100',
            maxPriceImpact: 15,
          },
          ton: {
            network: {
              maxLRUCacheInstances: 10,
              name: 'mainnet',
              nodeURL: 'https://toncenter.com/api/v2/jsonRPC',
            },
            nativeCurrencySymbol: 'TON',
          },
          server: {
            logPath: './logs',
            db: './db',
            configPath: './config',
            configFilePath: './config/config.yml',
            certPassphrasePath: './config/cert-passphrase',
            logToStdOut: true,
            telemetry_enabled: false,
            nonceDbPath: 'nonce.test.level',
            transactionDbPath: 'transaction.test.level',
          }
        };
        return namespaces[namespace];
      },
    })
  }
})); 