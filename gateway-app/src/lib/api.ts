// Gateway URL can be configured via environment variable
// Default to https://localhost:15888 for production mode with self-signed certs
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'https://localhost:15888';

// API Key for authentication (optional, only needed in production)
const API_KEY = import.meta.env.VITE_GATEWAY_API_KEY || '';

// Check if running in Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Dynamically import Tauri's fetch if available
let tauriFetch: any = null;
if (isTauri) {
  import('@tauri-apps/plugin-http').then((module) => {
    tauriFetch = module.fetch;
  });
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

  // Use Tauri's fetch with SSL verification disabled for self-signed certs
  const fetchFn = isTauri && tauriFetch ? tauriFetch : fetch;
  const fetchOptions: any = {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  };

  // Disable SSL verification for Tauri (to accept self-signed certs)
  if (isTauri && tauriFetch) {
    fetchOptions.danger = {
      acceptInvalidCerts: true,
      acceptInvalidHostnames: true,
    };
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
