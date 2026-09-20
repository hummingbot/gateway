import { fetchAllTickArray, getDynamicTickArrayEncoder, WhirlpoolDeployment } from '@orca-so/whirlpools-client';
import { address, lamports, type GetMultipleAccountsApi, type Rpc } from '@solana/kit';

describe('Orca tick-array compatibility', () => {
  it('decodes dynamic tick arrays through the unified fetchAllTickArray API', async () => {
    const tickArrayAddress = address('11111111111111111111111111111111');
    const whirlpoolAddress = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const encodedTickArray = getDynamicTickArrayEncoder().encode({
      startTickIndex: 5632,
      whirlpool: whirlpoolAddress,
      tickBitmap: 0n,
      ticks: Array.from({ length: 88 }, () => ({ __kind: 'Uninitialized' as const })),
    });
    const rpc = {
      getMultipleAccounts: jest.fn(() => ({
        send: jest.fn().mockResolvedValue({
          value: [
            {
              data: [Buffer.from(encodedTickArray).toString('base64'), 'base64'],
              executable: false,
              lamports: lamports(1n),
              owner: WhirlpoolDeployment.mainnet.programId,
              space: BigInt(encodedTickArray.length),
            },
          ],
        }),
      })),
    };

    const [tickArray] = await fetchAllTickArray(rpc as Rpc<GetMultipleAccountsApi>, [tickArrayAddress]);

    expect(tickArray.data.__kind).toBe('Dynamic');
    expect(tickArray.data.startTickIndex).toBe(5632);
    expect(tickArray.data.whirlpool).toBe(whirlpoolAddress);
    expect(tickArray.data.ticks).toHaveLength(88);
    expect(tickArray.data.ticks[0]).toEqual({
      initialized: false,
      liquidityGross: 0n,
      liquidityNet: 0n,
      feeGrowthOutsideA: 0n,
      feeGrowthOutsideB: 0n,
      rewardGrowthsOutside: [0n, 0n, 0n],
    });
  });
});
