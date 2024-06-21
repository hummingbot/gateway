import axios from 'axios';
import { NodeService } from '../../../src/chains/ergo/node.service';
import { NodeInfoResponse } from '../../../src/chains/ergo/interfaces/node.interface';

jest.mock('axios');

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
    const body = { key: 'value' };

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
      const response = await nodeService['request'](method, url, headers, body);

      // Assert: Check if axios was called with the correct configuration
      expect(axios).toHaveBeenCalledWith({
        baseURL,
        url,
        method,
        headers,
        timeout,
        body,
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
});
