import { createContext, useContext, useState, ReactNode } from 'react';

interface AppState {
  selectedNetwork: string;
  setSelectedNetwork: (network: string) => void;
  selectedWallet: string;
  setSelectedWallet: (wallet: string) => void;
  selectedChain: string;
  setSelectedChain: (chain: string) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState('mainnet-beta');
  const [selectedWallet, setSelectedWallet] = useState('');
  const [selectedChain, setSelectedChain] = useState('solana');

  return (
    <AppContext.Provider
      value={{
        selectedNetwork,
        setSelectedNetwork,
        selectedWallet,
        setSelectedWallet,
        selectedChain,
        setSelectedChain,
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
