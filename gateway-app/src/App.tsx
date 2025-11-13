import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppProvider, useApp } from './lib/AppContext';
import { Select } from './components/ui/select';
import { PortfolioView } from './components/PortfolioView';
import { SwapView } from './components/SwapView';
import { ConfigView } from './components/ConfigView';
import { WalletSelector } from './components/WalletSelector';
import { AddWalletModal } from './components/AddWalletModal';
import { gatewayGet, gatewayPost } from './lib/api';
import { showSuccessNotification } from './lib/notifications';

function AppContent() {
  const { selectedNetwork, setSelectedNetwork, selectedWallet, setSelectedWallet, selectedChain, setSelectedChain, theme, toggleTheme } = useApp();
  const [activeTab, setActiveTab] = useState('portfolio');
  const [allWallets, setAllWallets] = useState<Array<{chain: string, walletAddresses: string[]}>>([]);
  const [networks, setNetworks] = useState<string[]>([]);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

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
      <Toaster position="top-center" />
      <div className="flex flex-col h-screen">
        {/* Header */}
        <header className="border-b px-4 md:px-6 py-3 md:py-4">
        <div className="flex justify-between items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold">Gateway</h1>

          <div className="flex gap-2 md:gap-4 items-center">
            {/* Desktop: Full Wallet Selector */}
            <div className="hidden sm:block">
              <WalletSelector
                allWallets={allWallets}
                selectedWallet={selectedWallet}
                selectedChain={selectedChain}
                onWalletChange={handleWalletChange}
                onAddWallet={() => setShowAddWallet(true)}
              />
            </div>

            {/* Mobile: Wallet Icon Button */}
            <button
              onClick={() => setShowWalletModal(true)}
              className="sm:hidden p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="Select wallet"
              title={selectedWallet || 'No wallet'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"></path>
                <path d="m21 2-9.6 9.6"></path>
                <circle cx="7.5" cy="15.5" r="5.5"></circle>
              </svg>
            </button>

            {/* Mobile: Network Icon Button */}
            <button
              onClick={() => setShowNetworkModal(true)}
              className="sm:hidden p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="Select network"
              title={`${selectedChain}-${selectedNetwork}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 7 9 3 5 7l4 4"></path>
                <path d="m17 11 4 4-4 4-4-4"></path>
                <path d="m8 12 4 4 6-6-4-4Z"></path>
                <circle cx="16" cy="16" r="6"></circle>
              </svg>
            </button>

            {/* Desktop: Full Network Selector */}
            <div className="hidden sm:block">
              <Select
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(e.target.value)}
                className="w-48 text-sm"
              >
                {networks.length > 0 ? (
                  networks.map((network) => (
                    <option key={network} value={network}>
                      {selectedChain}-{network}
                    </option>
                  ))
                ) : (
                  <option value={selectedNetwork}>
                    {selectedChain}-{selectedNetwork}
                  </option>
                )}
              </Select>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="m4.93 4.93 1.41 1.41"></path>
                  <path d="m17.66 17.66 1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="m6.34 17.66-1.41 1.41"></path>
                  <path d="m19.07 4.93-1.41 1.41"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Add Wallet Modal */}
      {showAddWallet && (
        <AddWalletModal
          onClose={() => setShowAddWallet(false)}
          onAddWallet={handleAddWallet}
          defaultChain={selectedChain}
        />
      )}

      {/* Network Selection Modal (Mobile) */}
      {showNetworkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-background w-full sm:w-96 sm:rounded-lg rounded-t-lg max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex justify-between items-center">
              <h3 className="font-semibold">Select Network</h3>
              <button
                onClick={() => setShowNetworkModal(false)}
                className="p-1 hover:bg-accent rounded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-2">
              {networks.map((network) => (
                <button
                  key={network}
                  onClick={() => {
                    setSelectedNetwork(network);
                    setShowNetworkModal(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    selectedNetwork === network
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  <div className="font-medium">{selectedChain}-{network}</div>
                </button>
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
              <button
                onClick={() => setShowWalletModal(false)}
                className="p-1 hover:bg-accent rounded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {allWallets.map((wallet) => (
                <div key={wallet.chain}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">{wallet.chain}</h4>
                  <div className="space-y-2">
                    {wallet.walletAddresses.map((address) => (
                      <button
                        key={address}
                        onClick={async () => {
                          await handleWalletChange(address, wallet.chain);
                          setShowWalletModal(false);
                        }}
                        className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                          selectedWallet === address && selectedChain === wallet.chain
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                        }`}
                      >
                        <div className="font-mono text-sm">
                          {address.substring(0, 6)}...{address.substring(address.length - 4)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  setShowWalletModal(false);
                  setShowAddWallet(true);
                }}
                className="w-full px-4 py-3 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-accent transition-colors text-center"
              >
                + Add Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'portfolio' && <PortfolioView />}
        {activeTab === 'swap' && <SwapView />}
        {activeTab === 'config' && <ConfigView />}
      </div>

      {/* Bottom Navigation */}
      <nav className="border-t bg-background">
        <div className="flex justify-around items-center h-16 max-w-2xl mx-auto">
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'portfolio'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
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
            <span className="text-xs font-medium">Wallet</span>
          </button>

          <button
            onClick={() => setActiveTab('swap')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'swap'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
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
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              activeTab === 'config'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
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
          </button>
        </div>
      </nav>
    </div>
    </>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
