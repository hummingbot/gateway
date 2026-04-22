/**
 * Minimal fetch utilities - drop-in replacement for axios
 * Maintains error.response.status/data pattern for compatibility
 */

interface FetchOptions {
  params?: Record<string, string | number | boolean> | URLSearchParams;
  headers?: Record<string, string>;
  timeout?: number;
}

interface FetchResponse<T> {
  data: T;
  status: number;
}

class FetchError extends Error {
  response?: { status: number; data: any };
  code?: string;
}

async function request<T>(
  method: string,
  url: string,
  options?: FetchOptions & { body?: any },
): Promise<FetchResponse<T>> {
  const { params, headers, timeout = 30000, body } = options ?? {};

  // Build URL with query params
  let fullUrl = url;
  if (params) {
    const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams();
    if (!(params instanceof URLSearchParams)) {
      for (const [key, value] of Object.entries(params)) {
        searchParams.append(key, String(value));
      }
    }
    fullUrl = `${url}?${searchParams}`;
  }

  const response = await fetch(fullUrl, {
    method,
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });

  let data: any;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = new FetchError(`HTTP ${response.status}`);
    error.response = { status: response.status, data };
    throw error;
  }

  return { data, status: response.status };
}

/** HTTP client with baseURL - similar to axios.create() */
export function createHttpClient(config: { baseURL: string; timeout?: number; headers?: Record<string, string> }) {
  const { baseURL, timeout = 30000, headers: defaultHeaders = {} } = config;
  const base = baseURL.replace(/\/$/, '');

  return {
    get: <T>(path: string, options?: FetchOptions) =>
      request<T>('GET', `${base}${path}`, { ...options, timeout, headers: { ...defaultHeaders, ...options?.headers } }),
    post: <T>(path: string, body?: any, options?: FetchOptions) =>
      request<T>('POST', `${base}${path}`, {
        ...options,
        body,
        timeout,
        headers: { ...defaultHeaders, ...options?.headers },
      }),
  };
}

/** One-off GET request */
export async function httpGet<T>(url: string, options?: FetchOptions): Promise<FetchResponse<T>> {
  return request<T>('GET', url, options);
}
