import { OutputBuilder, TransactionBuilder } from '@fleet-sdk/core';
import { Ergo } from '../../../src/chains/ergo/ergo';
import { ErgoController } from '../../../src/chains/ergo/ergo.controllers';
import { ErgoTxFull } from '../../../src/chains/ergo/interfaces/ergo.interface';
import { BigNumber } from 'bignumber.js';
import { TransferRequest } from '../../../src/chains/ergo/interfaces/requests.interface';
import {
  BalanceRequest,
} from '../../../src/chains/chain.requests';

ErgoController;
describe('ErgoController', () => {
  const ergo: Ergo = new Ergo('mainnet');
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Should be defined', () => {
    expect(ErgoController).toBeDefined();
  });

  describe('pool', () => {
    it('Should be defined', () => {
      expect(ErgoController.pool).toBeDefined();
    });

    it('Should not call init from ergo if ergo is ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      jest.spyOn(ergo, 'getPool').mockReturnValue({ info: 'info' } as any);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      const result = await ErgoController.pool(ergo, {
        network: 'mainnet',
        poolId: 'poolId',
      });
      expect(ergo.getPool).toHaveBeenCalled();
      expect(result).toEqual('info');
      expect(ergo.init).not.toHaveBeenCalled();
    });

    it('Should call init from ergo if ergo is not ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      jest.spyOn(ergo, 'getPool').mockReturnValue({ info: 'info' } as any);
      const result = await ErgoController.pool(ergo, {
        network: 'mainnet',
        poolId: 'poolId',
      });

      expect(ergo.getPool).toHaveBeenCalled();
      expect(ergo.init).toHaveBeenCalled();
      expect(result).toEqual('info');
    });
  });

  describe('poll', () => {
    it('Should be defined', () => {
      expect(ErgoController.poll).toBeDefined();
    });
    it('Should not call init from ergo if ergo is ready and return the correct answer basen on tx status', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      jest.spyOn(ergo, 'getTx').mockResolvedValue(undefined);
      const result = await ErgoController.poll(ergo, {
        txHash: 'txHash',
      } as any);

      expect(ergo.init).not.toHaveBeenCalled();
      expect(ergo.getTx).toHaveBeenCalledWith('txHash');
      expect(result).toEqual({
        id: '',
        inputs: [],
        dataInputs: [],
        ergo_tx_full: null,
        outputs: [],
        size: 0,
        network: '',
        timestamp: 0,
        currentBlock: 0,
        txHash: '',
        txStatus: -1,
        txBlock: 0,
        txData: null,
        txReceipt: null,
        tokenId: 0,
        fee: 0,
      });
    });

    it('Should call init from ergo if ergo is not ready and return the correct answer basen on tx status', async () => {
      const tx: ErgoTxFull = {
        id: 'txId',
        inputs: [],
        dataInputs: [],
        outputs: [],
        size: 100,
        inclusionHeight: '100',
      };
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      jest.spyOn(ergo, 'getTx').mockResolvedValue(tx);
      const result = await ErgoController.poll(ergo, {
        txHash: 'txHash',
      } as any);
      expect(result).toEqual({
        id: 'txId',
        inputs: [],
        dataInputs: [],
        outputs: [],
        size: 100,
        inclusionHeight: '100',
        currentBlock: Number('100'),
        txBlock: Number('100'),
        txHash: 'txId',
        network: '',
        timestamp: 0,
        txStatus: 1,
        txData: null,
        txReceipt: null,
        fee: 0,
        ergo_tx_full:  {
        dataInputs: [],
        fee: 0,
        id: "txId",
        inclusionHeight: "100",
        inputs: [],
        outputs: [],
        size: 100,
       },
      });
      expect(ergo.getTx).toHaveBeenCalledWith('txHash');
      expect(ergo.init).toHaveBeenCalled();
    });
  });

  describe('balances', () => {
    const request: BalanceRequest = {
      address: 'address',
      network: 'mainnet',
      tokenSymbols: ['ERG'],
      connector: 'splash',
    };
    beforeEach(() => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      jest.spyOn(ergo, 'getAddressUnspentBoxes').mockResolvedValue([]);
      jest.spyOn(ergo, 'getBalance').mockReturnValue({
        balance: BigNumber(0),
        assets: {},
      });
    });
    it('Should be defined', () => {
      expect(ErgoController.balances).toBeDefined();
    });
    it('Should call init from ergo if ergo is not ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      await ErgoController.balances(ergo, request);
      expect(ergo.init).toHaveBeenCalled();
      expect(ergo.ready).toHaveBeenCalled();
    });
    it('Should not call init from ergo if ergo is ready', async () => {
      await ErgoController.balances(ergo, request);
      expect(ergo.init).not.toHaveBeenCalled();
      expect(ergo.ready).toHaveBeenCalled();
    });


    it('Should iterate on assets returned from getBalance and return the correct data', async () => {
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        { tokenId: 'token1', decimals: 9, name: 'name', symbol: 'TKN1' },
        { tokenId: 'token2', decimals: 3, name: 'name', symbol: 'TKN2' },
      ]);

      jest.spyOn(ergo, 'getBalance').mockReturnValue({
        balance: BigNumber(30000000000),
        assets: {
          token1: BigNumber(10000000000),
          token2: BigNumber(20000000000),
        },
      });
      const result = await ErgoController.balances(ergo, request);
      expect(result).toMatchObject({
        network: 'mainnet',
        // timestamp ignored because there was a really small difference between create Date.new() in test file and main file
        // timestamp: Date.now(),
        latency: 0,
        balances: { ERG: '30', TKN1: '10', TKN2: '20000000' },
      });
    });
  });

  describe('getTokens', () => {
    const mockStoredAssetList = [
      { tokenId: 'token1', decimals: 9, name: 'name', symbol: 'TKN1' },
      { tokenId: 'token2', decimals: 3, name: 'name', symbol: 'TKN2' },
    ];
    beforeEach(() => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      jest
        .spyOn(ergo, 'storedAssetList', 'get')
        .mockReturnValue(mockStoredAssetList);
    });
    it('Should be defined', () => {
      expect(ErgoController.getTokens).toBeDefined();
    });
    it('Should not call init from ergo if ergo is ready', async () => {
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      await ErgoController.getTokens(ergo, {} as any);
      expect(ergo.init).not.toHaveBeenCalled();
    });

    it('Should call init from ergo if ergo is not ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      await ErgoController.getTokens(ergo, {} as any);

      expect(ergo.init).toHaveBeenCalled();
      expect(ergo.ready).toHaveBeenCalled();
    });

    it('Should return correct data', async () => {
      const result = await ErgoController.getTokens(ergo, {} as any);
      expect(result).toEqual({ tokens: mockStoredAssetList });
    });
  });

  describe('transfer', () => {
    const request: TransferRequest = {
      fromAddress: '9huCzcjG9bmpKccftEauEYD6YP6qVpnJQXAtwuSpXy3WcMpYgFX',
      toAddress: '9hA3BgMVWfLHTqAFbBCtHdPW7QRQDsMSQp8aaYiB6PiqVLLLAF1',
      assets: [
        { tokenId: 'token1', amount: BigNumber(100) },
        { tokenId: 'token2', amount: BigNumber(200) },
      ],
      toValue: '100000000',
    };
    const mockFrom = new TransactionBuilder(1);
    const mockTo = new TransactionBuilder(2);
    const mockSendChangeTo = new TransactionBuilder(3);
    const mockPayMinFee = new TransactionBuilder(4);

    const utxos = [
      {
        value: 1000000000,
        assets: [
          { tokenId: 'token1', amount: 100 },
          { tokenId: 'token2', amount: 200 },
        ],
      },
      {
        value: 2000000000,
        assets: [{ tokenId: 'token3', amount: 300 }],
      },
    ];
    it('Should be defined', () => {
      expect(ErgoController.transfer).toBeDefined();
    });

    it('Should return correct data', async () => {
      jest.spyOn(ergo, 'getNetworkHeight').mockResolvedValue(100);
      jest
        .spyOn(ergo, 'getAddressUnspentBoxes')
        .mockResolvedValue(utxos as any);
      jest
        .spyOn(TransactionBuilder.prototype, 'from')
        .mockReturnValue(mockFrom);
      jest.spyOn(TransactionBuilder.prototype, 'to').mockReturnValue(mockTo);
      jest
        .spyOn(TransactionBuilder.prototype, 'sendChangeTo')
        .mockReturnValue(mockSendChangeTo);
      jest
        .spyOn(TransactionBuilder.prototype, 'build')
        .mockReturnValue({} as any);
      jest
        .spyOn(TransactionBuilder.prototype, 'payMinFee')
        .mockReturnValue(mockPayMinFee);
      jest
        .spyOn(OutputBuilder.prototype, 'addTokens')
        .mockReturnValue({} as any);
      const result = await ErgoController.transfer(ergo, request);

      expect(ergo.getAddressUnspentBoxes).toHaveBeenCalledWith(
        '9huCzcjG9bmpKccftEauEYD6YP6qVpnJQXAtwuSpXy3WcMpYgFX',
      );
      expect(ergo.getNetworkHeight).toHaveBeenCalled();
      expect(TransactionBuilder.prototype.from).toHaveBeenCalledWith([
        {
          value: '1000000000',
          assets: [
            { tokenId: 'token1', amount: '100' },
            { tokenId: 'token2', amount: '200' },
          ],
        },
        {
          value: '2000000000',
          assets: [{ tokenId: 'token3', amount: '300' }],
        },
      ]);
      expect(OutputBuilder.prototype.addTokens).toHaveBeenCalledWith([
        { tokenId: 'token1', amount: '100' },
        { tokenId: 'token2', amount: '200' },
      ]);
      expect(TransactionBuilder.prototype.sendChangeTo).toHaveBeenCalledWith(
        '9huCzcjG9bmpKccftEauEYD6YP6qVpnJQXAtwuSpXy3WcMpYgFX',
      );
      expect(TransactionBuilder.prototype.payMinFee).toHaveBeenCalled();
      expect(TransactionBuilder.prototype.build).toHaveBeenCalled();
      expect(result).toEqual({});
    });
  });

  describe('getStatus', () => {
    it('Should be defined', () => {
      expect(ErgoController.getStatus).toBeDefined();
    });
    it('Should return controller status', async () => {
      jest
        .spyOn(ergo, 'getExplorerUrl')
        .mockReturnValue('https://example.com/explorer');
      jest.spyOn(ergo, 'getNetworkHeight').mockResolvedValue(1);
      expect(
        await ErgoController.getStatus(ergo, {
          network: 'mainnet',
          url: 'https://example.com/explorer',
        }),
      ).toEqual({
        chain: 'ergo',
        network: 'mainnet',
        rpcUrl: 'https://example.com/explorer',
        nativeCurrency: 'ERG',
        currentBlockNumber: 1,
      });
    });
  });

  describe('allowances', () => {
    const request = {
      chain: 'ergo',
      network: 'mainnet',
      address: 'usersPublicEthereumKey',
      spender: 'spenderAddress',
      tokenSymbols: [],
    };
    beforeEach(() => {
      jest.spyOn(ergo, 'ready').mockReturnValue(true);
      jest.spyOn(ergo, 'init').mockResolvedValue({} as any);
      jest.spyOn(ergo, 'getAddressUnspentBoxes').mockResolvedValue([]);
      jest.spyOn(ergo, 'getBalance').mockReturnValue({
        balance: BigNumber(0),
        assets: {},
      });
    });
    it('Should be defined', () => {
      expect(ErgoController.allowances).toBeDefined();
    });
    it('Should call init from ergo if ergo is not ready', async () => {
      jest.spyOn(ergo, 'ready').mockReturnValue(false);
      await ErgoController.allowances(ergo, request);
      expect(ergo.init).toHaveBeenCalled();
      expect(ergo.ready).toHaveBeenCalled();
    });
    it('Should not call init from ergo if ergo is ready', async () => {
      await ErgoController.allowances(ergo, request);
      expect(ergo.init).not.toHaveBeenCalled();
      expect(ergo.ready).toHaveBeenCalled();
    });

    it('Should call getAddressUnspentBoxes & getBalance from ergo and return the correct data', async () => {
      const result = await ErgoController.allowances(ergo, request);
      expect(ergo.getAddressUnspentBoxes).toHaveBeenCalledWith(
        'usersPublicEthereumKey',
      );
      expect(ergo.getBalance).toHaveBeenCalledWith([]);
      expect(result).toMatchObject({
        network: 'mainnet',
        // timestamp ignored because there was a really small difference between create Date.new() in test file and main file
        // timestamp: Date.now(),
        latency: 0,
        spender: 'spenderAddress',
        approvals: { ERG: '0' },
      });
    });

    it('Should iterate on assets returned from getBalance and return the correct data', async () => {
      jest.spyOn(ergo, 'storedAssetList', 'get').mockReturnValue([
        { tokenId: 'token1', decimals: 9, name: 'name', symbol: 'TKN1' },
        { tokenId: 'token2', decimals: 3, name: 'name', symbol: 'TKN2' },
      ]);

      jest.spyOn(ergo, 'getBalance').mockReturnValue({
        balance: BigNumber(30000000000),
        assets: {
          token1: BigNumber(10000000000),
          token2: BigNumber(20000000000),
        },
      });
      const result = await ErgoController.allowances(ergo, request);
      expect(result).toMatchObject({
        network: 'mainnet',
        // timestamp ignored because there was a really small difference between create Date.new() in test file and main file
        // timestamp: Date.now(),
        latency: 0,
        spender: 'spenderAddress',
        approvals: { ERG: '30', TKN1: '10', TKN2: '20000000' },
      });
    });
  });

  describe('nonce', () => {
    it('Should be defined', () => {
      expect(ErgoController.nonce).toBeDefined();
    });
    it('Should return nocne correctly', async () => {
      jest.spyOn(ergo, 'getCurrentEpoch').mockResolvedValue({
        height: 17,
        storageFeeFactor: BigInt(1),
        minValuePerByte: BigInt(1),
        maxBlockSize: 1,
        maxBlockCost: BigInt(1),
        blockVersion: 1,
        tokenAccessCost: BigInt(1),
        inputCost: BigInt(1),
        dataInputCost: BigInt(1),
        outputCost: BigInt(1),
      });
      expect(
        await ErgoController.nonce(ergo, {
          network: 'mainnet',
          chain: 'ergo',
          address: 'addres',
        }),
      ).toEqual({nonce: 17});
    });
  });
});
