import {
  BoxSelection,
  DefaultBoxSelector,
  InsufficientInputs,
} from '@patternglobal/ergo-sdk';
import * as ergo_utils from '../../../src/chains/ergo/ergo.util';
import {
  minValueForOrder,
  minValueForSetup,
} from '@patternglobal/ergo-dex-sdk';
import { makeTarget } from '@patternglobal/ergo-dex-sdk/build/main/utils/makeTarget';

jest.mock('@patternglobal/ergo-dex-sdk', () => ({
  minValueForOrder: jest.fn().mockReturnValue(BigInt(100000)),
  minValueForSetup: jest.fn(),
}));

jest.mock('@patternglobal/ergo-dex-sdk/build/main/utils/makeTarget', () => ({
  makeTarget: jest.fn().mockReturnValue({} as any),
}));

describe('getBaseInputParameters', () => {
  const pool = {
    id: '1b694b15467c62f0cd4525e368dbdea2329c713aa200b73df4a622e950551b40',
    lp: {
      withAmount: (_sth: any) => {
        return {
          asset: {
            id: 'lpId',
            name: 'lpNmae',
            decimals: 0,
          },
          amount: BigInt(922336941265222),
        };
      },
    },
    x: {
      withAmount: (_sth: any) => {
        return {
          asset: {
            id: 'xId',
            name: 'xNmae',
            decimals: 9,
          },
          amount: BigInt(752313805260857),
        };
      },
      asset: {
        id: 'xId',
        name: 'xNmae',
        decimals: 9,
      },
    },
    y: {
      withAmount: (_sth: any) => {
        return {
          asset: {
            id: 'yId',
            name: 'yNmae',
            decimals: 3,
          },
          amount: BigInt(9322283969),
        };
      },
      asset: {
        id: 'yId',
        name: 'yNmae',
        decimals: 3,
      },
    },
    outputAmount: (_sth: any, _slippage: any) => {
      return 1;
    },
  };

  it('Should be defined', () => {
    expect(ergo_utils.getBaseInputParameters).toBeDefined();
  });

  it('Should calculate base input parameters when inputAmount.asset.id matches pool.x.asset.id', () => {
    const inputAmount = { asset: { id: 'xId' }, amount: 100 };
    const slippage = 0.02;

    const result: any = ergo_utils.getBaseInputParameters(pool as any, {
      inputAmount,
      slippage,
    });

    expect(result.baseInput).toEqual({
      asset: {
        id: 'xId',
        name: 'xNmae',
        decimals: 9,
      },
      amount: BigInt(752313805260857),
    });
    expect(result.baseInputAmount).toEqual(100);
    expect(result.minOutput).toEqual(1);
  });

  it('should calculate base input parameters when inputAmount.asset.id does not match pool.x.asset.id', () => {
    const inputAmount = { asset: { id: 'yId' }, amount: 100 };
    const slippage = 0.02;

    const result: any = ergo_utils.getBaseInputParameters(pool as any, {
      inputAmount,
      slippage,
    });

    expect(result.baseInput).toEqual({
      asset: {
        id: 'yId',
        name: 'yNmae',
        decimals: 3,
      },
      amount: BigInt(9322283969),
    });
    expect(result.baseInputAmount).toEqual(100);
    expect(result.minOutput).toEqual(1);
  });
});

describe('getInputs', () => {
  const utxos: any = [];
  const assets: any = [];
  const fees: any = {
    minerFee: BigInt(1),
    uiFee: BigInt(1),
    exFee: BigInt(1),
  };
  const ignoreMinBoxValue = false;
  const setup = false;
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('Should be defined', () => {
    expect(ergo_utils.getInputs).toBeDefined();
  });
  it('Should not call minValueForSetup method when setup is false', () => {
    jest
      .spyOn(DefaultBoxSelector, 'select')
      .mockReturnValue({} as unknown as BoxSelection);
    ergo_utils.getInputs(utxos, assets, fees, ignoreMinBoxValue, setup);
    expect(minValueForOrder).toHaveBeenCalledWith(
      fees.minerFee,
      fees.uiFee,
      fees.exFee,
    );
    expect(minValueForSetup).not.toHaveBeenCalledWith(
      fees.minerFee,
      fees.uiFee,
    );
  });
  it('Should call minValueForSetup method with correct parameters when setup is true', () => {
    jest
      .spyOn(DefaultBoxSelector, 'select')
      .mockReturnValue({} as unknown as BoxSelection);
    const setup = true;
    ergo_utils.getInputs(utxos, assets, fees, ignoreMinBoxValue, setup);
    expect(minValueForOrder).toHaveBeenCalledWith(
      fees.minerFee,
      fees.uiFee,
      fees.exFee,
    );
    expect(minValueForSetup).toHaveBeenCalledWith(fees.minerFee, fees.uiFee);
  });
  it('Should subtract minFeeForOrder with MinBoxValue when ignoreMinBoxValue is true', () => {
    const ignoreMinBoxValue = true;
    ergo_utils.getInputs(utxos, assets, fees, ignoreMinBoxValue, setup);
    expect(makeTarget).toHaveBeenCalledWith(assets, BigInt(40000));
  });
  it('Should map on utxos and cast the related types to string and return the data correctly', () => {
    jest
      .spyOn(DefaultBoxSelector, 'select')
      .mockReturnValue({} as unknown as BoxSelection);
    const utxos: any = [{ value: 1, assets: [{ amount: 2 }] }];
    const result = ergo_utils.getInputs(utxos, assets, fees);
    expect(DefaultBoxSelector.select).toHaveBeenCalledWith(
      [{ value: '1', assets: [{ amount: '2' }] }],
      {},
    );
    expect(result).toEqual({});
  });
  it('Should throw new Error when inputs are instanceof InsufficientInputs', () => {
    const err: InsufficientInputs = new InsufficientInputs('');
    jest.spyOn(DefaultBoxSelector, 'select').mockReturnValue(err);

    expect(() => ergo_utils.getInputs(utxos, assets, fees)).toThrow(
      `Error in getInputs function: InsufficientInputs -> ${err}`,
    );
  });
});

describe('getTxContext', () => {
  const inputs: any = {};
  const network: any = {};
  const address: string = 'address';
  const minerFee: bigint = BigInt(1);
  it('Should be defined', () => {
    expect(ergo_utils.getTxContext).toBeDefined();
  });

  it('Should return correct data', () => {
    const result = ergo_utils.getTxContext(inputs, network, address, minerFee);
    expect(result).toEqual({
      inputs,
      selfAddress: address,
      changeAddress: address,
      feeNErgs: minerFee,
      network,
    });
  });
});
