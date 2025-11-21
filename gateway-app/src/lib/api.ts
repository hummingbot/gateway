// Gateway URL and API key are baked in at build time from .env file
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'https://localhost:15888';
const API_KEY = import.meta.env.VITE_GATEWAY_API_KEY || '';

// Check if running in Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Dynamically import Tauri's fetch if available
let tauriFetchPromise: Promise<any> | null = null;
if (isTauri) {
  tauriFetchPromise = import('@tauri-apps/plugin-http').then((module) => module.fetch);
}

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

  // Wait for Tauri fetch to be loaded if running in Tauri
  let fetchFn = fetch;
  const fetchOptions: any = {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  };

  if (isTauri && tauriFetchPromise) {
    try {
      const tauriFetch = await tauriFetchPromise;
      fetchFn = tauriFetch;
      // Disable SSL verification for Tauri (to accept self-signed certs)
      fetchOptions.danger = {
        acceptInvalidCerts: true,
        acceptInvalidHostnames: true,
      };
    } catch {
      // Fall back to standard fetch if plugin fails to load
    }
  }

  const response = await fetchFn(url, fetchOptions);

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
