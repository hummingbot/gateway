import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { gatewayPost, gatewayGet, gatewayDelete } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import { AddTokenModal } from './AddTokenModal';
import { ConfirmModal } from './ConfirmModal';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import { getSelectableTokenList, TokenInfo } from '@/lib/utils';

interface Balance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  value?: number;
}

// PositionInfo from Gateway CLMM schema
interface Position {
  address: string;
  poolAddress: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  baseFeeAmount: number;
  quoteFeeAmount: number;
  lowerBinId: number;
  upperBinId: number;
  lowerPrice: number;
  upperPrice: number;
  price: number;
  rewardTokenAddress?: string;
  rewardAmount?: number;
  connector: string;
}

interface ConnectorConfig {
  name: string;
  trading_types: string[];
  chain: string;
  networks: string[];
}

export function PortfolioView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddToken, setShowAddToken] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [nativeSymbol, setNativeSymbol] = useState<string>('');
  const [tokenToDelete, setTokenToDelete] = useState<Balance | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  useEffect(() => {
    loadNetworks();
  }, [selectedChain]);

  useEffect(() => {
    if (!selectedWallet) return;
    fetchData();
    fetchPositions();
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

      // Get selectable token list (native token first, no duplicates)
      const tokenList = await getSelectableTokenList(selectedChain, selectedNetwork);

      // Set native symbol from the first token
      if (tokenList.length > 0) {
        setNativeSymbol(tokenList[0].symbol);
      }

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

      // Build balances list from token list
      const mergedBalances: Balance[] = tokenList.map((token) => ({
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        balance: balanceMap.get(token.symbol) || '0',
        value: 0,
      }));

      setBalances(mergedBalances);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchPositions() {
    try {
      setLoadingPositions(true);

      // Fetch available CLMM connectors
      const configData = await gatewayGet<{ connectors: ConnectorConfig[] }>('/config/connectors');
      const clmmConnectors = configData.connectors
        .filter((c) =>
          c.chain === selectedChain &&
          c.networks.includes(selectedNetwork) &&
          c.trading_types.includes('clmm')
        )
        .map((c) => c.name);

      // Fetch positions from all CLMM connectors
      const chainNetwork = `${selectedChain}-${selectedNetwork}`;
      const positionPromises = clmmConnectors.map(async (connector) => {
        try {
          const data = await gatewayGet<Position[]>(
            `/trading/clmm/positions-owned?connector=${connector}&chainNetwork=${chainNetwork}&walletAddress=${selectedWallet}`
          );
          // Add connector property to each position
          return data.map((position) => ({
            ...position,
            connector,
          }));
        } catch (err) {
          console.error(`Failed to fetch positions for ${connector}:`, err);
          return [];
        }
      });

      const positionResults = await Promise.all(positionPromises);
      const allPositions = positionResults.flat();

      setPositions(allPositions);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      setPositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }

  async function handleAddToken(chain: string, network: string, address: string) {
    try {
      // Format chainNetwork parameter (e.g., "solana-mainnet-beta" or "ethereum-mainnet")
      const chainNetwork = `${chain}-${network}`;

      const response = await gatewayPost<{ message: string; token: TokenInfo }>(
        `/tokens/save/${address}?chainNetwork=${chainNetwork}`,
        {}
      );

      // Reload data
      await fetchData();
      await showSuccessNotification(`${response.token.symbol} added successfully!`);
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to add token');
    }
  }

  async function handleDeleteToken() {
    if (!tokenToDelete || !tokenToDelete.address) return;

    const tokenSymbol = tokenToDelete.symbol;

    try {
      await gatewayDelete(
        `/tokens/${tokenToDelete.address}?chain=${selectedChain}&network=${selectedNetwork}`
      );

      // Reload data
      await fetchData();
      await showSuccessNotification(`${tokenSymbol} deleted successfully!`);
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to delete token');
    } finally {
      setTokenToDelete(null);
    }
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
    <div className="p-3 md:p-6 space-y-3 md:space-y-6">
      {/* Balances */}
      <Card>
        <CardHeader className="p-3 md:p-6">
          <div className="flex justify-between items-center">
            <CardTitle>Tokens</CardTitle>
            <Button onClick={() => setShowAddToken(true)} size="sm">
              Add Token
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6">
          <div className="space-y-4">
            {balances.length === 0 ? (
              <p className="text-muted-foreground">No tokens found</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-xs md:text-sm">Symbol</th>
                    <th className="text-left py-2 text-xs md:text-sm">Name</th>
                    <th className="text-right py-2 text-xs md:text-sm">Balance</th>
                    <th className="w-8 md:w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance, i) => {
                    const explorerUrl = balance.address
                      ? `https://solscan.io/token/${balance.address}`
                      : null;
                    const isNative = balance.symbol === nativeSymbol;

                    // Format balance to max 6 decimals
                    const formattedBalance = (() => {
                      const num = parseFloat(balance.balance);
                      if (isNaN(num)) return balance.balance;

                      // If number has more than 6 decimal places, truncate to 6
                      const balanceStr = balance.balance;
                      const decimalIndex = balanceStr.indexOf('.');
                      if (decimalIndex !== -1 && balanceStr.length - decimalIndex - 1 > 6) {
                        return num.toFixed(6);
                      }
                      return balance.balance;
                    })();

                    return (
                      <tr
                        key={i}
                        className="border-b"
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <td className="py-2 text-xs md:text-sm">
                          {explorerUrl ? (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline text-blue-600 dark:text-blue-400"
                            >
                              {balance.symbol}
                            </a>
                          ) : (
                            balance.symbol
                          )}
                        </td>
                        <td className="py-2 text-xs md:text-sm">
                          {balance.name}
                        </td>
                        <td className="text-right text-xs md:text-sm">
                          {formattedBalance}
                        </td>
                        <td className="text-right">
                          {hoveredRow === i && !isNative && balance.address && (
                            <button
                              onClick={() => setTokenToDelete(balance)}
                              className="text-destructive hover:text-destructive/80 p-1"
                              title="Delete token"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Positions */}
      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle>Liquidity Positions</CardTitle>
        </CardHeader>
        <CardContent className="p-3 md:p-6">
          {loadingPositions ? (
            <p className="text-sm text-muted-foreground">Loading positions...</p>
          ) : positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No positions found</p>
          ) : (
            <div className="space-y-3">
              {positions.map((position, i) => (
                <div key={i} className="border rounded p-3 md:p-4 text-xs md:text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-muted-foreground">Connector:</span>
                      <p className="font-medium">{capitalize(position.connector)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pool:</span>
                      <p className="font-mono text-xs truncate">{position.poolAddress.substring(0, 8)}...{position.poolAddress.substring(position.poolAddress.length - 6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Price Range:</span>
                      <p className="font-medium">
                        {position.lowerPrice.toFixed(6)} - {position.upperPrice.toFixed(6)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Current Price:</span>
                      <p className="font-medium">{position.price.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Base Amount:</span>
                      <p className="font-medium">{position.baseTokenAmount.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quote Amount:</span>
                      <p className="font-medium">{position.quoteTokenAmount.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Base Fees:</span>
                      <p className="font-medium">{position.baseFeeAmount.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quote Fees:</span>
                      <p className="font-medium">{position.quoteFeeAmount.toFixed(6)}</p>
                    </div>
                    {position.rewardAmount !== undefined && position.rewardAmount > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Rewards:</span>
                        <p className="font-medium">{position.rewardAmount.toFixed(6)}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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

      {/* Delete Confirmation Modal */}
      {tokenToDelete && (
        <ConfirmModal
          title="Delete Token"
          message={`Are you sure you want to delete ${tokenToDelete.symbol} (${tokenToDelete.name}) from your token list?`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDeleteToken}
          onCancel={() => setTokenToDelete(null)}
        />
      )}
    </div>
  );
}
