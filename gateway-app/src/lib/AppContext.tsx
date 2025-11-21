import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { readAppConfig, updateAppConfigValue, AppConfig } from './app-config';
import { applyTheme, updateThemeForDarkMode } from './theme-manager';
import { gatewayGet } from './api';

interface GatewayConfig {
  server: any;
  ethereum: {
    defaultNetwork: string;
    defaultWallet: string;
    rpcProvider: string;
  };
  solana: {
    defaultNetwork: string;
    defaultWallet: string;
    rpcProvider: string;
  };
  [key: string]: any; // Network configs like "ethereum-base", "solana-mainnet-beta"
}

interface AppState {
  selectedNetwork: string;
  setSelectedNetwork: (network: string) => void;
  selectedWallet: string;
  setSelectedWallet: (wallet: string) => void;
  selectedChain: string;
  setSelectedChain: (chain: string) => void;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
  toggleTheme: () => void;
  gatewayAvailable: boolean | null; // null = checking, true = available, false = unavailable
  gatewayConfig: GatewayConfig | null;
  checkGatewayStatus: () => Promise<void>;
  reloadAppConfig: () => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [selectedChain, setSelectedChain] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [gatewayAvailable, setGatewayAvailable] = useState<boolean | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load darkMode and theme from app config on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await readAppConfig();
        setAppConfig(config);
        setDarkMode(config.darkMode ?? true);

        // Apply theme colors
        applyTheme(config);
      } catch (err) {
        console.error('Failed to load theme from app config:', err);
        // Fallback to dark mode
        setDarkMode(true);
      } finally {
        setThemeLoaded(true);
      }
    }
    loadTheme();
  }, []);

  // Apply chain-specific theme when selectedChain or darkMode changes
  useEffect(() => {
    if (!themeLoaded || !appConfig) return;

    async function applyChainTheme() {
      try {
        // Load THEMES.json
        const themesResponse = await fetch('/THEMES.json');
        const themesData = await themesResponse.json();

        // Get the theme name for the selected chain
        const themeName = appConfig?.theme?.chains?.[selectedChain];
        if (!themeName) {
          console.log(`No theme configured for chain: ${selectedChain}`);
          return;
        }

        // Get the theme colors
        const themeColors = themesData.themes?.[themeName];
        if (!themeColors) {
          console.error(`Theme not found: ${themeName}`);
          return;
        }

        // Update appConfig with the new theme colors
        const updatedConfig: AppConfig = {
          darkMode: appConfig.darkMode,
          theme: {
            ...appConfig.theme,
            colors: themeColors.colors,
          },
        };

        setAppConfig(updatedConfig);
        applyTheme(updatedConfig);

        console.log(`Applied ${themeColors.name} theme for ${selectedChain}`);
      } catch (err) {
        console.error('Failed to apply chain-specific theme:', err);
      }
    }

    applyChainTheme();
  }, [selectedChain, themeLoaded, appConfig?.theme?.chains, darkMode]);

  // Apply darkMode to document and save to config
  useEffect(() => {
    if (!themeLoaded) return;

    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Update theme colors for the new mode
    if (appConfig) {
      updateThemeForDarkMode(appConfig, darkMode);
    }

    // Save darkMode to app config
    updateAppConfigValue('darkMode', darkMode).catch(err => {
      console.error('Failed to save darkMode to app config:', err);
    });
  }, [darkMode, themeLoaded, appConfig]);

  const toggleTheme = () => {
    setDarkMode(prev => !prev);
  };

  // Check Gateway status and load config on mount
  useEffect(() => {
    checkGatewayStatus();
  }, []);

  async function checkGatewayStatus() {
    try {
      // Fetch full Gateway config
      const config = await gatewayGet<GatewayConfig>('/config');
      setGatewayConfig(config);
      setGatewayAvailable(true);

      // Set defaults from config - prefer solana, fallback to ethereum
      if (config.solana) {
        setSelectedChain('solana');
        setSelectedNetwork(config.solana.defaultNetwork);
        setSelectedWallet(config.solana.defaultWallet);
      } else if (config.ethereum) {
        setSelectedChain('ethereum');
        setSelectedNetwork(config.ethereum.defaultNetwork);
        setSelectedWallet(config.ethereum.defaultWallet);
      }

      setConfigLoaded(true);
    } catch (err) {
      console.error('Gateway unavailable:', err);
      setGatewayAvailable(false);
      setConfigLoaded(true);
    }
  }

  async function reloadAppConfig() {
    try {
      const config = await readAppConfig();
      setAppConfig(config);
      setDarkMode(config.darkMode ?? true);
      console.log('Reloaded app config from disk');
    } catch (err) {
      console.error('Failed to reload app config:', err);
    }
  }

  return (
    <AppContext.Provider
      value={{
        selectedNetwork,
        setSelectedNetwork,
        selectedWallet,
        setSelectedWallet,
        selectedChain,
        setSelectedChain,
        darkMode,
        setDarkMode,
        toggleTheme,
        gatewayAvailable,
        gatewayConfig,
        checkGatewayStatus,
        reloadAppConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
