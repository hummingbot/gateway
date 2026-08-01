import { getAvailableSolanaNetworks } from '../../chains/solana/solana.utils';
import { AvailableNetworks } from '../../services/base';
import { ConfigManagerV2 } from '../../services/config-manager-v2';

// Helper to safely get config with fallback (handles missing namespace in tests)
function getConfigSafe<T>(key: string, defaultValue: T): T {
  try {
    const value = ConfigManagerV2.getInstance().get(key);
    return value !== undefined ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export namespace MetaDaoConfig {
  // Supported networks for MetaDAO (Solana only)
  export const chain = 'solana';
  export const networks = getAvailableSolanaNetworks();
  export type Network = string;

  // Supported trading types
  export const tradingTypes = ['futarchy'] as const;

  export interface RootConfig {
    programId: string;
    conditionalVaultProgramId: string;
    defaultSlippagePct: number;
    availableNetworks: Array<AvailableNetworks>;
  }

  export const config: RootConfig = {
    programId: getConfigSafe('metadao.programId', 'FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq'),
    conditionalVaultProgramId: getConfigSafe(
      'metadao.conditionalVaultProgramId',
      'VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg',
    ),
    defaultSlippagePct: getConfigSafe('metadao.defaultSlippagePct', 0.5),
    availableNetworks: [
      {
        chain,
        networks: networks,
      },
    ],
  };
}
