import axios from 'axios';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { NodeInfoResponse } from '../../../src/chains/ergo/interfaces/node.interface';
import {
  BlockHeaders,
  ErgoStateContext,
  Parameters,
  PreHeader,
} from 'ergo-lib-wasm-nodejs';

jest.mock('axios');
jest.mock('ergo-lib-wasm-nodejs', () => ({
  BlockHeaders: {
    from_json: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue({ headerData: 'mockData' }),
      len: jest.fn().mockReturnValue(2),
    }),
  },
  PreHeader: {
    from_block_header: jest.fn().mockReturnValue({ preHeaderData: 'mockData' }),
  },
  ErgoStateContext: jest
    .fn()
    .mockReturnValue({} as unknown as ErgoStateContext),
  Parameters: {
    default_parameters: jest.fn().mockReturnValue({} ),
  }
}));

describe('NodeService', () => {
  const baseURL = 'https://example.com';
  const timeout = 5000;

  const nodeService: NodeService = new NodeService(baseURL, timeout);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Should be defined and and set nodeURL & timeout correctly', () => {
    // Assert: Check if the nodeURL and timeout properties are correctly set and instance is defined
    expect(nodeService).toBeDefined();
    expect(nodeService['nodeURL']).toEqual('https://example.com');
    expect(nodeService['timeout']).toEqual(5000);
  });

  describe('request', () => {
    const method = 'GET';
    const url = '/test-endpoint';
    const headers = { 'Content-Type': 'application/json' };
    const data = { key: 'value' };

    it('Should make a GET request with correct parameters', async () => {
      // Arrange: Mock the axios response
      const mockResponse = { data: { name: 'test' } };
      (axios as any).mockResolvedValue(mockResponse);

      // Act: Call the private request method with GET parameters
      const response = await nodeService['request'](method, url, headers);

      // Assert: Check if axios was called with the correct configuration
      expect(axios).toHaveBeenCalledWith({
        baseURL,
        url,
        method,
        headers,
        timeout,
      });
      // Assert: Check if the response is as expected
      expect(response).toEqual({ name: 'test' });
    });

    it('Should make a POST request with correct parameters', async () => {
      // Arrange: Change method to POST and mock the axios response
      const method = 'POST';
      const mockResponse = { data: { name: 'test' } };
      (axios as any).mockResolvedValue(mockResponse);

      // Act: Call the private request method with POST parameters
      const response = await nodeService['request'](method, url, headers, data);

      // Assert: Check if axios was called with the correct configuration
      expect(axios).toHaveBeenCalledWith({
        baseURL,
        url,
        method,
        headers,
        timeout,
        data,
      });
      // Assert: Check if the response is as expected
      expect(response).toEqual({ name: 'test' });
    });
  });

  describe('getNetworkHeight', () => {
    it('Should call getNetworkHeight with correct parameters and returns the correct value', async () => {
      const res: NodeInfoResponse = { fullHeight: 100 };
      jest.spyOn(nodeService as any, 'request').mockResolvedValue(res);

      // Call the getNetworkHeight method and store the result
      const networkHeight = await nodeService.getNetworkHeight();

      // Assert
      expect(networkHeight).toEqual(100);
      expect(nodeService['request']).toHaveBeenCalledTimes(1);
      expect(nodeService['request']).toHaveBeenCalledWith('GET', '/info');
    });
  });

  describe('getUnspentBoxesByAddress', () => {
    const address = 'box-number-1.com';
    const offset = 10;
    const limit = 20;

    it('Should call getUnspentBoxesByAddress method with correct parameters and returns the correct value', async () => {
      jest.spyOn(nodeService as any, 'request').mockResolvedValue({ data: {} });
      const unspentBoxesByAddress = await nodeService.getUnspentBoxesByAddress(
        address,
        offset,
        limit,
      );

      // Assert
      expect(unspentBoxesByAddress).toEqual({ data: {} });
      expect(nodeService['request']).toHaveBeenCalledTimes(1);
      expect(nodeService['request']).toHaveBeenCalledWith(
        'POST',
        `/blockchain/box/unspent/byAddress?offset=10&limit=20&sortDirection=desc`,
        { 'Content-Type': 'text/plain' },
        'box-number-1.com',
      );
    });
  });

  describe('chainSliceInfo', () => {
    it('Should be defined', () => {
      expect(nodeService.chainSliceInfo).toBeDefined();
    });
    it('Should call request method with correct parameters', async () => {
      jest.spyOn(nodeService as any, 'request').mockResolvedValue({ data: {} });
      await nodeService.chainSliceInfo(20);
      expect(nodeService['request']).toHaveBeenCalledWith(
        'GET',
        `/blocks/chainSlice?fromHeight=10&toHeight=20`,
      );
    });
  });

  describe('getCtx', () => {
    it('Should be defined', () => {
      expect(nodeService.getCtx).toBeDefined();
    });
    it('Should return Ergo state context correctly', async () => {
      jest.spyOn(nodeService, 'getNetworkHeight').mockResolvedValue(100);
      jest.spyOn(nodeService, 'chainSliceInfo').mockResolvedValue({} as any);
      const result = await nodeService.getCtx();
      expect(result).toEqual({});
      expect(nodeService.chainSliceInfo).toHaveBeenCalledWith(100);
      expect(nodeService.getNetworkHeight).toHaveBeenCalled();
      expect(BlockHeaders.from_json).toHaveBeenCalledWith({});
      expect(PreHeader.from_block_header).toHaveBeenCalledWith({
        headerData: 'mockData',
      });
    });
  });

  describe('postTransaction', () => {
    it('Should be defined', () => {
      expect(nodeService.postTransaction).toBeDefined();
    });
    it('Should return an empty string if request method fails', async () => {
      jest
        .spyOn(nodeService as any, 'request')
        .mockRejectedValue('Bad request');
      expect(await nodeService.postTransaction('tx')).toEqual('');
    });

    it('Should call request method with the correct parameters', async () => {
      jest.spyOn(nodeService as any, 'request').mockResolvedValue({ data: {} });
      await nodeService.postTransaction('tx');
      expect(nodeService['request']).toHaveBeenCalledWith(
        'POST',
        `/transactions`,
        { 'Content-Type': 'application/json' },
        'tx',
      );
    });
  });

  describe('getTxsById', () => {
    it('Should be defined', () => {
      expect(nodeService.getTxsById).toBeDefined();
    });

    it('Should return undefined if request method fails', async () => {
      jest
        .spyOn(nodeService as any, 'request')
        .mockRejectedValue('Bad request');
      expect(await nodeService.getTxsById('blockHeight')).toEqual(undefined);
    });

    it('Should call request method with the correct parameters', async () => {
      const id = 'id';
      await nodeService.getTxsById(id);
      expect(nodeService['request']).toHaveBeenCalledWith(
        'GET',
        `/blockchain/transaction/byId/id`,
      );
    });
  });

  describe('getBlockInfo', () => {
    it('Should be defined', () => {
      expect(nodeService.getBlockInfo).toBeDefined();
    });

    it('Should call request method with the correct parameters', async () => {
      jest.spyOn(nodeService as any, 'request').mockResolvedValueOnce([17, 18]);
      jest
        .spyOn(nodeService as any, 'request')
        .mockResolvedValueOnce({ data: 'mockData' });

      const result = await nodeService.getBlockInfo('blockHeight');

      expect(result).toEqual({ data: 'mockData' });
      expect(nodeService['request']).toHaveBeenCalledWith(
        'GET',
        `/blocks/at/blockHeight`,
      );
      expect(nodeService['request']).toHaveBeenCalledWith('GET', `/blocks/17`);
    });
  });
});
