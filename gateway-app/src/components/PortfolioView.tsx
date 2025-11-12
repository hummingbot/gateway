import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { gatewayPost } from '@/lib/api';
import { useApp } from '@/lib/AppContext';

interface Balance {
  symbol: string;
  balance: string;
  value?: number;
}

export function PortfolioView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedWallet) return;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch wallet balances
        const balanceData = await gatewayPost<any>(
          `/chains/${selectedChain}/balances`,
          {
            network: selectedNetwork,
            address: selectedWallet,
          }
        );

        // Convert balances object to array format
        if (balanceData.balances) {
          const balanceArray = Object.entries(balanceData.balances).map(([symbol, balance]) => ({
            symbol,
            balance: String(balance),
            value: 0, // TODO: fetch prices
          }));
          setBalances(balanceArray);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedChain, selectedNetwork, selectedWallet]);

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

  const totalValue = balances.reduce((sum, b) => sum + (b.value || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Holdings Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Total Holdings</span>
            <span className="text-2xl">${totalValue.toFixed(2)}</span>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Token Balances */}
      <Card>
        <CardHeader>
          <CardTitle>Token Balances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {balances.length === 0 ? (
              <p className="text-muted-foreground">No tokens found</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Asset</th>
                    <th className="text-right py-2">Balance</th>
                    <th className="text-right py-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{balance.symbol}</td>
                      <td className="text-right">{balance.balance}</td>
                      <td className="text-right">
                        ${(balance.value || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
