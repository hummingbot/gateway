import { AssetInfo } from '@oraichain/oraidex-contracts-sdk';
import { Token } from './oraidex.types';
import { CosmWasmClient, Cw20BaseQueryClient } from '@oraichain/common-contracts-sdk';
import * as constant from '@oraichain/oraidex-common/build/constant';

/**
 *
 * @param value
 * @param errorMessage
 */
export const getNotNullOrThrowError = <R>(
  value?: any,
  errorMessage: string = 'Value is null or undefined',
): R => {
  if (value === undefined || value === null) throw new Error(errorMessage);

  return value as R;
};

/**
 *
 * @param milliseconds
 */
export const sleep = (milliseconds: number) =>
  new Promise((callback) => setTimeout(callback, milliseconds));

/**
 *
 * @param address native denom or contract address
 * @returns return asset info
 */
export const parseToAssetInfo = (address: string): AssetInfo => {
  const lowercaseAddress = address.toLocaleLowerCase();

  if (lowercaseAddress === 'orai' || lowercaseAddress.startsWith('ibc/')) {
    return {
      native_token: {
        denom: address,
      },
    };
  }

  return {
    token: {
      contract_addr: address,
    },
  };
};

export const parseToToken = async (asset: AssetInfo, client: CosmWasmClient): Promise<Token> => {
  let token: Token;
  let cw20BaseQueryClient: Cw20BaseQueryClient;

  // @ts-ignore
  if (asset.token != undefined) {
    // @ts-ignore
    const tokenAddress = asset.token.contract_addr;
    cw20BaseQueryClient = new Cw20BaseQueryClient(
      client,
      tokenAddress,
    );
    const info = await cw20BaseQueryClient.tokenInfo();
    token = {
      decimals: info.decimals,
      name: info.name,
      symbol: info.symbol,
      assetInfo: {
        token: {
          contract_addr: tokenAddress,
        }
      },
    };
  } else {
    // @ts-ignore
    const tokenDenom = asset.native_token.denom;
    let symbol = tokenDenom;
    if (symbol.startsWith('ibc/')) {
      // @ts-ignore
      symbol = Object.keys(constant).find((key) => constant[key] === symbol)?.split('_')[0];
    }
    token = {
      // hardcode decinmal of native token
      decimals: 6,
      name: symbol.toUpperCase(),
      symbol: symbol.toUpperCase(),
      assetInfo: {
        native_token: {
          denom: tokenDenom,
        }
      },
    };
  }

  return token;
};

export const isNativeDenom = (token: AssetInfo): boolean => {
  return 'native_token' in token;
};
