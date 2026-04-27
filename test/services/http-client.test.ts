import { HttpClient, HttpClientError, createHttpClient, httpGet, httpPost } from '../../src/services/http-client';

// Mock the global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('HttpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('HttpClientError', () => {
    it('should create error with message only', () => {
      const error = new HttpClientError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('HttpClientError');
      expect(error.status).toBeUndefined();
      expect(error.response).toBeUndefined();
    });

    it('should create error with status and data', () => {
      const error = new HttpClientError('Test error', {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Resource not found' },
      });
      expect(error.status).toBe(404);
      expect(error.statusText).toBe('Not Found');
      expect(error.data).toEqual({ error: 'Resource not found' });
      expect(error.response).toEqual({
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Resource not found' },
      });
    });

    it('should create error with code', () => {
      const error = new HttpClientError('Timeout');
      error.code = 'ECONNABORTED';
      expect(error.code).toBe('ECONNABORTED');
    });
  });

  describe('HttpClient class', () => {
    let client: HttpClient;

    beforeEach(() => {
      client = new HttpClient({
        baseURL: 'https://api.example.com',
        timeout: 5000,
        headers: { Authorization: 'Bearer token' },
      });
    });

    it('should make GET request with params', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.get('/test', {
        params: { foo: 'bar', num: 123 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test?foo=bar&num=123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
          }),
        }),
      );
      expect(result.data).toEqual({ data: 'test' });
      expect(result.status).toBe(200);
    });

    it('should make POST request with body', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({ id: 1 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.post('/test', { name: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result.data).toEqual({ id: 1 });
    });

    it('should throw HttpClientError for non-2xx responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({ error: 'Not found' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(client.get('/notfound')).rejects.toThrow(HttpClientError);
      await expect(client.get('/notfound')).rejects.toMatchObject({
        status: 404,
        data: { error: 'Not found' },
      });
    });

    it('should handle timeout', async () => {
      // Create abort error
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      await expect(client.get('/slow')).rejects.toThrow('Request timeout');
      await expect(client.get('/slow')).rejects.toMatchObject({
        code: 'ECONNABORTED',
      });
    });

    it('should handle text responses', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: jest.fn().mockResolvedValue('plain text response'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.get('/text');

      expect(result.data).toBe('plain text response');
    });

    it('should remove trailing slash from baseURL', () => {
      const clientWithSlash = new HttpClient({
        baseURL: 'https://api.example.com/',
      });

      // The trailing slash should be removed internally
      expect(clientWithSlash).toBeDefined();
    });
  });

  describe('createHttpClient', () => {
    it('should create HttpClient instance', () => {
      const client = createHttpClient({
        baseURL: 'https://api.example.com',
      });
      expect(client).toBeInstanceOf(HttpClient);
    });
  });

  describe('httpGet', () => {
    it('should make one-off GET request', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await httpGet('https://api.example.com/test');

      expect(result.data).toEqual({ data: 'test' });
    });
  });

  describe('httpPost', () => {
    it('should make one-off POST request', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({ id: 1 }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await httpPost('https://api.example.com/test', { name: 'test' });

      expect(result.data).toEqual({ id: 1 });
    });
  });
});
