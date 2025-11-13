import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { readAppConfig, updateAppConfigValue } from './app-config';

interface AppState {
  selectedNetwork: string;
  setSelectedNetwork: (network: string) => void;
  selectedWallet: string;
  setSelectedWallet: (wallet: string) => void;
  selectedChain: string;
  setSelectedChain: (chain: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState('mainnet-beta');
  const [selectedWallet, setSelectedWallet] = useState('');
  const [selectedChain, setSelectedChain] = useState('solana');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Load theme from app config on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const config = await readAppConfig();
        setTheme(config.theme || 'dark');
      } catch (err) {
        console.error('Failed to load theme from app config:', err);
        // Fallback to dark theme
        setTheme('dark');
      } finally {
        setThemeLoaded(true);
      }
    }
    loadTheme();
  }, []);

  // Apply theme to document and save to config
  useEffect(() => {
    if (!themeLoaded) return;

    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Save theme to app config
    updateAppConfigValue('theme', theme).catch(err => {
      console.error('Failed to save theme to app config:', err);
    });
  }, [theme, themeLoaded]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
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
        theme,
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
