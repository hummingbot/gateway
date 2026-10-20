/**
 * The chain-level EVM build/submit routes, end to end through the route table with no
 * live RPC: /chains/ethereum/build-wrap and build-unwrap, /chains/ethereum/build-approve,
 * and /chains/ethereum/submit taking back a transaction built here and signed outside.
 */
import { BigNumber, constants, ethers, utils, Wallet } from 'ethers';

import { chainRoutes } from '../../../../src/chains/chain.routes';
import { Ethereum, toTransactionRequest } from '../../../../src/chains/ethereum/ethereum';
import { PERMIT2_ADDRESS } from '../../../../src/chains/ethereum/permit2';
import { fastifyWithTypeProvider } from '../../../utils/testUtils';

const WETH = {
  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  symbol: 'WETH',
  decimals: 18,
  chainId: 1,
  name: 'WETH',
};
const USDC = {
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  symbol: 'USDC',
  decimals: 6,
  chainId: 1,
  name: 'USDC',
};
const SPENDER = '0x000000000000000000000000000000000000dEaD';

const wallet = Wallet.createRandom();
let erc20Allowance: BigNumber;
let permit2Amount: BigNumber;
let wethBalance: BigNumber;

function stubEthereum() {
  const provider = {
    getTransactionCount: jest.fn().mockResolvedValue(3),
    estimateGas: jest.fn().mockResolvedValue(BigNumber.from(40000)),
    sendTransaction: jest.fn(async (signed: string) => {
      const tx = utils.parseTransaction(signed);
      return { hash: tx.hash, nonce: tx.nonce, wait: jest.fn() };
    }),
  };
  const ethereum: any = Object.create(Ethereum.prototype);
  Object.assign(ethereum, { provider, chainId: 1, network: 'mainnet', nativeTokenSymbol: 'ETH' });
  ethereum.init = jest.fn();
  ethereum.getToken = jest.fn(async (t: string) => ({ WETH, USDC })[t] ?? null);
  ethereum.prepareGasOptions = jest.fn(async (_p: unknown, gasLimit: number) => ({
    gasLimit,
    type: 2,
    maxFeePerGas: BigNumber.from('20000000000'),
    maxPriorityFeePerGas: BigNumber.from('1000000000'),
  }));
  ethereum.handleTransactionExecution = jest.fn(async (tx: any) => ({
    status: 1,
    transactionHash: tx.hash,
    gasUsed: BigNumber.from(40000),
    effectiveGasPrice: BigNumber.from('10000000000'),
  }));
  jest.spyOn(Ethereum, 'getInstance').mockResolvedValue(ethereum);
  return { ethereum, provider };
}

const buildApp = async () => {
  const server = fastifyWithTypeProvider();
  await server.register(chainRoutes);
  return server;
};

describe('EVM chain build/submit routes', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildApp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    erc20Allowance = BigNumber.from(0);
    permit2Amount = BigNumber.from(0);
    wethBalance = utils.parseEther('1');
    jest.spyOn(ethers, 'Contract').mockImplementation(
      (address: string) =>
        ({
          // Permit2's allowance(owner, token, spender) is a struct; a token's is a number.
          allowance: jest.fn(async () =>
            address === PERMIT2_ADDRESS
              ? { amount: permit2Amount, expiration: BigNumber.from(2).pow(40) }
              : erc20Allowance,
          ),
          balanceOf: jest.fn(async () => wethBalance),
        }) as any,
    );
  });

  it('build-wrap returns the deposit unsigned, with the native value, and sends nothing', async () => {
    const { ethereum, provider } = stubEthereum();

    const response = await server.inject({
      method: 'POST',
      url: '/ethereum/build-wrap',
      payload: { network: 'mainnet', address: wallet.address, amount: '0.01' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.unsignedTransaction).toMatchObject({
      chainId: 1,
      from: wallet.address,
      to: WETH.address,
      data: new utils.Interface(['function deposit()']).encodeFunctionData('deposit'),
      value: utils.parseEther('0.01').toString(),
      nonce: 3,
      gasLimit: '48000',
      type: 2,
    });
    expect(body.approvals).toEqual([]);
    expect(body.simulated).toBe(true);
    expect(provider.sendTransaction).not.toHaveBeenCalled();
  });

  it('build-unwrap refuses more than the wallet holds, as unwrap does', async () => {
    stubEthereum();
    wethBalance = utils.parseEther('0.001');

    const response = await server.inject({
      method: 'POST',
      url: '/ethereum/build-unwrap',
      payload: { network: 'mainnet', address: wallet.address, amount: '0.01' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/Insufficient WETH balance/);
  });

  it('build-wrap on Solana is refused with the route to use', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/solana/build-wrap',
      payload: { network: 'mainnet-beta', address: '82SggYRE2Vo4jN4a2pk3aQ4SET4ctafZJGbowmCqyHx5', amount: '0.01' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/build-wrap is not supported for solana yet/);
  });

  it('build-approve returns the approval for the named spender and amount', async () => {
    stubEthereum();

    const response = await server.inject({
      method: 'POST',
      url: '/ethereum/build-approve',
      payload: { network: 'mainnet', address: wallet.address, spender: SPENDER, token: 'USDC', amount: '5' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.unsignedTransaction.to).toBe(USDC.address);
    const [spender, amount] = new utils.Interface(['function approve(address,uint256)']).decodeFunctionData(
      'approve',
      body.unsignedTransaction.data,
    );
    expect([spender, amount.toString()]).toEqual([SPENDER, utils.parseUnits('5', 6).toString()]);
  });

  it('build-approve for the Universal Router returns token -> Permit2 as the approval to send first', async () => {
    stubEthereum();

    const response = await server.inject({
      method: 'POST',
      url: '/ethereum/build-approve',
      payload: { network: 'mainnet', address: wallet.address, spender: 'uniswap/router', token: 'USDC', amount: '5' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.approvals).toHaveLength(1);
    expect(body.approvals[0]).toMatchObject({ spender: PERMIT2_ADDRESS, transaction: { to: USDC.address, nonce: 3 } });
    expect(body.unsignedTransaction).toMatchObject({ to: PERMIT2_ADDRESS, nonce: 4 });
  });

  it('build-approve with nothing to approve says so instead of building', async () => {
    stubEthereum();
    erc20Allowance = constants.MaxUint256;
    permit2Amount = constants.MaxUint256;

    const response = await server.inject({
      method: 'POST',
      url: '/ethereum/build-approve',
      payload: { network: 'mainnet', address: wallet.address, spender: 'uniswap/router', token: 'USDC', amount: '5' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toMatch(/already approved .* nothing to sign/);
  });

  describe('submit', () => {
    const signedWrap = async (chainId = 1) => {
      stubEthereum();
      const built = JSON.parse(
        (
          await server.inject({
            method: 'POST',
            url: '/ethereum/build-wrap',
            payload: { network: 'mainnet', address: wallet.address, amount: '0.01' },
          })
        ).body,
      );
      return wallet.signTransaction({ ...toTransactionRequest(built.unsignedTransaction), chainId });
    };

    it('broadcasts a transaction built by Gateway and signed outside it, and confirms it', async () => {
      const signed = await signedWrap();
      const { provider } = stubEthereum();

      const response = await server.inject({
        method: 'POST',
        url: '/ethereum/submit',
        payload: { network: 'mainnet', signedTransaction: signed },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        signature: utils.parseTransaction(signed).hash,
        status: 1,
        fee: 0.0004,
      });
      expect(provider.sendTransaction).toHaveBeenCalledWith(signed);
    });

    it('reports a transaction still unconfirmed as pending, for poll', async () => {
      const signed = await signedWrap();
      const { ethereum } = stubEthereum();
      ethereum.handleTransactionExecution.mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/ethereum/submit',
        payload: { network: 'mainnet', signedTransaction: signed },
      });

      expect(JSON.parse(response.body)).toEqual({
        signature: utils.parseTransaction(signed).hash,
        status: 0,
        fee: null,
      });
    });

    it('refuses a transaction signed for another chain, sending nothing', async () => {
      const signed = await signedWrap(8453);
      const { provider } = stubEthereum();

      const response = await server.inject({
        method: 'POST',
        url: '/ethereum/submit',
        payload: { network: 'mainnet', signedTransaction: signed },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toMatch(/signed for chain id 8453, but mainnet is chain id 1/);
      expect(provider.sendTransaction).not.toHaveBeenCalled();
    });

    it('refuses an unsigned transaction', async () => {
      stubEthereum();
      const unsigned = utils.serializeTransaction({ chainId: 1, nonce: 0, to: WETH.address, gasLimit: 21000, type: 2 });

      const response = await server.inject({
        method: 'POST',
        url: '/ethereum/submit',
        payload: { network: 'mainnet', signedTransaction: unsigned },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toMatch(/carries no signature/);
    });

    it('refuses Solana extraSigners', async () => {
      const signed = await signedWrap();

      const response = await server.inject({
        method: 'POST',
        url: '/ethereum/submit',
        payload: { network: 'mainnet', signedTransaction: signed, extraSigners: [{ pubkey: 'x', signature: 'y' }] },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toMatch(/extraSigners applies to Solana transactions only/);
    });
  });
});
