import { ConfigManagerV2 } from '../../services/config-manager-v2';
export interface NetworkConfig {
  name: string;
  nodeURL: string;
  // DISABLED:
  // tokenListType: URL
  // tokenListSource: https://cosmos-chain-registry-list.vercel.app/list.json
}

interface AvailableNetworks {
  chain: string;
  networks: Array<string>;
}

export interface Config {
  network: NetworkConfig;
  chainName: string;
  nativeCurrencySymbol: string;
  manualGasPriceToken: string;
  gasAdjustment: number;
  manualGasPrice: number;
  gasLimitTransaction: number;
  allowedSlippage: string;
  feeTier: string;
  useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: boolean;
  rpcAddressDynamicBaseFee: string;
  defaultNetwork: string;
  defaultWallet: string;
  availableNetworks: Array<AvailableNetworks>;
}

export function getCosmosConfig(network: string): Config {
  const configManager = ConfigManagerV2.getInstance();
  return {
    network: {
      name: network,
      nodeURL: configManager.get(network + '.networks.' + network + '.nodeURL'),
    },
    chainName: configManager.get(network + '.networks.' + network + '.chainName'),
    availableNetworks: [
      {
        chain: 'osmosis',
        networks: ['mainnet', 'testnet'],
      },
    ],
    nativeCurrencySymbol: configManager.get(network + '.nativeCurrencySymbol'),
    manualGasPrice: configManager.get(network + '.manualGasPrice'),
    gasLimitTransaction: configManager.get(network + '.gasLimitTransaction'),
    manualGasPriceToken: configManager.get(network + '.manualGasPriceToken'),
    gasAdjustment: configManager.get(network + '.gasAdjustment'),
    allowedSlippage: configManager.get(network + '.allowedSlippage'),
    feeTier: configManager.get(network + '.feeTier'),
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: configManager.get(
      network + '.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice',
    ),
    rpcAddressDynamicBaseFee: configManager.get(network + '.rpcAddressDynamicBaseFee'),
    defaultNetwork: configManager.get(network + '.defaultNetwork'),
    defaultWallet: configManager.get(network + '.defaultWallet'),
  };
}
