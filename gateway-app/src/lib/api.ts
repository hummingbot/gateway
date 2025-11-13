// Gateway URL can be configured via environment variable
// Default to localhost:15888 for dev mode
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:15888';

// API Key for authentication (optional, only needed in production)
const API_KEY = import.meta.env.VITE_GATEWAY_API_KEY || '';

export async function gatewayFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${GATEWAY_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add API key if configured
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gateway API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function gatewayGet<T>(endpoint: string): Promise<T> {
  return gatewayFetch<T>(endpoint, { method: 'GET' });
}

export async function gatewayPost<T>(
  endpoint: string,
  body?: unknown
): Promise<T> {
  return gatewayFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function gatewayDelete<T>(endpoint: string): Promise<T> {
  return gatewayFetch<T>(endpoint, { method: 'DELETE' });
}
