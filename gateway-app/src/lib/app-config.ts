import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  darkMode: boolean;
  theme?: {
    colors?: {
      primary?: string;          // HSL format: "222.2 47.4% 11.2%"
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
    // Fallback to localStorage in browser mode
    const stored = localStorage.getItem('app-config');
    if (stored) {
      return JSON.parse(stored);
    }
    return { darkMode: true };
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
