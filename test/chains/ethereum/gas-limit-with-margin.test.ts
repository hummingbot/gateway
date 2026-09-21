import { BigNumber } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';

jest.mock('../../../src/services/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  redactUrl: jest.requireActual('../../../src/services/logger').redactUrl,
}));

// A Uniswap CLMM close on mainnet used 394k of its fixed 400k limit and reverted out of gas,
// with the fee paid (#629). The limit is now the node's estimate plus a margin, floored at
// the route's fixed figure, and a call the node cannot estimate is refused before any fee is
// paid; the method is unit-tested here against a stub contract.
const gasLimit = (estimate: () => Promise<BigNumber>, floor = 400000, marginPct?: number) =>
  (Ethereum.prototype as any).gasLimitWithMargin.call(
    {},
    { estimateGas: { multicall: jest.fn(estimate) } },
    'multicall',
    [['0xdeadbeef']],
    { value: BigNumber.from(0) },
    floor,
    marginPct,
  );

describe('Ethereum.gasLimitWithMargin', () => {
  it('adds the margin to an estimate above the floor', async () => {
    await expect(gasLimit(async () => BigNumber.from(600000))).resolves.toBe(750000);
    await expect(gasLimit(async () => BigNumber.from(600000), 400000, 10)).resolves.toBe(660000);
  });

  it('keeps the floor when the estimate with its margin is below it', async () => {
    await expect(gasLimit(async () => BigNumber.from(250000))).resolves.toBe(400000);
  });

  it('refuses the call, naming the reason, when the node cannot estimate', async () => {
    await expect(
      gasLimit(async () => {
        throw Object.assign(new Error('cannot estimate gas'), { reason: 'execution reverted: Not approved' });
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Could not estimate gas for multicall: execution reverted: Not approved. The transaction was not sent.',
    });
  });

  it('names only the error code, not the transport message, when the node did not answer', async () => {
    // an ethers SERVER_ERROR carries the request URL, and an Infura URL carries the credential
    const transportError = Object.assign(
      new Error(
        'missing response (requestBody=..., url="https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef", code=SERVER_ERROR)',
      ),
      { code: 'SERVER_ERROR' },
    );
    const refusal = gasLimit(async () => {
      throw transportError;
    });

    await expect(refusal).rejects.toMatchObject({
      statusCode: 400,
      message:
        'Could not estimate gas for multicall: the node did not answer (SERVER_ERROR). The transaction was not sent.',
    });
    await expect(refusal).rejects.not.toMatchObject({ message: expect.stringContaining('0123456789abcdef') });
  });

  it('passes the arguments and overrides to the estimate', async () => {
    const estimateGas = { multicall: jest.fn().mockResolvedValue(BigNumber.from(500000)) };
    await (Ethereum.prototype as any).gasLimitWithMargin.call(
      {},
      { estimateGas },
      'multicall',
      [['0xdeadbeef']],
      { value: BigNumber.from(7) },
      400000,
    );
    expect(estimateGas.multicall).toHaveBeenCalledWith(['0xdeadbeef'], { value: BigNumber.from(7) });
  });
});
