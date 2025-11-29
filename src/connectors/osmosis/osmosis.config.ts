import { ConfigManagerV2 } from '../../services/config-manager-v2';

// Left in for logic to support JSON from URL but no longer used (moved to token service)
// tokenListType: URL
// tokenListSource: https://raw.githubusercontent.com/osmosis-labs/assetlists/refs/heads/main/osmosis-1/generated/frontend/assetlist.json
// tokenListType: URL
// tokenListSource: https://github.com/osmosis-labs/assetlists/raw/refs/heads/main/osmo-test-5/generated/frontend/assetlist.json

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export namespace OsmosisConfig {
  export const tradingTypes = ['amm', 'clmm'] as const; // , 'router' previously referred to StableSwap but now deactivated (not many SS pools anyway)
  export const networks = ['mainnet', 'testnet'] as const;
  export const chainNames = ['osmosis-1', 'osmo-test-5'] as const;
  export const chain = 'cosmos';

  export interface NetworkConfig {
    chainType: string;
    chainName: (network: string) => string;
    nodeURL: (network: string) => string;
    availableNetworks: Array<AvailableNetworks>;
    tradingTypes: (type: string) => Array<string>;
    nativeCurrencySymbol: string;
    feeTier: string;
    gasAdjustment: number;
    gasLimitTransaction: number;
    manualGasPrice: number;
    manualGasPriceToken: string;
    allowedSlippage: string;
    rpcAddressDynamicBaseFee: string;
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: boolean;
    defaultNetwork: string;
    defaultWallet: string;
  }

  export const config: NetworkConfig = {
    chainType: 'cosmos',
    chainName: (network: string) => ConfigManagerV2.getInstance().get(`osmosis.networks.${network}.chainName`),
    nodeURL: (network: string) => ConfigManagerV2.getInstance().get(`osmosis.networks.${network}.nodeURL`),
    availableNetworks: [
      {
        chain: 'osmosis',
        networks: ['mainnet', 'testnet'],
      },
    ],
    tradingTypes: (type: string) => {
      return type === 'router' ? ['AMM'] : ['CLMM'];
    },
    manualGasPrice: ConfigManagerV2.getInstance().get('osmosis.manualGasPrice'),
    manualGasPriceToken: ConfigManagerV2.getInstance().get('osmosis.manualGasPriceToken'),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get('osmosis.nativeCurrencySymbol'),
    gasLimitTransaction: ConfigManagerV2.getInstance().get('osmosis.gasLimitTransaction'),
    gasAdjustment: ConfigManagerV2.getInstance().get('osmosis.gasAdjustment'),
    allowedSlippage: ConfigManagerV2.getInstance().get('osmosis.allowedSlippage'),
    feeTier: ConfigManagerV2.getInstance().get('osmosis.feeTier'),
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: ConfigManagerV2.getInstance().get(
      'osmosis.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice',
    ),
    rpcAddressDynamicBaseFee: ConfigManagerV2.getInstance().get('osmosis.rpcAddressDynamicBaseFee'),
    defaultNetwork: ConfigManagerV2.getInstance().get('osmosis.defaultNetwork'),
    defaultWallet: ConfigManagerV2.getInstance().get('osmosis.defaultWallet'),
  };
}
