import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  darkMode: boolean;
  theme?: {
    colors?: {
      primary?: string;          // Hex format: "#0f172a" (also accepts HSL)
      primaryDark?: string;       // For dark mode
      accent?: string;
      accentDark?: string;
    };
  };
}

// Check if we're running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export async function readAppConfig(): Promise<AppConfig> {
  if (!isTauri()) {
    // In dev mode (browser), prioritize localStorage (allows runtime edits to persist)
    // Developers can clear localStorage to reset to file defaults
    const stored = localStorage.getItem('app-config');

    if (stored) {
      // Use existing localStorage config (allows UI edits to persist)
      return JSON.parse(stored);
    }

    // No localStorage yet - fetch from file and initialize
    try {
      const response = await fetch('/app-config.json');
      if (response.ok) {
        const config = await response.json();
        localStorage.setItem('app-config', JSON.stringify(config));
        return config;
      }
    } catch (err) {
      console.warn('Failed to fetch app-config.json from server, using defaults:', err);
    }

    // Final fallback to defaults
    const defaultConfig = {
      darkMode: true,
      theme: {
        colors: {
          primary: '#0f172a',
          primaryDark: '#f8fafc',
          accent: '#f1f5f9',
          accentDark: '#1e293b',
        },
      },
    };
    localStorage.setItem('app-config', JSON.stringify(defaultConfig));
    return defaultConfig;
  }

  const configStr = await invoke<string>('read_app_config');
  return JSON.parse(configStr);
}

export async function writeAppConfig(config: AppConfig): Promise<void> {
  if (!isTauri()) {
    // Fallback to localStorage in browser mode
    localStorage.setItem('app-config', JSON.stringify(config, null, 2));
    return;
  }

  await invoke('write_app_config', { config: JSON.stringify(config, null, 2) });
}

export async function updateAppConfigValue(path: string, value: any): Promise<void> {
  const config = await readAppConfig();

  // Handle nested paths like "theme" or future "colors.primary"
  const keys = path.split('.');
  let current: any = config;

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }

  current[keys[keys.length - 1]] = value;

  await writeAppConfig(config);
}
