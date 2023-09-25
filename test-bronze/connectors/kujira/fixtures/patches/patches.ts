import { KujiraModel } from '../../../../../src/connectors/kujira/kujira.model';
import {
  AsyncFunctionType,
  BasicKujiraMarket,
  BasicKujiraToken,
  IMap,
  KujiraOrder,
  MarketId,
  TokenId,
} from '../../../../../src/connectors/kujira/kujira.types';
import data from './data';
import { patch } from '../../../../../test/services/patch';
import { ExecuteResult, JsonObject } from '@cosmjs/cosmwasm-stargate';
import { fin } from 'kujira.js';
import { StdFee } from '@cosmjs/amino';
import { Coin, EncodeObject } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate';
import { IndexedTx } from '@cosmjs/stargate/build/stargateclient';
import { isMap } from 'immutable';
import { getNotNullOrThrowError } from '../../../../../src/connectors/kujira/kujira.helpers';

export let usePatches = true;
export let useInputOutputWrapper = false;

export const enablePatches = () => (usePatches = true);
export const disablePatches = () => (usePatches = false);
export const enableInputOutputWrapper = () => (useInputOutputWrapper = true);
export const disableInputOutputWrapper = () => (useInputOutputWrapper = false);

const ordinalMap = IMap<string, number>().asMutable();

export const createPatches = (
  kujira: KujiraModel
): IMap<string, AsyncFunctionType<any, any>> => {
  const patches = IMap<string, AsyncFunctionType<any, any>>().asMutable();

  patches.setIn(['global', 'fetch'], async (testTitle: string) => {
    if (!usePatches) return;

    patch(global, 'fetch', async (...any: any[]) => {
      const inputArguments = any;

      if (!ordinalMap.has(testTitle)) {
        ordinalMap.set(testTitle, 0);
      }

      const ordinal =
        getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

      ordinalMap.set(testTitle, ordinal);

      const dataKey = ['global', 'fetch', testTitle, ordinal];

      const key: string = JSON.stringify(dataKey);

      if (useInputOutputWrapper) {
        return await inputOutputWrapper<any>(
          dataKey,
          global,
          'fetch',
          inputArguments
        );
      }

      return getNotNullOrThrowError<any>(data.get(key)) as any;
    });
  });

  patches.setIn(['kujira', 'decryptWallet'], async (testTitle: string) => {
    if (!usePatches) return;

    patch(kujira, 'decryptWallet', async (...any: any[]) => {
      const inputArguments = any;

      if (!ordinalMap.has(testTitle)) {
        ordinalMap.set(testTitle, 0);
      }

      const ordinal =
        getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

      ordinalMap.set(testTitle, ordinal);

      const dataKey = ['kujira', 'decryptWallet', testTitle, ordinal];

      if (useInputOutputWrapper) {
        return await inputOutputWrapper<any>(
          dataKey,
          kujira,
          'decryptWallet',
          inputArguments
        );
      }

      return {
        mnemonic: data.get('KUJIRA_MNEMONIC'),
        accountNumber: data.get('KUJIRA_ACCOUNT_NUMBER'),
        publicKey: data.get('KUJIRA_PUBLIC_KEY'),
      } as any;
    });
  });

  patches.setIn(['kujira', 'getFastestRpc'], async (testTitle: string) => {
    if (!usePatches) return;

    patch(kujira, 'getFastestRpc', async (...any: any[]) => {
      const inputArguments = any;

      if (!ordinalMap.has(testTitle)) {
        ordinalMap.set(testTitle, 0);
      }

      const ordinal =
        getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

      ordinalMap.set(testTitle, ordinal);

      const dataKey = ['kujira', 'getFastestRpc', testTitle, ordinal];

      const key: string = JSON.stringify(dataKey);

      if (useInputOutputWrapper) {
        return await inputOutputWrapper<any>(
          dataKey,
          kujira,
          'getFastestRpc',
          inputArguments
        );
      }

      return getNotNullOrThrowError<any>(data.get(key)) as any;
    });
  });

  patches.setIn(
    ['kujira', 'kujiraGetHttpBatchClient'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(kujira, 'kujiraGetHttpBatchClient', async (...any: any[]) => {
        const inputArguments = any;

        if (!ordinalMap.has(testTitle)) {
          ordinalMap.set(testTitle, 0);
        }

        const ordinal =
          getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

        ordinalMap.set(testTitle, ordinal);

        const dataKey = [
          'kujira',
          'kujiraGetHttpBatchClient',
          testTitle,
          ordinal,
        ];

        const key: string = JSON.stringify(dataKey);

        if (useInputOutputWrapper) {
          return await inputOutputWrapper<any>(
            dataKey,
            kujira,
            'kujiraGetHttpBatchClient',
            inputArguments
          );
        }

        return getNotNullOrThrowError<any>(data.get(key)) as any;
      });
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetTendermint34Client'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(kujira, 'kujiraGetTendermint34Client', async (...any: any[]) => {
        const inputArguments = any;

        if (!ordinalMap.has(testTitle)) {
          ordinalMap.set(testTitle, 0);
        }

        const ordinal =
          getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

        ordinalMap.set(testTitle, ordinal);

        const dataKey = [
          'kujira',
          'kujiraGetTendermint34Client',
          testTitle,
          ordinal,
        ];

        const key: string = JSON.stringify(dataKey);

        if (useInputOutputWrapper) {
          return await inputOutputWrapper<any>(
            dataKey,
            kujira,
            'kujiraGetTendermint34Client',
            inputArguments
          );
        }

        return getNotNullOrThrowError<any>(data.get(key)) as any;
      });
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetKujiraQueryClient'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(kujira, 'kujiraGetKujiraQueryClient', async (...any: any[]) => {
        const inputArguments = any;

        if (!ordinalMap.has(testTitle)) {
          ordinalMap.set(testTitle, 0);
        }

        const ordinal =
          getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

        ordinalMap.set(testTitle, ordinal);

        const dataKey = [
          'kujira',
          'kujiraGetKujiraQueryClient',
          testTitle,
          ordinal,
        ];

        const key: string = JSON.stringify(dataKey);

        if (useInputOutputWrapper) {
          return await inputOutputWrapper<any>(
            dataKey,
            kujira,
            'kujiraGetKujiraQueryClient',
            inputArguments
          );
        }

        return getNotNullOrThrowError<any>(data.get(key)) as any;
      });
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetStargateClient'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(kujira, 'kujiraGetStargateClient', async (...any: any[]) => {
        const inputArguments = any;

        if (!ordinalMap.has(testTitle)) {
          ordinalMap.set(testTitle, 0);
        }

        const ordinal =
          getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

        ordinalMap.set(testTitle, ordinal);

        const dataKey = [
          'kujira',
          'kujiraGetStargateClient',
          testTitle,
          ordinal,
        ];

        const key: string = JSON.stringify(dataKey);

        if (useInputOutputWrapper) {
          return await inputOutputWrapper<any>(
            dataKey,
            kujira,
            'kujiraGetStargateClient',
            inputArguments
          );
        }

        return getNotNullOrThrowError<any>(data.get(key)) as any;
      });
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetSigningStargateClient'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(kujira, 'kujiraGetSigningStargateClient', async (...any: any[]) => {
        const inputArguments = any;

        if (!ordinalMap.has(testTitle)) {
          ordinalMap.set(testTitle, 0);
        }

        const ordinal =
          getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

        ordinalMap.set(testTitle, ordinal);

        const dataKey = [
          'kujira',
          'kujiraGetSigningStargateClient',
          testTitle,
          ordinal,
        ];

        const key: string = JSON.stringify(dataKey);

        if (useInputOutputWrapper) {
          return await inputOutputWrapper<any>(
            dataKey,
            kujira,
            'kujiraGetSigningStargateClient',
            inputArguments
          );
        }

        return getNotNullOrThrowError<any>(data.get(key)) as any;
      });
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetSigningCosmWasmClient'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(kujira, 'kujiraGetSigningCosmWasmClient', async (...any: any[]) => {
        const inputArguments = any;

        if (!ordinalMap.has(testTitle)) {
          ordinalMap.set(testTitle, 0);
        }

        const ordinal =
          getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

        ordinalMap.set(testTitle, ordinal);

        const dataKey = [
          'kujira',
          'kujiraGetSigningCosmWasmClient',
          testTitle,
          ordinal,
        ];

        const key: string = JSON.stringify(dataKey);

        if (useInputOutputWrapper) {
          return await inputOutputWrapper<any>(
            dataKey,
            kujira,
            'kujiraGetSigningCosmWasmClient',
            inputArguments
          );
        }

        return getNotNullOrThrowError<any>(data.get(key)) as any;
      });
    }
  );

  patches.setIn(
    ['kujira', 'kujiraFinClientWithdrawOrders'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraFinClientWithdrawOrders',
        async (
          finClient: fin.FinClient,
          orderIdxs: {
            orderIdxs?: string[];
          },
          fee: number | StdFee | 'auto' = 'auto',
          memo?: string,
          funds?: readonly Coin[]
        ): Promise<ExecuteResult> => {
          const inputArguments = [finClient, orderIdxs, fee, memo, funds];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraFinClientWithdrawOrders',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<ExecuteResult>(
              dataKey,
              kujira,
              'kujiraFinClientWithdrawOrders',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as ExecuteResult;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetBasicMarkets'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraGetBasicMarkets',
        async (): Promise<IMap<MarketId, BasicKujiraMarket>> => {
          const inputArguments: any[] = [];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraGetBasicMarkets',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<IMap<MarketId, BasicKujiraMarket>>(
              dataKey,
              kujira,
              'kujiraGetBasicMarkets',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as IMap<
            MarketId,
            BasicKujiraMarket
          >;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraGetBasicTokens'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraGetBasicTokens',
        async (): Promise<IMap<TokenId, BasicKujiraToken>> => {
          const inputArguments: any[] = [];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraGetBasicTokens',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<IMap<TokenId, BasicKujiraToken>>(
              dataKey,
              kujira,
              'kujiraGetBasicTokens',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as IMap<
            TokenId,
            BasicKujiraToken
          >;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraQueryClientWasmQueryContractSmart'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraQueryClientWasmQueryContractSmart',
        async (address: string, query: JsonObject): Promise<JsonObject> => {
          const inputArguments = [address, query];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraQueryClientWasmQueryContractSmart',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<JsonObject>(
              dataKey,
              kujira,
              'kujiraQueryClientWasmQueryContractSmart',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as JsonObject;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraSigningStargateClientSignAndBroadcast'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraSigningStargateClientSignAndBroadcast',
        async (
          signingStargateClient: SigningStargateClient,
          signerAddress: string,
          messages: readonly EncodeObject[],
          fee: StdFee | 'auto' | number,
          memo?: string
        ): Promise<KujiraOrder> => {
          const inputArguments = [
            signingStargateClient,
            signerAddress,
            messages,
            fee,
            memo,
          ];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraSigningStargateClientSignAndBroadcast',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<KujiraOrder>(
              dataKey,
              kujira,
              'kujiraSigningStargateClientSignAndBroadcast',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as KujiraOrder;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraStargateClientGetAllBalances'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraStargateClientGetAllBalances',
        async (address: string): Promise<readonly Coin[]> => {
          const inputArguments = [address];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraStargateClientGetAllBalances',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<readonly Coin[]>(
              dataKey,
              kujira,
              'kujiraStargateClientGetAllBalances',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as readonly Coin[];
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraStargateClientGetBalanceStaked'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraStargateClientGetBalanceStaked',
        async (address: string): Promise<Coin | null> => {
          const inputArguments = [address];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraStargateClientGetBalanceStaked',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<Coin | null>(
              dataKey,
              kujira,
              'kujiraStargateClientGetBalanceStaked',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as Coin | null;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraStargateClientGetHeight'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraStargateClientGetHeight',
        async (): Promise<number> => {
          const inputArguments: any[] = [];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraStargateClientGetHeight',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<number>(
              dataKey,
              kujira,
              'kujiraStargateClientGetHeight',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as number;
        }
      );
    }
  );

  patches.setIn(
    ['kujira', 'kujiraStargateClientGetTx'],
    async (testTitle: string) => {
      if (!usePatches) return;

      patch(
        kujira,
        'kujiraStargateClientGetTx',
        async (id: string): Promise<IndexedTx | null> => {
          const inputArguments = [id];

          if (!ordinalMap.has(testTitle)) {
            ordinalMap.set(testTitle, 0);
          }

          const ordinal =
            getNotNullOrThrowError<number>(ordinalMap.get(testTitle)) + 1;

          ordinalMap.set(testTitle, ordinal);

          const dataKey = [
            'kujira',
            'kujiraStargateClientGetTx',
            testTitle,
            ordinal,
          ];

          const key: string = JSON.stringify(dataKey);

          if (useInputOutputWrapper) {
            return await inputOutputWrapper<IndexedTx | null>(
              dataKey,
              kujira,
              'kujiraStargateClientGetTx',
              inputArguments
            );
          }

          return getNotNullOrThrowError<any>(data.get(key)) as IndexedTx | null;
        }
      );
    }
  );

  return patches;
};

export const getPatch = <R = AsyncFunctionType<any, any>>(
  patches: IMap<string, AsyncFunctionType<any, any>>,
  keyPath: string[]
): R => {
  return patches.getIn(keyPath) as R;
};

const inputOutputWrapper = async <R>(
  dataKey: any[],
  targetObject: any,
  targetFunctionName: string,
  targetFunctionArguments: any[] = []
): Promise<R> => {
  const originalTargetFunction =
    targetObject[`__original__${targetFunctionName}`];

  const result = await originalTargetFunction.value.apply(
    targetObject,
    targetFunctionArguments
  );

  const key: string = JSON.stringify(dataKey);

  if (data.has(key)) {
    if (result === getNotNullOrThrowError<any>(data.get(key))) {
      return result as R;
    }
  }

  data.set(key, result);

  let value: string;
  if (isMap(result)) {
    value = `IMap<any, any>(${JSON.stringify(result)}).asMutable()`;
  } else if (result != null && typeof result == 'object' && 'tx' in result) {
    value = JSON.stringify(result).replace(
      /"tx":\{(.*?)}/,
      '"tx": new Uint8Array(Object.values({$1}))'
    );
  } else {
    value = JSON.stringify(result);
  }

  console.log(`data.set(\`${key}\`, ${value})`);

  return result as R;
};
