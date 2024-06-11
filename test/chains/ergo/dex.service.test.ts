import axios from 'axios';
import { DexService } from '../../../src/chains/ergo/dex.service';
// import { DEXTokensResponse } from '../../../src/chains/ergo/interfaces/dex.interface';

// Mocking axios to intercept HTTP requests and return controlled responses
jest.mock('axios');

// Describe the test suite for the NodeService class
describe('DexService', () => {
  // Define constants for baseURL and timeout
  const baseURL = 'https://example.com';
  const timeout = 5000;

  // Initialize DexService instance
  const dexService: DexService = new DexService(baseURL, timeout);

  // Test case to check if DexService is defined and its properties are set correctly
  it('Should initialize with given baseURL and timeout', () => {
    // Assert: Check if the dexURL and timeout properties are correctly set and instance is defined
    expect(dexService).toBeDefined();
    expect(dexService['dexURL']).toBe(baseURL);
    expect(dexService['timeout']).toBe(timeout);
  });

  // Describe the test suite for the private request method of NodeService
  describe('request', () => {
    // Define default parameters for the request method
    const method = 'GET';
    const url = '/test-endpoint';
    const headers = { 'Content-Type': 'application/json' };
    const body = { key: 'value' };

    // Test case for making a GET request with correct parameters
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

    // Test case for making a POST request with correct parameters
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
});
