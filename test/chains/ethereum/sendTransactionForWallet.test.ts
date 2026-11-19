/**
 * Ethereum's signer seam: Ethereum.sendTransactionForWallet fills in the chain id and
 * nonce, has the wallet's signer sign, checks the signed transaction against what was
 * built, and broadcasts it.
 */
import { BigNumber, Wallet, utils } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';

const mockGetEthereumSigner = jest.fn();
jest.mock('../../../src/wallet/signers/registry', () => ({
  ...jest.requireActual('../../../src/wallet/signers/registry'),
  getEthereumSigner: (address: string) => mockGetEthereumSigner(address),
}));

const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';
const sendTransactionForWallet = Ethereum.prototype.sendTransactionForWallet;

const walletSigner = (wallet: Wallet) => ({
  kind: 'local',
  address: wallet.address,
  signTransaction: jest.fn(async (tx: any) => ({ kind: 'signed', value: await wallet.signTransaction(tx) })),
});

const ethereumThis = () =>
  Object.assign(Object.create(Ethereum.prototype), {
    chainId: 8453,
    prepareGasOptions: jest.fn(async (_gasPrice: unknown, gasLimit: number) => ({
      gasLimit,
      type: 2,
      maxFeePerGas: utils.parseUnits('2', 'gwei'),
      maxPriorityFeePerGas: utils.parseUnits('1', 'gwei'),
    })),
    provider: {
      getTransactionCount: jest.fn(async () => 7),
      estimateGas: jest.fn(async () => BigNumber.from(250000)),
      sendTransaction: jest.fn(async (raw: string) => ({ hash: utils.keccak256(raw) })),
    },
  });

const request = { to: ROUTER, data: '0xdeadbeef', value: '5', gasLimit: 300000, description: 'test call' };

describe('Ethereum.sendTransactionForWallet (the signer seam)', () => {
  const wallet = Wallet.createRandom();

  it('signs the populated transaction through the signer and broadcasts it', async () => {
    const signer = walletSigner(wallet);
    mockGetEthereumSigner.mockResolvedValue(signer);
    const fakeThis = ethereumThis();

    await sendTransactionForWallet.call(fakeThis, wallet.address, request);

    const [raw] = fakeThis.provider.sendTransaction.mock.calls[0];
    const sent = utils.parseTransaction(raw);
    expect(sent.from).toBe(wallet.address);
    expect(sent).toMatchObject({ chainId: 8453, nonce: 7, to: ROUTER, data: '0xdeadbeef', type: 2 });
    expect(sent.value.eq(BigNumber.from(5))).toBe(true);
  });

  it('refuses an external wallet before building anything', async () => {
    mockGetEthereumSigner.mockResolvedValue({ kind: 'external', address: wallet.address, signTransaction: jest.fn() });
    const fakeThis = ethereumThis();

    await expect(sendTransactionForWallet.call(fakeThis, wallet.address, request)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('is an external wallet'),
    });
    expect(fakeThis.provider.getTransactionCount).not.toHaveBeenCalled();
    expect(fakeThis.provider.sendTransaction).not.toHaveBeenCalled();
  });

  it('does not broadcast a transaction the signer changed', async () => {
    const signer = walletSigner(wallet);
    signer.signTransaction.mockImplementation(async (tx: any) => ({
      kind: 'signed',
      value: await wallet.signTransaction({ ...tx, to: '0x000000000000000000000000000000000000dEaD' }),
    }));
    mockGetEthereumSigner.mockResolvedValue(signer);
    const fakeThis = ethereumThis();

    await expect(sendTransactionForWallet.call(fakeThis, wallet.address, request)).rejects.toThrow(
      /differs from the one built: to 0x000000000000000000000000000000000000dEaD/,
    );
    expect(fakeThis.provider.sendTransaction).not.toHaveBeenCalled();
  });

  it('does not broadcast a transaction signed by another key', async () => {
    const signer = { ...walletSigner(Wallet.createRandom()), address: wallet.address };
    mockGetEthereumSigner.mockResolvedValue(signer);
    const fakeThis = ethereumThis();

    await expect(sendTransactionForWallet.call(fakeThis, wallet.address, request)).rejects.toThrow(/from 0x/);
    expect(fakeThis.provider.sendTransaction).not.toHaveBeenCalled();
  });
});
