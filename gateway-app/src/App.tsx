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
import { gatewayGet, gatewayPost } from './lib/api';
import { showSuccessNotification } from './lib/notifications';

function AppContent() {
  const { selectedNetwork, setSelectedNetwork, selectedWallet, setSelectedWallet, selectedChain, setSelectedChain, darkMode } = useApp();
  const location = useLocation();
  const [allWallets, setAllWallets] = useState<Array<{chain: string, walletAddresses: string[]}>>([]);
  const [networks, setNetworks] = useState<string[]>([]);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
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
          onOpenWalletModal={() => setShowWalletModal(true)}
          onOpenNetworkModal={() => setShowNetworkModal(true)}
          gatewayPath="/Users/feng/gateway"
        />

      {/* Add Wallet Modal */}
      <AddWalletModal
        open={showAddWallet}
        onOpenChange={setShowAddWallet}
        onAddWallet={handleAddWallet}
        defaultChain={selectedChain}
      />

      {/* Network Selection Modal (Mobile) */}
      {showNetworkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-background w-full sm:w-96 sm:rounded-lg rounded-t-lg max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex justify-between items-center">
              <h3 className="font-semibold">Select Network</h3>
              <Button
                onClick={() => setShowNetworkModal(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </Button>
            </div>
            <div className="p-4 space-y-2">
              {networks.map((network) => (
                <Button
                  key={network}
                  onClick={() => {
                    setSelectedNetwork(network);
                    setShowNetworkModal(false);
                  }}
                  variant={selectedNetwork === network ? "default" : "ghost"}
                  className="w-full justify-start px-4 py-3 h-auto"
                >
                  <div className="font-medium">{selectedChain}-{network}</div>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Wallet Selection Modal (Mobile) */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-background w-full sm:w-96 sm:rounded-lg rounded-t-lg max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex justify-between items-center">
              <h3 className="font-semibold">Select Wallet</h3>
              <Button
                onClick={() => setShowWalletModal(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {allWallets.map((wallet) => (
                <div key={wallet.chain}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">{wallet.chain}</h4>
                  <div className="space-y-2">
                    {wallet.walletAddresses.map((address) => (
                      <Button
                        key={address}
                        onClick={async () => {
                          await handleWalletChange(address, wallet.chain);
                          setShowWalletModal(false);
                        }}
                        variant={selectedWallet === address && selectedChain === wallet.chain ? "default" : "ghost"}
                        className="w-full justify-start px-4 py-3 h-auto"
                      >
                        <div className="font-mono text-sm">
                          {address.substring(0, 6)}...{address.substring(address.length - 4)}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              <Button
                onClick={() => {
                  setShowWalletModal(false);
                  setShowAddWallet(true);
                }}
                variant="outline"
                className="w-full px-4 py-3 h-auto border-2 border-dashed"
              >
                + Add Wallet
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 3 4 4-4 4" />
              <path d="M20 7H4" />
              <path d="m8 21-4-4 4-4" />
              <path d="M4 17h16" />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
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
    <AppProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
