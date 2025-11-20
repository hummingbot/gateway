import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AppProvider, useApp } from './lib/AppContext';
import { Button } from './components/ui/button';
import { PortfolioView } from './components/PortfolioView';
import { SwapView } from './components/SwapView';
import { PoolsView } from './components/PoolsView';
import { ActivityView } from './components/ActivityView';
import { ConfigView } from './components/ConfigView';
import { AddWalletModal } from './components/AddWalletModal';
import { NavigationBar } from './components/NavigationBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { gatewayGet, gatewayPost } from './lib/api';
import { showSuccessNotification } from './lib/notifications';
import { Route as RouteIcon, Wallet, Droplet, Activity, Settings } from 'lucide-react';

function AppContent() {
  const { selectedNetwork, setSelectedNetwork, selectedWallet, setSelectedWallet, selectedChain, setSelectedChain, darkMode } = useApp();
  const location = useLocation();
  const [allWallets, setAllWallets] = useState<Array<{chain: string, walletAddresses: string[]}>>([]);
  const [networks, setNetworks] = useState<string[]>([]);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detect if running on Android using user agent
    const isAndroidDevice = /Android/i.test(navigator.userAgent);
    setIsAndroid(isAndroidDevice);
  }, []);

  useEffect(() => {
    loadWalletsAndNetworks();
  }, []);

  useEffect(() => {
    loadNetworksForChain();
  }, [selectedChain]);

  async function loadWalletsAndNetworks() {
    try {
      // Load all wallets
      const walletsData = await gatewayGet<any>('/wallet');
      if (Array.isArray(walletsData)) {
        setAllWallets(walletsData);

        // Set initial wallet if none selected
        if (!selectedWallet) {
          const chainWallets = walletsData.find((w: any) => w.chain === selectedChain);
          if (chainWallets?.walletAddresses && chainWallets.walletAddresses.length > 0) {
            setSelectedWallet(chainWallets.walletAddresses[0]);
          }
        }
      }

      // Load networks for current chain
      await loadNetworksForChain();
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }

  async function loadNetworksForChain() {
    try {
      const configData = await gatewayGet<any>('/config/chains');
      const chainData = configData.chains?.find((c: any) => c.chain === selectedChain);
      if (chainData?.networks) {
        setNetworks(chainData.networks);

        // If current network is not in the list, switch to default network
        if (!chainData.networks.includes(selectedNetwork)) {
          setSelectedNetwork(chainData.defaultNetwork || chainData.networks[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load networks:', err);
    }
  }

  async function handleAddWallet(chain: string, privateKey: string) {
    await gatewayPost('/wallet/add', {
      chain,
      privateKey,
    });

    // Reload all wallets
    await loadWalletsAndNetworks();

    // Select the newly added wallet
    const walletsData = await gatewayGet<any>('/wallet');
    if (Array.isArray(walletsData)) {
      const chainWallets = walletsData.find((w: any) => w.chain === chain);
      if (chainWallets?.walletAddresses && chainWallets.walletAddresses.length > 0) {
        setSelectedWallet(chainWallets.walletAddresses[chainWallets.walletAddresses.length - 1]);
        setSelectedChain(chain);
      }
    }

    await showSuccessNotification('Wallet added successfully!');
  }

  async function handleWalletChange(wallet: string, chain: string) {
    // If chain is changing, load networks and switch to default network
    if (chain !== selectedChain) {
      const configData = await gatewayGet<any>('/config/chains');
      const chainData = configData.chains?.find((c: any) => c.chain === chain);

      const defaultNet = chainData.defaultNetwork || chainData.networks[0];
      setNetworks(chainData.networks);
      setSelectedNetwork(defaultNet);
      setSelectedChain(chain);
      setSelectedWallet(wallet);
    } else {
      // Same chain, just update wallet
      setSelectedWallet(wallet);
    }
  }

  return (
    <>
      <Toaster
        position="bottom-center"
        richColors
        className={isAndroid ? '!bottom-[calc(5rem+env(safe-area-inset-bottom))]' : '!bottom-20'}
      />
      <div className={`flex flex-col h-screen ${isAndroid ? 'pt-safe pb-safe-bottom' : ''}`}>
        {/* Header */}
        <NavigationBar
          darkMode={darkMode}
          allWallets={allWallets}
          selectedWallet={selectedWallet}
          selectedChain={selectedChain}
          networks={networks}
          selectedNetwork={selectedNetwork}
          onWalletChange={handleWalletChange}
          onAddWallet={() => setShowAddWallet(true)}
          onNetworkChange={setSelectedNetwork}
          gatewayPath="/Users/feng/gateway"
        />

      {/* Add Wallet Modal */}
      <AddWalletModal
        open={showAddWallet}
        onOpenChange={setShowAddWallet}
        onAddWallet={handleAddWallet}
        defaultChain={selectedChain}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/portfolio" replace />} />
          <Route path="/portfolio" element={<PortfolioView />} />
          <Route path="/swap" element={<SwapView />} />
          <Route path="/pools" element={<PoolsView />} />
          <Route path="/pools/:address" element={<PoolsView />} />
          <Route path="/transactions" element={<ActivityView />} />
          <Route path="/transactions/:signature" element={<ActivityView />} />
          <Route path="/config" element={<Navigate to="/config/app" replace />} />
          <Route path="/config/:namespace" element={<ConfigView />} />
        </Routes>
      </div>

      {/* Bottom Navigation */}
      <nav className="border-t bg-background">
        <div className="flex justify-around items-center h-16 max-w-2xl mx-auto">
          <NavLink
            to="/portfolio"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full gap-1 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Wallet className="h-6 w-6" />
            <span className="text-xs font-medium">Portfolio</span>
          </NavLink>

          <NavLink
            to="/swap"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full gap-1 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <RouteIcon className="h-6 w-6" />
            <span className="text-xs font-medium">Swap</span>
          </NavLink>

          <NavLink
            to="/pools"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full gap-1 ${
                isActive || location.pathname.startsWith('/pools')
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Droplet className="h-6 w-6" />
            <span className="text-xs font-medium">Pools</span>
          </NavLink>

          <NavLink
            to="/transactions"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full gap-1 ${
                isActive || location.pathname.startsWith('/transactions')
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Activity className="h-6 w-6" />
            <span className="text-xs font-medium">Transactions</span>
          </NavLink>

          <NavLink
            to="/config"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full gap-1 ${
                isActive || location.pathname.startsWith('/config')
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <Settings className="h-6 w-6" />
            <span className="text-xs font-medium">Config</span>
          </NavLink>
        </div>
      </nav>
    </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
