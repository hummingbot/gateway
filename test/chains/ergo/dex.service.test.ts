import axios from 'axios';
import { DexService } from '../../../src/chains/ergo/dex.service';
import { DEXTokensResponse } from '../../../src/chains/ergo/interfaces/dex.interface';

jest.mock('axios');

describe('DexService', () => {
  const baseURL = 'https://example.com';
  const timeout = 5000;

  const dexService: DexService = new DexService(baseURL, timeout);

  it('Should initialize with given baseURL and timeout', () => {
    // Assert: Check if the dexURL and timeout properties are correctly set and instance is defined
    expect(dexService).toBeDefined();
    expect(dexService['dexURL']).toBe(baseURL);
    expect(dexService['timeout']).toBe(timeout);
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
      const response = await dexService['request'](method, url, headers);

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
      const response = await dexService['request'](method, url, headers, body);

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

  describe('getTokens', () => {
    it('Should call request method with correct parameters', async () => {
      // Arrange: Mock the response of the request method
      const mockResponse: DEXTokensResponse = {
        tokens: [
          {
            address: '1',
            name: 'Token1',
            decimals: 0,
            ticker: '',
            logoURI: '',
            project: '',
            description: '',
          },
        ],
      };
      jest.spyOn(dexService as any, 'request').mockResolvedValue(mockResponse);

      // Act: Call the getTokens method
      const response = await dexService.getTokens();

      // Assert: Check if the request method was called with the correct parameters
      expect(dexService['request']).toHaveBeenCalledWith(
        'GET',
        '/ergo-token-list.json',
      );
      // Assert: Check if the response from getTokens is as expected
      expect(response).toEqual(mockResponse);
    });
  });
});
