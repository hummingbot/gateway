import { BalanceRequest, PollRequest } from '../../../src/chains/tezos/tezos.request';
import { NonceRequest } from '../../../src/evm/evm.requests';
import { allowances, approve, balances, getTokenSymbolsToTokens, nonce, poll } from '../../../src/chains/tezos/tezos.controllers';
import { BigNumber } from 'ethers';


describe('Tezos API', () => {
  describe('nonce', () => {
    it('should return the nonce of the given address', async () => {
      // Mock Tezos instance
      const tezos = { getNonce: jest.fn().mockResolvedValue('1') };

      const req: NonceRequest = {
        chain: 'tezos',
        network: 'mainnet',
        address: 'tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV'
      };
      const res = await nonce(tezos as any, req);
      expect(res).toHaveProperty('nonce', '1');
      expect(tezos.getNonce).toHaveBeenCalledWith('tz1TGu6TN5GSez2ndXXeDX6LgUDvLzPLqgYV');
    });
  });

  describe('getTokenSymbolsToTokens', () => {
    it('should return an object of token symbols to token info', () => {
      const tokenInfo = {
        address: "tokenAddress",
        chainId: "tezos",
        decimals: "6",
        name: "token",
        symbol: "token",
        standard: "fa1.2",
        tokenId: "tokenId",
      };
      const tezos = {
        getTokenForSymbol: jest.fn().mockReturnValue(tokenInfo)
      };
      const symbols = ['token1', 'token2'];

      const res = getTokenSymbolsToTokens(tezos as any, symbols);
      expect(res).toEqual({ token1: tokenInfo, token2: tokenInfo });
      expect(tezos.getTokenForSymbol).toHaveBeenCalledTimes(2);
    });
  });

  describe('balances', () => {
    it('should return the balances of the given address and token symbols', async () => {

      const tokenInfo = {
        address: "tokenAddress",
        chainId: "tezos",
        decimals: "6",
        name: "token",
        symbol: "token",
        standard: "fa1.2",
        tokenId: "tokenId",
      };

      // Mock Tezos instance
      const tezos = {
        chainName: 'tezos',
        getWallet: jest.fn().mockReturnValue({
          signer: {
            publicKeyHash: jest.fn(() => 'walletAddress')
          }
        }),
        nativeTokenSymbol: 'XTZ',
        getNativeBalance: jest.fn().mockReturnValue({ value: BigNumber.from('5000000'), decimals: 6 }),
        getTokenBalance: jest.fn().mockReturnValue({ value: BigNumber.from('70000000'), decimals: '6' }),
        getTokenForSymbol: jest.fn().mockReturnValue(tokenInfo)
      };

      const req: BalanceRequest = {
        chain: 'tezos',
        network: 'mainnet',
        address: 'testAddress',
        tokenSymbols: ['XTZ', 'CTEZ']
      };
      const res: any = await balances(tezos as any, req);
      expect(res.network).toBeDefined();
      expect(res.timestamp).toBeDefined();
      expect(res.latency).toBeDefined();
      expect(res.balances.XTZ).toEqual('5.000000');
      expect(res.balances.CTEZ).toEqual('70.000000');
    });
  });

  describe('poll', () => {
    const req: PollRequest = {
      chain: 'tezos',
      network: 'mainnet',
      txHash: 'txHash1',
    };

    it('should return the status and data of a given transaction', async () => {
      const tezosish = {
        chain: 'tezos',
        getCurrentBlockNumber: jest.fn().mockReturnValue(500),
        getPendingTransactions: jest.fn().mockReturnValue({
          applied: [
            {
              hash: 'txHash1',
              contents: {
                source: 'address1',
                destination: 'address2',
                amount: '1000000',
                fee: '10000',
                gas_limit: '1000',
                storage_limit: '1000',
              },
            },
          ],
          branch_delayed: [],
          branch_refused: [],
          refused: [],
          unprocessed: [],
        }),
      };

      const res = await poll(tezosish as any, req);
      expect(res.network).toEqual('tezos');
      expect(res.currentBlock).toEqual(500);
      expect(res.timestamp).toBeDefined();
      expect(res.txHash).toEqual('txHash1');
      expect(res.txStatus).toEqual(1);
      expect(res.txData).toEqual({
        source: 'address1',
        destination: 'address2',
        amount: '1000000',
        fee: '10000',
        gas_limit: '1000',
        storage_limit: '1000',
      });
    });

    it('should return status 2 when the transaction is branch delayed', async () => {
      const tezosish = {
        chain: 'tezos',
        getCurrentBlockNumber: jest.fn().mockReturnValue(500),
        getPendingTransactions: jest.fn().mockReturnValue({
          applied: [],
          branch_delayed: [
            {
              hash: 'txHash1'
            },
          ],
          branch_refused: [],
          refused: [],
          unprocessed: [],
        }),
      };

      const res = await poll(tezosish as any, req);
      expect(res.network).toEqual('tezos');
      expect(res.currentBlock).toEqual(500);
      expect(res.timestamp).toBeDefined();
      expect(res.txHash).toEqual('txHash1');
      expect(res.txStatus).toEqual(2);
      expect(res.txData).toBeNull();
    });

    it('should return status 3 when the transaction is branch refused', async () => {
      const tezosish = {
        chain: 'tezos',
        getCurrentBlockNumber: jest.fn().mockReturnValue(500),
        getPendingTransactions: jest.fn().mockReturnValue({
          applied: [],
          branch_delayed: [],
          branch_refused: [
            {
              hash: 'txHash1'
            },
          ],
          refused: [],
          unprocessed: [],
        }),
      };

      const res = await poll(tezosish as any, req);
      expect(res.network).toEqual('tezos');
      expect(res.currentBlock).toEqual(500);
      expect(res.timestamp).toBeDefined();
      expect(res.txHash).toEqual('txHash1');
      expect(res.txStatus).toEqual(3);
      expect(res.txData).toBeNull();
    });

    it('should return txStatus 4 for a refused transaction', async () => {
      const tezosish = {
        chain: 'tezos',
        getCurrentBlockNumber: jest.fn().mockReturnValue(500),
        getPendingTransactions: jest.fn().mockReturnValue({
          applied: [],
          branch_delayed: [],
          branch_refused: [],
          refused: [
            {
              hash: 'txHash1',
            },
          ],
          unprocessed: [],
        }),
      };

      const res = await poll(tezosish as any, req);
      expect(res.network).toEqual('tezos');
      expect(res.currentBlock).toEqual(500);
      expect(res.timestamp).toBeDefined();
      expect(res.txHash).toEqual('txHash1');
      expect(res.txStatus).toEqual(4);
      expect(res.txData).toBeNull();
    });

    it('should return the unprocessed status when transaction is unprocessed', async () => {
      const tezosish = {
        chain: 'tezos',
        getCurrentBlockNumber: jest.fn().mockReturnValue(500),
        getPendingTransactions: jest.fn().mockReturnValue({
          applied: [],
          branch_delayed: [],
          branch_refused: [],
          refused: [],
          unprocessed: [
            {
              hash: 'txHash1'
            },
          ],
        }),
      };

      const res = await poll(tezosish as any, req);
      expect(res.network).toEqual('tezos');
      expect(res.currentBlock).toEqual(500);
      expect(res.timestamp).toBeDefined();
      expect(res.txHash).toEqual('txHash1');
      expect(res.txStatus).toEqual(5);
      expect(res.txData).toBeNull();
    });
  });

  describe('allowances', () => {
    const tokenInfoCtez = {
      address: "tokenAddress",
      chainId: "tezos",
      decimals: "6",
      name: "token",
      symbol: "token",
      standard: "fa1.2",
      tokenId: "tokenId",
    };
    const tokenInfoUsds = {
      address: "tokenAddress",
      chainId: "tezos",
      decimals: "6",
      name: "token",
      symbol: "token",
      standard: "fa2",
      tokenId: "tokenId",
    };

    const tezosish = {
      getTokenForSymbol: jest.fn().mockReturnValueOnce(tokenInfoCtez).mockReturnValueOnce(tokenInfoUsds),
      getTokenAllowance: jest.fn().mockReturnValue({ value: BigNumber.from('10000000'), decimals: 6 }),
      chainName: 'tezos',
    };

    const req = {
      chain: 'tezos',
      network: 'mainnet',
      address: 'walletAddress',
      tokenSymbols: ['CTEZ', 'USDS'],
      spender: 'spenderAddress',
    };

    it('should return the expected response for both FA1.2 and FA2 token standards', async () => {
      const res = await allowances(tezosish as any, req);
      expect(tezosish.getTokenAllowance).toHaveBeenCalledTimes(1);
      expect(res).toEqual({
        network: 'tezos',
        timestamp: expect.any(Number),
        latency: expect.any(Number),
        spender: 'spenderAddress',
        approvals: {
          CTEZ: '0.000000',
          USDS: '10.000000',
        },
      });
    });
  });

  describe('approve', () => {
    const tezosish = {
      getWallet: jest.fn().mockResolvedValue({ contract: jest.fn() }),
      getTokenForSymbol: jest.fn().mockReturnValue({
        address: 'tokenAddress',
        chainId: 'tezos',
        decimals: '6',
        name: 'token',
        symbol: 'token',
        standard: 'fa1.2',
        tokenId: 1,
      }),
      chainName: 'tezos',
    };

    const req = {
      chain: 'tezos',
      network: 'mainnet',
      amount: '100',
      address: 'walletAddress',
      token: 'TOKEN',
      spender: 'spenderAddress',
    };

    it('should successfully approve FA1.2 tokens', async () => {
      const wallet = {
        contract: {
          at: async () => ({
            methods: {
              approve: () => ({
                send: async () => ({
                  operationResults: [
                    {
                      counter: 1,
                      source: 'walletAddress',
                      destination: 'tokenAddress',
                      gas_limit: '100000',
                      storage_limit: '10000',
                    },
                  ],
                  hash: 'txHash',
                }),
              }),
            },
          }),
        },
        rpc: {
          getChainId: () => 'NetXdQprcVkpaWU'
        }
      }

      tezosish.getWallet.mockResolvedValue(wallet);

      const res = await approve(tezosish as any, req);
      expect(tezosish.getWallet).toHaveBeenCalledTimes(1);
      expect(tezosish.getWallet).toHaveBeenCalledWith(req.address);
      expect(tezosish.getTokenForSymbol).toHaveBeenCalledTimes(1);
      expect(tezosish.getTokenForSymbol).toHaveBeenCalledWith(req.token);

      expect(res).toEqual({
        network: 'tezos',
        timestamp: expect.any(Number),
        latency: expect.any(Number),
        tokenAddress: 'tokenAddress',
        spender: 'spenderAddress',
        amount: '100.000000',
        nonce: 1,
        approval: {
          hash: 'txHash',
          to: 'tokenAddress',
          from: 'walletAddress',
          nonce: 1,
          gasLimit: String(
            parseInt('100000') + parseInt('10000')
          ),
          maxFeePerGas: null,
          chainId: 'NetXdQprcVkpaWU',
          maxPriorityFeePerGas: null,
        },
      });
    });
  });
});