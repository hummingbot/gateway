import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './lib/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Select } from './components/ui/select';
import { PortfolioView } from './components/PortfolioView';
import { SwapView } from './components/SwapView';
import { PoolsView } from './components/PoolsView';
import { LiquidityView } from './components/LiquidityView';
import { gatewayGet } from './lib/api';

function AppContent() {
  const { selectedNetwork, setSelectedNetwork, selectedWallet, setSelectedWallet, selectedChain, setSelectedChain } = useApp();
  const [activeTab, setActiveTab] = useState('portfolio');
  const [wallets, setWallets] = useState<string[]>([]);
  const [networks, setNetworks] = useState<string[]>([]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        // Load available wallets
        const walletsData = await gatewayGet<any>('/wallet');
        if (walletsData.wallets && walletsData.wallets.length > 0) {
          setWallets(walletsData.wallets.map((w: any) => w.address));
          if (!selectedWallet) {
            setSelectedWallet(walletsData.wallets[0].address);
          }
        }

        // Load available networks for selected chain
        const configData = await gatewayGet<any>('/config/chains');
        const chainData = configData.chains?.find((c: any) => c.name === selectedChain);
        if (chainData?.networks) {
          setNetworks(chainData.networks);
          if (!networks.includes(selectedNetwork)) {
            setSelectedNetwork(chainData.networks[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    }

    loadInitialData();
  }, [selectedChain]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Gateway</h1>

          <div className="flex gap-4">
            <Select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className="w-40"
            >
              <option value="solana">Solana</option>
              <option value="ethereum">Ethereum</option>
              <option value="polygon">Polygon</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="base">Base</option>
            </Select>

            <Select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-40"
            >
              {networks.length > 0 ? (
                networks.map((network) => (
                  <option key={network} value={network}>
                    {network}
                  </option>
                ))
              ) : (
                <option value={selectedNetwork}>{selectedNetwork}</option>
              )}
            </Select>

            <Select
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="w-48"
            >
              {wallets.length > 0 ? (
                wallets.map((wallet) => (
                  <option key={wallet} value={wallet}>
                    {wallet.slice(0, 6)}...{wallet.slice(-4)}
                  </option>
                ))
              ) : (
                <option value="">No wallet</option>
              )}
            </Select>
          </div>
        </div>
      </header>

      {/* Main Content with Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b px-6 pt-4">
            <TabsList>
              <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
              <TabsTrigger value="swap">Swap</TabsTrigger>
              <TabsTrigger value="pools">Pools</TabsTrigger>
              <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="portfolio" className="h-full m-0">
              <PortfolioView />
            </TabsContent>

            <TabsContent value="swap" className="h-full m-0">
              <SwapView />
            </TabsContent>

            <TabsContent value="pools" className="h-full m-0">
              <PoolsView />
            </TabsContent>

            <TabsContent value="liquidity" className="h-full m-0">
              <LiquidityView />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
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
