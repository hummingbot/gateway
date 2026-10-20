/**
 * The EVM signing chokepoint (Ethereum.sendTransactionForWallet) and the allowance checks
 * in front of it, in both modes:
 *
 *  - execute: build the unsigned transaction, sign it with the wallet, broadcast it.
 *  - build (captureEvmTransaction): return the same unsigned transaction, plus the
 *    approvals it needs at the preceding nonces, without loading a key or sending.
 *
 * No live RPC: the provider and the token/Permit2 contracts are stubs.
 */
import { BigNumber, constants, ethers, utils, Wallet } from 'ethers';

import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { captureEvmTransaction, EvmCall } from '../../../src/chains/ethereum/evm-build-mode';
import { MAX_UINT48, PERMIT2_ADDRESS } from '../../../src/chains/ethereum/permit2';

const mockGetEthereumSigner = jest.fn();
jest.mock('../../../src/wallet/signers/registry', () => ({
  ...jest.requireActual('../../../src/wallet/signers/registry'),
  getEthereumSigner: (address: string) => mockGetEthereumSigner(address),
}));

/** A local signer for `wallet`, as the seam would hand the chokepoint. */
const localSigner = (wallet: Wallet) => ({
  kind: 'local',
  address: wallet.address,
  signTransaction: jest.fn(async (tx: any) => ({ kind: 'signed', value: await wallet.signTransaction(tx) })),
});

const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';
const USDC = { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 };
const MAX_FEE = BigNumber.from('30000000000');
const PRIORITY_FEE = BigNumber.from('1000000000');

const swapCall: EvmCall = { to: ROUTER, data: '0x3593564c', value: '0', gasLimit: 500000, description: 'test swap' };

/** Token allowance (owner -> spender) and Permit2 allowance (owner, token -> router), as the stub contracts report them. */
let erc20Allowance: BigNumber;
let permit2Amount: BigNumber;
let permit2Expiration: number;

function stubContracts() {
  jest.spyOn(ethers, 'Contract').mockImplementation(
    (address: string) =>
      ({
        allowance: jest.fn(async () => {
          if (address === PERMIT2_ADDRESS) {
            return Object.assign([permit2Amount, BigNumber.from(permit2Expiration), BigNumber.from(0)], {
              amount: permit2Amount,
              expiration: BigNumber.from(permit2Expiration),
            });
          }
          return erc20Allowance;
        }),
      }) as any,
  );
}

function makeEthereum() {
  const provider = {
    getTransactionCount: jest.fn().mockResolvedValue(7),
    estimateGas: jest.fn().mockResolvedValue(BigNumber.from(100000)),
    sendTransaction: jest.fn(async (signed: string) => ({ hash: utils.parseTransaction(signed).hash, nonce: 7 })),
  };
  const ethereum: any = Object.create(Ethereum.prototype);
  Object.assign(ethereum, { provider, chainId: 1, network: 'mainnet', nativeTokenSymbol: 'ETH' });
  ethereum.prepareGasOptions = jest.fn(async (_gasPrice: unknown, gasLimit: number) => ({
    gasLimit,
    type: 2,
    maxFeePerGas: MAX_FEE,
    maxPriorityFeePerGas: PRIORITY_FEE,
  }));
  return { ethereum: ethereum as Ethereum, provider };
}

describe('EVM build mode', () => {
  const wallet = Wallet.createRandom();

  beforeEach(() => {
    jest.restoreAllMocks();
    mockGetEthereumSigner.mockReset();
    erc20Allowance = constants.MaxUint256;
    permit2Amount = BigNumber.from(2).pow(160).sub(1);
    permit2Expiration = MAX_UINT48;
    stubContracts();
  });

  it('builds the transaction execute would send, loading no key and sending nothing', async () => {
    const { ethereum, provider } = makeEthereum();

    const built = await captureEvmTransaction(() => ethereum.sendTransactionForWallet(wallet.address, swapCall));

    expect(built).toEqual({
      unsignedTransaction: {
        chainId: 1,
        from: wallet.address,
        to: ROUTER,
        data: '0x3593564c',
        value: '0',
        nonce: 7,
        gasLimit: '120000', // eth_estimateGas + 20%
        type: 2,
        maxFeePerGas: MAX_FEE.toString(),
        maxPriorityFeePerGas: PRIORITY_FEE.toString(),
      },
      approvals: [],
      simulated: true,
    });
    expect(provider.getTransactionCount).toHaveBeenCalledWith(wallet.address, 'pending');
    expect(provider.estimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ from: wallet.address, to: ROUTER, data: '0x3593564c' }),
    );
    // Build mode never looks up a signer: the address need not be a wallet Gateway holds.
    expect(mockGetEthereumSigner).not.toHaveBeenCalled();
    expect(provider.sendTransaction).not.toHaveBeenCalled();
  });

  it('execute signs exactly what build returns and broadcasts it', async () => {
    const { ethereum, provider } = makeEthereum();
    mockGetEthereumSigner.mockResolvedValue(localSigner(wallet));

    const built = await captureEvmTransaction(() => ethereum.sendTransactionForWallet(wallet.address, swapCall));
    await ethereum.sendTransactionForWallet(wallet.address, swapCall);

    const signed = utils.parseTransaction(provider.sendTransaction.mock.calls[0][0]);
    expect(signed.from).toBe(wallet.address);
    expect(signed.chainId).toBe(built.unsignedTransaction.chainId);
    expect(signed.nonce).toBe(built.unsignedTransaction.nonce);
    expect(signed.to).toBe(built.unsignedTransaction.to);
    expect(signed.data).toBe(built.unsignedTransaction.data);
    expect(signed.gasLimit.toString()).toBe(built.unsignedTransaction.gasLimit);
    expect(signed.maxFeePerGas!.toString()).toBe(built.unsignedTransaction.maxFeePerGas);
  });

  it('refuses a call that would revert, with the reason, before signing', async () => {
    const { ethereum, provider } = makeEthereum();
    const signer = localSigner(wallet);
    mockGetEthereumSigner.mockResolvedValue(signer);
    provider.estimateGas.mockRejectedValue(
      Object.assign(new Error('cannot estimate gas'), { reason: 'TooLittleReceived' }),
    );

    await expect(ethereum.sendTransactionForWallet(wallet.address, swapCall)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('TooLittleReceived'),
    });
    expect(signer.signTransaction).not.toHaveBeenCalled();
    expect(provider.sendTransaction).not.toHaveBeenCalled();
  });

  it('reports an operation that never reached the chokepoint as nothing to sign', async () => {
    await expect(captureEvmTransaction(async () => ({ status: 1 }))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('nothing to sign'),
    });
  });

  describe('requireAllowance', () => {
    const required = utils.parseUnits('2', 6);

    it('passes when the allowance covers the amount', async () => {
      const { ethereum } = makeEthereum();
      erc20Allowance = required;
      await expect(ethereum.requireAllowance(wallet.address, USDC, ROUTER, required, 'uniswap/amm')).resolves.toBe(
        undefined,
      );
    });

    it('execute refuses a short allowance and names what to approve', async () => {
      const { ethereum } = makeEthereum();
      erc20Allowance = utils.parseUnits('0.5', 6);
      await expect(
        ethereum.requireAllowance(wallet.address, USDC, ROUTER, required, 'uniswap/amm'),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringMatching(/Insufficient USDC allowance .*required 2\.0, current 0\.5.*"uniswap\/amm"/),
      });
    });

    it('build returns the approve first, then the operation at the next nonce, unsimulated', async () => {
      const { ethereum, provider } = makeEthereum();
      erc20Allowance = BigNumber.from(0);

      const built = await captureEvmTransaction(async () => {
        await ethereum.requireAllowance(wallet.address, USDC, ROUTER, required, 'uniswap/amm');
        await ethereum.sendTransactionForWallet(wallet.address, swapCall);
      });

      expect(built.approvals).toHaveLength(1);
      const [approval] = built.approvals;
      expect(approval).toMatchObject({ token: USDC.address, symbol: 'USDC', spender: ROUTER, amount: '2.0' });
      expect(approval.currentAllowance).toBe('0.0');
      expect(approval.transaction).toMatchObject({ to: USDC.address, nonce: 7, chainId: 1 });
      expect(
        new utils.Interface(['function approve(address,uint256)']).decodeFunctionData(
          'approve',
          approval.transaction.data,
        ),
      ).toEqual([ROUTER, required]);
      // The swap cannot be simulated before its approval lands: fixed gas limit, next nonce.
      expect(built.unsignedTransaction).toMatchObject({ nonce: 8, gasLimit: '500000' });
      expect(built.simulated).toBe(false);
      // Only the approval was simulated.
      expect(provider.estimateGas).toHaveBeenCalledTimes(1);
    });
  });

  describe('requirePermit2Allowance (Universal Router)', () => {
    const required = BigNumber.from('5824451');

    // Regression: max uint48 is the "never expires" sentinel /approve writes; turned into
    // a Date it is out of range, which used to 500 with "Invalid time value".
    it.each([
      ['never expires (max uint48)', MAX_UINT48],
      ['never expires (expiration = 0)', 0],
    ])('passes when the Permit2 allowance %s', async (_label, expiration) => {
      const { ethereum } = makeEthereum();
      permit2Expiration = expiration;
      await expect(
        ethereum.requirePermit2Allowance(wallet.address, USDC, ROUTER, required, 'uniswap/router'),
      ).resolves.toBe(undefined);
    });

    it('execute refuses an expired Permit2 allowance with a readable date', async () => {
      const { ethereum } = makeEthereum();
      const expiredAt = Math.floor(Date.now() / 1000) - 3600;
      permit2Expiration = expiredAt;
      await expect(
        ethereum.requirePermit2Allowance(wallet.address, USDC, ROUTER, required, 'uniswap/router'),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining(`expired at ${new Date(expiredAt * 1000).toISOString()}`),
      });
    });

    it('build returns both approvals in order: token -> Permit2, then Permit2 -> router', async () => {
      const { ethereum } = makeEthereum();
      erc20Allowance = BigNumber.from(0);
      permit2Amount = BigNumber.from(0);

      const built = await captureEvmTransaction(async () => {
        await ethereum.requirePermit2Allowance(wallet.address, USDC, ROUTER, required, 'uniswap/router');
        await ethereum.sendTransactionForWallet(wallet.address, swapCall);
      });

      expect(built.approvals.map((a) => [a.spender, a.transaction.to, a.transaction.nonce])).toEqual([
        [PERMIT2_ADDRESS, USDC.address, 7],
        [ROUTER, PERMIT2_ADDRESS, 8],
      ]);
      const permit2Args = new utils.Interface([
        'function approve(address token, address spender, uint160 amount, uint48 expiration)',
      ]).decodeFunctionData('approve', built.approvals[1].transaction.data);
      expect([permit2Args.token, permit2Args.spender, permit2Args.amount, permit2Args.expiration]).toEqual([
        USDC.address,
        ROUTER,
        required,
        MAX_UINT48,
      ]);
      expect(built.unsignedTransaction.nonce).toBe(9);
      expect(built.simulated).toBe(false);
    });
  });
});
