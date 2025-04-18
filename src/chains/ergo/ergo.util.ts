import {
  BaseInputParameters,
  ErgoBox,
  ErgoBoxAsset,
} from './interfaces/ergo.interface';
import {
  AmmPool,
  minValueForOrder,
  minValueForSetup,
} from '@patternglobal/ergo-dex-sdk';
import {
  AssetAmount,
  MinBoxValue,
  DefaultBoxSelector,
  InsufficientInputs,
  TransactionContext,
  Address,
  BoxSelection,
} from '@patternglobal/ergo-sdk';
import { makeTarget } from '@patternglobal/ergo-dex-sdk/build/main/utils/makeTarget';
import { NetworkContext } from '@patternglobal/ergo-sdk/build/main/entities/networkContext';

export function getBaseInputParameters(
  pool: AmmPool,
  { inputAmount, slippage }: { inputAmount: any; slippage: number },
): BaseInputParameters {
  const baseInputAmount =
    inputAmount.asset.id === pool.x.asset.id
      ? pool.x.withAmount(inputAmount.amount)
      : pool.y.withAmount(inputAmount.amount);
  const minOutput = pool.outputAmount(baseInputAmount as any, slippage);
  return {
    baseInput: baseInputAmount as any,
    baseInputAmount: inputAmount.amount,
    minOutput: minOutput as any,
  };
}

export function getInputs(
  utxos: ErgoBox[],
  assets: AssetAmount[],
  fees: { minerFee: bigint; uiFee: bigint; exFee: bigint },
  ignoreMinBoxValue?: boolean,
  setup?: boolean,
): BoxSelection {
  let minFeeForOrder = minValueForOrder(fees.minerFee, fees.uiFee, fees.exFee);

  if (setup) {
    minFeeForOrder = minValueForSetup(fees.minerFee, fees.uiFee);
  }

  if (ignoreMinBoxValue) {
    minFeeForOrder -= MinBoxValue;
  }

  const target = makeTarget(assets, minFeeForOrder);
  const inputs = DefaultBoxSelector.select(
    utxos.map((utxo) => {
      const temp = Object(utxo);
      temp.value = BigInt(temp.value.toString());
      temp.assets = temp.assets.map((asset: ErgoBoxAsset) => {
        const temp2 = Object(asset);
        temp2.amount = BigInt(temp2.amount.toString());
        return temp2;
      });
      return temp;
    }),
    target,
  );
  if (inputs instanceof InsufficientInputs) {
    throw new Error(
      `Error in getInputs function: InsufficientInputs -> ${inputs}`,
    );
  }

  return inputs;
}

export function getTxContext(
  inputs: BoxSelection,
  network: NetworkContext,
  address: Address,
  minerFee: bigint,
): TransactionContext {
  return {
    inputs,
    selfAddress: address,
    changeAddress: address,
    feeNErgs: minerFee,
    network,
  };
}
