import { ConfigManagerV2 } from '../../services/config-manager-v2';
import { AvailableNetworks } from '../../services/config-manager-types';

export namespace StonfiConfig {
  export interface NetworkConfig {
    allowedSlippage: string;
    tradingTypes: Array<string>;
    chainType: string;
    availableNetworks: Array<AvailableNetworks>;
  }

  export interface StonfiQuoteRes {
    askAddress: string;
    askJettonWallet: string;
    askUnits: string;
    feeAddress: string;
    feePercent: string;
    feeUnits: string;
    minAskUnits: string;
    offerAddress: string;
    offerJettonWallet: string;
    offerUnits: string;
    poolAddress: string;
    priceImpact: string;
    routerAddress: string;
    slippageTolerance: string;
    swapRate: string;
  }

  export const config: NetworkConfig = {
    allowedSlippage: ConfigManagerV2.getInstance().get(
      'stonfi.allowedSlippage',
    ),
    tradingTypes: ['AMM'],
    chainType: 'TON',
    availableNetworks: [{ chain: 'ton', networks: ['mainnet', 'testnet'] }],
  };
}
