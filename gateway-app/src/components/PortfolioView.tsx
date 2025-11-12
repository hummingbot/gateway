import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { gatewayPost, gatewayGet } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import { AddTokenModal } from './AddTokenModal';

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

interface Balance {
  symbol: string;
  address: string;
  balance: string;
  value?: number;
}

export function PortfolioView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddToken, setShowAddToken] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [nativeSymbol, setNativeSymbol] = useState<string>('');

  useEffect(() => {
    loadNetworks();
  }, [selectedChain]);

  useEffect(() => {
    if (!selectedWallet) return;
    fetchData();
  }, [selectedChain, selectedNetwork, selectedWallet]);

  async function loadNetworks() {
    try {
      const configData = await gatewayGet<any>('/config/chains');
      const chainData = configData.chains?.find((c: any) => c.chain === selectedChain);
      if (chainData?.networks) {
        setAvailableNetworks(chainData.networks);
      }
    } catch (err) {
      console.error('Failed to load networks:', err);
    }
  }

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Fetch all configs to get native currency symbol
      const allConfigsData = await gatewayGet<any>('/config');
      const namespace = `${selectedChain}-${selectedNetwork}`;
      const networkConfig = allConfigsData[namespace];

      // Get nativeCurrencySymbol from network config
      const nativeCurrency = networkConfig?.nativeCurrencySymbol || 'SOL'; // Default fallback
      setNativeSymbol(nativeCurrency);

      // Fetch all tokens for this network
      const allTokens = await gatewayGet<{ tokens: Token[] }>(
        `/tokens?chain=${selectedChain}&network=${selectedNetwork}`
      );

      // Fetch wallet balances
      const balanceData = await gatewayPost<any>(
        `/chains/${selectedChain}/balances`,
        {
          network: selectedNetwork,
          address: selectedWallet,
        }
      );

      // Create a map of balances by symbol
      const balanceMap = new Map<string, string>();
      if (balanceData.balances) {
        Object.entries(balanceData.balances).forEach(([symbol, balance]) => {
          balanceMap.set(symbol, String(balance));
        });
      }

      // Merge all tokens with their balances (0 if not in balance response)
      let mergedBalances: Balance[] = (allTokens.tokens || []).map((token) => ({
        symbol: token.symbol,
        address: token.address,
        balance: balanceMap.get(token.symbol) || '0',
        value: 0, // TODO: fetch prices
      }));

      // Sort so native token comes first
      mergedBalances = mergedBalances.sort((a, b) => {
        if (a.symbol === nativeCurrency) return -1;
        if (b.symbol === nativeCurrency) return 1;
        return 0;
      });

      setBalances(mergedBalances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToken(chain: string, network: string, address: string) {
    await gatewayPost('/tokens/save', {
      chain,
      network,
      address,
    });

    // Reload data
    await fetchData();
    alert('Token added successfully!');
  }

  if (!selectedWallet) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Wallet Selected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please select a wallet from the dropdown above to view your portfolio.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading portfolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Balances */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Balances</CardTitle>
            <Button onClick={() => setShowAddToken(true)} size="sm">
              Add Token
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {balances.length === 0 ? (
              <p className="text-muted-foreground">No tokens found</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Token</th>
                    <th className="text-right py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance, i) => (
                    <tr key={i} className="border-b">
                      <td className={`py-2 ${balance.symbol === nativeSymbol ? 'font-bold' : ''}`}>
                        {balance.symbol}
                      </td>
                      <td className={`text-right ${balance.symbol === nativeSymbol ? 'font-bold' : ''}`}>
                        {balance.balance}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Token Modal */}
      {showAddToken && (
        <AddTokenModal
          onClose={() => setShowAddToken(false)}
          onAddToken={handleAddToken}
          defaultChain={selectedChain}
          defaultNetwork={selectedNetwork}
          availableNetworks={availableNetworks}
        />
      )}
    </div>
  );
}
