import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { readAppConfig, updateAppConfigValue, AppConfig } from './app-config';
import { applyTheme, updateThemeForDarkMode } from './theme-manager';

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
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState('mainnet-beta');
  const [selectedWallet, setSelectedWallet] = useState('');
  const [selectedChain, setSelectedChain] = useState('solana');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

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
