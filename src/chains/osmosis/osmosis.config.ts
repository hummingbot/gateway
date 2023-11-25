import { AvailableNetworks } from '../../services/config-manager-types';
import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { TokenListType } from '../../services/base';

export namespace OsmosisConfig {
  export interface NetworkConfig {
    chainType: string;
    chainId: (network: string) => string;
    rpcURL: (network: string) => string;
    tokenListType: (network: string) => TokenListType;
    tokenListSource: (network: string) => string;
    availableNetworks: Array<AvailableNetworks>;
    tradingTypes: (type: string) => Array<string>;
    nativeCurrencySymbol: string;

    feeTier: string;
    gasAdjustment: number;
    gasLimitTransaction: string;
    manualGasPrice: string;
    allowedSlippage: string;
    rpcAddressDynamicBaseFee: string;
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: boolean;
  }

  export const config: NetworkConfig = {
    chainType: 'osmosis',
    chainId: (network: string) =>
      ConfigManagerV2.getInstance().get(`osmosis.networks.${network}.chainId`),
    rpcURL: (network: string) =>
      ConfigManagerV2.getInstance().get(`osmosis.networks.${network}.rpcURL`),
    tokenListType: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `osmosis.networks.${network}.tokenListType`
      ),
    tokenListSource: (network: string) =>
      ConfigManagerV2.getInstance().get(
        `osmosis.networks.${network}.tokenListSource`
      ),
    availableNetworks: [
      {
        chain: 'osmosis',
        networks: ['mainnet', 'testnet'],
      },
    ],
    tradingTypes: (type: string) => {
      return type === 'swap' ? ['AMM_LP'] : ['AMM_LP'];
    },
    manualGasPrice: ConfigManagerV2.getInstance().get(`osmosis.manualGasPrice`),
    nativeCurrencySymbol: ConfigManagerV2.getInstance().get(`osmosis.nativeCurrencySymbol`),
    gasLimitTransaction: ConfigManagerV2.getInstance().get(`osmosis.gasLimitTransaction`),
    gasAdjustment: ConfigManagerV2.getInstance().get(`osmosis.gasAdjustment`),
    allowedSlippage: ConfigManagerV2.getInstance().get(`osmosis.allowedSlippage`),
    feeTier: ConfigManagerV2.getInstance().get(`osmosis.feeTier`),
    useEIP1559DynamicBaseFeeInsteadOfManualGasPrice: ConfigManagerV2.getInstance().get(`osmosis.useEIP1559DynamicBaseFeeInsteadOfManualGasPrice`),
    rpcAddressDynamicBaseFee: ConfigManagerV2.getInstance().get(`osmosis.rpcAddressDynamicBaseFee`),
  };
}