import { Asset as CurrentAsset } from '@chain-registry/types'; // latest version , DenomUnit as AssetDenomUnit

export const getExponentForAsset = (asset: CurrentAsset | FormerAsset | any): number => {
  const denomUnits = (asset as any).denomUnits ?? (asset as any).denom_units;
  if (asset && denomUnits) {
    const unit = denomUnits.find(({ denom }: DenomUnit) => denom === asset.display);
    if (unit) {
      return unit.exponent;
    }
  } else if (asset.decimals) {
    return asset.decimals;
  }
  return 0;
};

export interface AssetList {
  $schema?: string;
  chainName: string;
  chain_name: string;
  assets: CosmosAsset[];
}

export class CosmosAssetPrice {
  poolId: string;
  denom: string;
}

// Newer universal type due to changes in Cosmos/Osmosis Asset formats and discrepancies between versions
export class CosmosAsset {
  // implements CurrentAsset, FormerAsset - everything recreated here
  decimals: number = 0;
  chainName: string;
  sourceDenom: string;
  coinMinimalDenom: string;
  price?: CosmosAssetPrice;
  constructor(asset: CurrentAsset | FormerAsset) {
    const _logoURIs = (asset as any).logoURIs ?? (asset as any).logo_URIs;
    const _denomUnits = (asset as any).denomUnits ?? (asset as any).denom_units ?? [];
    const _coingeckoId = (asset as any).coingeckoId ?? (asset as any).coingecko_id;
    const _extendedDescription = (asset as any).extendedDescription ?? (asset as any).extended_description;
    const _typeAsset = (asset as any).typeAsset ?? (asset as any).type_asset ?? '';
    const _decimals = (asset as any).decimals ?? getExponentForAsset(asset);
    const _price = (asset as any).price ?? undefined;
    const _base = (asset as any).base ?? (asset as any).sourceDenom;

    this.base = this.sourceDenom = _base;
    this.coinMinimalDenom = (asset as any).coinMinimalDenom ?? _base;
    this.logoURIs = this.logo_URIs = _logoURIs;
    this.denomUnits = this.denom_units = _denomUnits;
    this.coingeckoId = this.coingecko_id = _coingeckoId;
    this.extendedDescription = this.extended_description = _extendedDescription;
    this.typeAsset = this.type_asset = _typeAsset;
    this.decimals = _decimals;
    this.price = _price;
    this.description = asset.description;
    if (asset.address != null) {
      this.address = asset.address;
    }
    this.base = asset.base;
    this.name = asset.name;
    this.display = asset.display;
    this.symbol = asset.symbol;
    this.keywords = asset.keywords;

    if (asset.ibc) {
      const _sourceChannel = (asset as any).sourceChannel ?? (asset as any).source_channel;
      const _sourceDenom = (asset as any).sourceDenom ?? (asset as any).source_denom;
      const _dstChannel = (asset as any).dstChannel ?? (asset as any).dst_channel;

      this.ibc = {
        sourceChannel: _sourceChannel,
        sourceDenom: _sourceDenom,
        dstChannel: _dstChannel,
        source_channel: _sourceChannel,
        dst_channel: _dstChannel,
        source_denom: _sourceDenom,
      };
    }
  }
  deprecated?: boolean;
  extendedDescription?: string;
  extended_description?: string;
  denom_units: DenomUnit[];
  type_asset:
    | 'sdk.coin'
    | 'cw20'
    | 'erc20'
    | 'ics20'
    | 'snip20'
    | 'snip25'
    | 'bitcoin-like'
    | 'evm-base'
    | 'svm-base'
    | 'substrate'
    | 'sdk.factory'
    | 'bitsong'
    | 'unknown';
  typeAsset:
    | 'sdk.coin'
    | 'cw20'
    | 'erc20'
    | 'ics20'
    | 'snip20'
    | 'snip25'
    | 'bitcoin-like'
    | 'evm-base'
    | 'svm-base'
    | 'substrate'
    | 'sdk.factory'
    | 'bitsong'
    | 'unknown';
  traces?: (IbcTransition | IbcCw20Transition | IbcBridgeTransition | NonIbcTransition)[];
  logo_URIs?: { png?: string; svg?: string };
  images?: {
    image_sync?: Pointer;
    png?: string;
    svg?: string;
    theme?: {
      primaryColorHex?: string;
      primary_color_hex?: string;
      backgroundColorHex?: string;
      background_color_hex?: string;
      circle?: boolean;
      darkMode?: boolean;
      dark_mode?: boolean;
      monochrome?: boolean;
    };
  }[];
  coingecko_id?: string;
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
    medium?: string;
    reddit?: string;
  };
  description?: string;
  address: string = '';
  denomUnits: DenomUnit[] = [];
  base: string; // this is denom!!!
  name: string;
  display: string;
  symbol: string;
  logoURIs?: {
    png?: string;
    svg?: string;
    jpeg?: string;
  };
  coingeckoId?: string;
  keywords?: string[];
  ibc?: {
    sourceChannel: string;
    sourceDenom: string;
    dstChannel: string;
    source_channel: string;
    dst_channel: string;
    source_denom: string;
  };
}

export interface DenomUnit {
  denom: string;
  exponent: number;
  aliases?: string[];
}
export interface Pointer {
  chainName: string;
  chain_name: string;
  baseDenom?: string;
  base_denom?: string;
}
export interface IbcTransition {
  type: 'ibc';
  counterparty: {
    chainName: string;
    baseDenom: string;
    channelId: string;
    chain_name: string;
    base_denom: string;
    channel_id: string;
  };
  chain: {
    channelId: string;
    channel_id: string;
    path?: string;
  };
}
export interface IbcCw20Transition {
  type: 'ibc-cw20';
  counterparty: {
    chainName: string;
    baseDenom: string;
    port: string;
    channelId: string;
    chain_name: string;
    base_denom: string;
    channel_id: string;
  };
  chain: {
    port: string;
    channelId: string;
    channel_id: string;
    path?: string;
  };
}
export interface IbcBridgeTransition {
  type: 'ibc-bridge';
  counterparty: {
    chain_name: string;
    base_denom: string;
    port?: string;
    channel_id: string;
  };
  chain: {
    port?: string;
    channel_id: string;
    path?: string;
  };
  provider: string;
}
export interface NonIbcTransition {
  type: 'bridge' | 'liquid-stake' | 'synthetic' | 'wrapped' | 'additional-mintage' | 'test-mintage' | 'legacy-mintage';
  counterparty: {
    chainName: string;
    baseDenom: string;
    chain_name: string;
    base_denom: string;
    contract?: string;
  };
  chain?: {
    contract: string;
  };
  provider: string;
}

// Pasting old type from @chain-registry/types
export interface FormerAsset {
  deprecated?: boolean;
  description?: string;
  extended_description?: string;
  denom_units: DenomUnit[];
  type_asset:
    | 'sdk.coin'
    | 'cw20'
    | 'erc20'
    | 'ics20'
    | 'snip20'
    | 'snip25'
    | 'bitcoin-like'
    | 'evm-base'
    | 'svm-base'
    | 'substrate'
    | 'unknown';
  address?: string;
  base: string;
  name: string;
  display: string;
  symbol: string;
  traces?: (IbcTransition | IbcCw20Transition | IbcBridgeTransition | NonIbcTransition)[];
  ibc?: {
    source_channel: string;
    dst_channel: string;
    source_denom: string;
  };
  logo_URIs?: {
    png?: string;
    svg?: string;
  };
  images?: {
    image_sync?: Pointer;
    png?: string;
    svg?: string;
    theme?: {
      primary_color_hex?: string;
      background_color_hex?: string;
      circle?: boolean;
      dark_mode?: boolean;
      monochrome?: boolean;
    };
  }[];
  coingecko_id?: string;
  keywords?: string[];
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
    medium?: string;
    reddit?: string;
  };
}
