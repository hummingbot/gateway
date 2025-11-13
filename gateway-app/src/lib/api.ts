const GATEWAY_URL = 'http://localhost:15888';

export async function gatewayFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${GATEWAY_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
