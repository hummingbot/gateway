import { TokenListType } from '../../services/base';
import { AvailableNetworks } from '../connector.requests';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

export namespace HydrationConfig {
  export interface NetworkConfig {
    nodeURL: string;
    transactionUrl: string;
    tokenListType: TokenListType;
    tokenListSource: string;
    nativeCurrencySymbol: string;
    feePaymentCurrencySymbol: string;
    tradingTypes: Array<string>;
    availableNetworks: Array<AvailableNetworks>;
    allowedSlippage: string;
  }

  const configManager = ConfigManagerV2.getInstance();

  export const config: NetworkConfig = {
    nodeURL: configManager.get('hydration.nodeURL'),
    transactionUrl: configManager.get('hydration.transactionUrl'),
    tokenListType: configManager.get('hydration.tokenListType'),
    tokenListSource: configManager.get('hydration.tokenListSource'),
    nativeCurrencySymbol: configManager.get('hydration.nativeCurrencySymbol'),
    feePaymentCurrencySymbol: configManager.get('hydration.feePaymentCurrencySymbol'),
    tradingTypes: ['AMM'],
    availableNetworks: [{ chain: 'polkadot', networks: ['mainnet'] }],
    allowedSlippage: configManager.get('hydration.allowedSlippage'),
  };
}

