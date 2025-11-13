import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { readAppConfig, updateAppConfigValue } from './app-config';

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

  // Load darkMode from app config on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await readAppConfig();
        setDarkMode(config.darkMode ?? true);
      } catch (err) {
        console.error('Failed to load darkMode from app config:', err);
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

    // Save darkMode to app config
    updateAppConfigValue('darkMode', darkMode).catch(err => {
      console.error('Failed to save darkMode to app config:', err);
    });
  }, [darkMode, themeLoaded]);

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
