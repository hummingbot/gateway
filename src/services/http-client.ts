import { logger } from './logger';

/**
 * HTTP client options for creating a client instance
 */
export interface HttpClientOptions {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
  enableLogging?: boolean;
}

/**
 * Request options for individual requests
 */
export interface RequestOptions {
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

/**
 * HTTP error with response details
 */
export class HttpClientError extends Error {
  public status?: number;
  public statusText?: string;
  public data?: any;
  public code?: string;

  constructor(
    message: string,
    options?: {
      status?: number;
      statusText?: string;
      data?: any;
      code?: string;
    },
  ) {
    super(message);
    this.name = 'HttpClientError';
    this.status = options?.status;
    this.statusText = options?.statusText;
    this.data = options?.data;
    this.code = options?.code;
  }

  /**
   * Get the response object in axios-compatible format
   */
  get response() {
    if (this.status !== undefined) {
      return {
        status: this.status,
        statusText: this.statusText,
        data: this.data,
      };
    }
    return undefined;
  }
}

/**
 * Lightweight HTTP client using native fetch
 * Drop-in replacement for axios with similar API
 */
export class HttpClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private enableLogging: boolean;

  constructor(options: HttpClientOptions) {
    this.baseURL = options.baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options.timeout ?? 30000;
    this.defaultHeaders = options.headers ?? {};
    this.enableLogging = options.enableLogging ?? false;
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(path.startsWith('http') ? path : `${this.baseURL}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }

  /**
   * Execute a fetch request with timeout
   */
  private async request<T>(
    method: string,
    path: string,
    options?: RequestOptions & { body?: any },
  ): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path, options?.params);
    const timeout = options?.timeout ?? this.timeout;

    const headers = {
      ...this.defaultHeaders,
      ...options?.headers,
    };

    if (this.enableLogging) {
      logger.debug(`HTTP ${method} ${url}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (options?.body !== undefined) {
        fetchOptions.body = JSON.stringify(options.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }

      const response = await fetch(url, fetchOptions);

      if (this.enableLogging) {
        logger.debug(`HTTP Response: ${response.status}`);
      }

      // Parse response body
      const contentType = response.headers.get('content-type');
      let data: any;
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        // Try to parse as JSON anyway (some APIs don't set content-type correctly)
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      // Throw error for non-2xx status codes (matching axios behavior)
      if (!response.ok) {
        throw new HttpClientError(`Request failed with status ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          data,
        });
      }

      return {
        data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: any) {
      if (error instanceof HttpClientError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        const timeoutError = new HttpClientError(`Request timeout after ${timeout}ms`);
        timeoutError.code = 'ECONNABORTED';
        throw timeoutError;
      }

      // Network errors
      const networkError = new HttpClientError(error.message);
      networkError.code = 'ENETWORK';
      throw networkError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  /**
   * POST request
   */
  async post<T>(path: string, data?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, { ...options, body: data });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, data?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body: data });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }
}

/**
 * Create a new HTTP client instance
 * Equivalent to axios.create()
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  return new HttpClient(options);
}

/**
 * Simple one-off GET request (equivalent to axios.get)
 */
export async function httpGet<T>(
  url: string,
  options?: RequestOptions & { timeout?: number },
): Promise<HttpResponse<T>> {
  const client = new HttpClient({
    baseURL: '',
    timeout: options?.timeout,
    headers: options?.headers,
  });
  return client.get<T>(url, options);
}

/**
 * Simple one-off POST request (equivalent to axios.post)
 */
export async function httpPost<T>(
  url: string,
  data?: any,
  options?: RequestOptions & { timeout?: number },
): Promise<HttpResponse<T>> {
  const client = new HttpClient({
    baseURL: '',
    timeout: options?.timeout,
    headers: options?.headers,
  });
  return client.post<T>(url, data, options);
}
