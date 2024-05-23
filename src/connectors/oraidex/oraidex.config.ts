// import { BigNumber } from 'bignumber.js';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

const configManager = ConfigManagerV2.getInstance();

export interface NetworkConfig {
  name: string;
  nodeURL: string | null;
  chainId: string;
  tokenListType: string;
  tokenListSource: string;
}

export namespace OraidexConfig {
  export const config = {
    chainType: 'cosmos',
    tradingTypes: ['CLOB_SPOT'],
    chain: 'oraichain',
    networks: new Map<string, NetworkConfig>(
      Object.entries(configManager.get(`oraichain.networks`))
    ),
    availableNetworks: [
      {
        chain: 'oraichain',
        networks: Object.keys(configManager.get(`oraichain.networks`)),
      },
    ],
    swapLimitOrder: configManager.get(
      'oraidex.contractAddresses.mainnet.swapLimitOrder'
    ),
  };
}
