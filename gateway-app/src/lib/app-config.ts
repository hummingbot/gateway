import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  theme: 'light' | 'dark';
}

export async function readAppConfig(): Promise<AppConfig> {
  const configStr = await invoke<string>('read_app_config');
  return JSON.parse(configStr);
}

export async function writeAppConfig(config: AppConfig): Promise<void> {
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
