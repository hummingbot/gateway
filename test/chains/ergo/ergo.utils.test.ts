import * as ergo_utils from '../../../src/chains/ergo/ergo.util';

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
    console.log(pool.lp.withAmount(''));
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
