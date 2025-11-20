import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Plus } from 'lucide-react';
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
import { TokenDetailsModal } from './TokenDetailsModal';
import { ConfirmModal } from './ConfirmModal';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import { getSelectableTokenList, TokenInfo } from '@/lib/utils';
import type { PositionWithConnector as Position, ConnectorConfig } from '@/lib/gateway-types';
import { capitalize, shortenAddress, getChainNetwork } from '@/lib/utils/string';
import { formatTokenAmount, formatBalance } from '@/lib/utils/format';

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
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<Balance | null>(null);
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [hideZeroBalances, setHideZeroBalances] = useState(true);

  useEffect(() => {
    loadNetworks();
  }, [selectedChain]);

  useEffect(() => {
    if (!selectedWallet) return;
    fetchData();
    fetchPositions();
  }, [selectedChain, selectedNetwork, selectedWallet]);

  async function loadNetworks() {
    const configData = await gatewayAPI.config.getChains();
    const chainData = configData.chains?.find((c) => c.chain === selectedChain);
    if (chainData?.networks) {
      setAvailableNetworks(chainData.networks);
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
        const data = await gatewayAPI.clmm.getPositionsOwned(
          connector,
          chainNetwork,
          selectedWallet
        );
        return data.map((position) => ({
          ...position,
          connector,
        }));
      });

      const positionResults = await Promise.all(positionPromises);
      const allPositions = positionResults.flat();

      setPositions(allPositions);
    } catch (err) {
      setPositions([]);
      throw err;
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hideZero"
                checked={hideZeroBalances}
                onCheckedChange={(checked) => setHideZeroBalances(checked === true)}
              />
              <Label htmlFor="hideZero" className="cursor-pointer text-sm">Hide Zero Balances</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6">
          <div className="space-y-4">
            {balances.length === 0 ? (
              <p className="text-muted-foreground">No tokens found</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balances
                      .filter(balance => !hideZeroBalances || balance.balance !== '0')
                      .map((balance, i) => {
                        const formattedBalance = formatBalance(balance.balance, 6);

                        return (
                          <TableRow key={i}>
                            <TableCell>
                              <button
                                onClick={() => {
                                  const token = tokenList.find(t => t.symbol === balance.symbol);
                                  if (token) {
                                    setSelectedToken(token);
                                    setSelectedBalance(balance);
                                  }
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
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setShowAddToken(true)} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Token
                  </Button>
                </div>
              </>
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
      <AddTokenModal
        open={showAddToken}
        onOpenChange={setShowAddToken}
        onAddToken={handleAddToken}
        defaultChain={selectedChain}
        defaultNetwork={selectedNetwork}
        availableNetworks={availableNetworks}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!tokenToDelete}
        onOpenChange={(open) => {
          if (!open) setTokenToDelete(null);
        }}
        title="Delete Token"
        description={tokenToDelete ? `Are you sure you want to delete ${tokenToDelete.symbol} (${tokenToDelete.name}) from your token list?` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteToken}
        destructive={true}
      />

      {/* Token Details Modal */}
      <TokenDetailsModal
        open={!!selectedToken}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedToken(null);
            setSelectedBalance(null);
          }
        }}
        token={selectedToken}
        balance={selectedBalance}
        chain={selectedChain}
        network={selectedNetwork}
        nativeSymbol={nativeSymbol}
        onDeleteToken={(balance) => {
          setTokenToDelete(balance);
        }}
      />
    </div>
  );
}
