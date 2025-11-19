import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { LiquidityPositionCard } from './LiquidityPositionCard';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { AddTokenModal } from './AddTokenModal';
import { ConfirmModal } from './ConfirmModal';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import { getSelectableTokenList, TokenInfo } from '@/lib/utils';
import type { PositionWithConnector as Position, ConnectorConfig } from '@/lib/gateway-types';
import { capitalize, shortenAddress, getChainNetwork } from '@/lib/utils/string';
import { formatTokenAmount, formatBalance } from '@/lib/utils/format';
import { getExplorerTokenUrl } from '@/lib/utils/explorer';

interface Balance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  value?: number;
}

export function PortfolioView() {
  const { selectedChain, selectedNetwork, selectedWallet, gatewayAvailable } = useApp();
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
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);

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
      const configData = await gatewayAPI.config.getChains();
      const chainData = configData.chains?.find((c) => c.chain === selectedChain);
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
      const balanceData = await gatewayAPI.chains.getBalances(selectedChain, {
        network: selectedNetwork,
        address: selectedWallet,
      });

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
      setTokenList(tokenList);
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
      const configData = await gatewayAPI.config.getConnectors();
      const clmmConnectors = configData.connectors
        .filter((c) =>
          c.chain === selectedChain &&
          c.networks.includes(selectedNetwork) &&
          c.trading_types.includes('clmm')
        )
        .map((c) => c.name);

      // Fetch positions from all CLMM connectors
      const chainNetwork = getChainNetwork(selectedChain, selectedNetwork);
      const positionPromises = clmmConnectors.map(async (connector) => {
        try {
          const data = await gatewayAPI.clmm.getPositionsOwned(
            connector,
            chainNetwork,
            selectedWallet
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
      const chainNetwork = getChainNetwork(chain, network);

      const response = await gatewayAPI.tokens.save(address, chainNetwork);

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
      await gatewayAPI.tokens.delete(tokenToDelete.address, selectedChain, selectedNetwork);

      // Reload data
      await fetchData();
      await showSuccessNotification(`${tokenSymbol} deleted successfully!`);
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to delete token');
    } finally {
      setTokenToDelete(null);
    }
  }

  // Check Gateway availability first
  if (gatewayAvailable === null) {
    return <LoadingState message="Checking Gateway connection..." />;
  }

  if (gatewayAvailable === false) {
    return (
      <EmptyState
        title="Gateway API Unavailable"
        message="Please make sure the Gateway server is running at localhost:15888"
        icon="⚠️"
      />
    );
  }

  if (!selectedWallet) {
    return (
      <EmptyState
        title="No Wallet Selected"
        message="Please select a wallet from the dropdown above to view your portfolio."
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading portfolio..." />;
  }

  if (error) {
    return (
      <EmptyState
        title="Error"
        message={error}
      />
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="w-8 md:w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((balance, i) => {
                    const explorerUrl = balance.address
                      ? `https://solscan.io/token/${balance.address}`
                      : null;
                    const isNative = balance.symbol === nativeSymbol;
                    const formattedBalance = formatBalance(balance.balance, 6);

                    return (
                      <TableRow
                        key={i}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <TableCell>
                          <button
                            onClick={() => {
                              const token = tokenList.find(t => t.symbol === balance.symbol);
                              setSelectedToken(token || null);
                            }}
                            className="hover:underline text-blue-600 dark:text-blue-400 cursor-pointer"
                          >
                            {balance.symbol}
                          </button>
                        </TableCell>
                        <TableCell>
                          {balance.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {formattedBalance}
                        </TableCell>
                        <TableCell className="text-right">
                          {hoveredRow === i && !isNative && balance.address && (
                            <Button
                              onClick={() => setTokenToDelete(balance)}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive/80"
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
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
                <LiquidityPositionCard key={i} position={position} />
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

      {/* Token Details Modal */}
      {selectedToken && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedToken(null)}
        >
          <Card
            className="max-w-lg w-full border shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="p-3 md:p-6">
              <div className="flex justify-between items-start">
                <CardTitle>Token Details</CardTitle>
                <Button
                  onClick={() => setSelectedToken(null)}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 md:p-6 space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Symbol:</span>
                  <span className="font-medium">{selectedToken.symbol}</span>
                </div>

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{selectedToken.name}</span>
                </div>

                {selectedToken.address && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Address:</span>
                    <span className="font-mono text-xs">{shortenAddress(selectedToken.address, 6, 4)}</span>
                  </div>
                )}

                {selectedToken.decimals !== undefined && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Decimals:</span>
                    <span className="font-medium">{selectedToken.decimals}</span>
                  </div>
                )}
              </div>

              {selectedToken.address && (
                <div className="pt-2">
                  <a
                    href={getExplorerTokenUrl(selectedChain, selectedNetwork, selectedToken.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    View on Explorer ↗
                  </a>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setSelectedToken(null)} size="sm">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
