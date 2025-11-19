import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { LiquidityPositionCard } from './LiquidityPositionCard';
import { PoolBinChart } from './PoolBinChart';
import { UserLiquidityChart } from './UserLiquidityChart';
import { TokenAmountInput } from './TokenAmountInput';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import type {
  PoolTemplate,
  ExtendedPoolInfo as PoolInfo,
  ConnectorConfig,
  PositionWithConnector as Position,
} from '@/lib/gateway-types';
import { capitalize, getChainNetwork } from '@/lib/utils/string';
import { formatTokenAmount, formatNumber } from '@/lib/utils/format';
import { getPoolUrl, getDexName } from '@/lib/pool-urls';
import { ExternalLink, ChevronDown } from 'lucide-react';

// UI-specific Pool type with connector property added
interface Pool extends PoolTemplate {
  connector: string;
}

export function PoolsView() {
  const { selectedChain, selectedNetwork, selectedWallet, gatewayAvailable } = useApp();
  const [availableConnectors, setAvailableConnectors] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['clmm']);
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [showConnectorDropdown, setShowConnectorDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [isAddPositionOpen, setIsAddPositionOpen] = useState(false);

  // Add liquidity form state
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [lowerPrice, setLowerPrice] = useState('');
  const [upperPrice, setUpperPrice] = useState('');
  const [fee, setFee] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [balances, setBalances] = useState<Record<string, string>>({});

  // Fetch available connectors when chain/network/types change
  useEffect(() => {
    fetchAvailableConnectors();
  }, [selectedChain, selectedNetwork, selectedTypes]);

  // Fetch pools when connectors/types or network changes
  useEffect(() => {
    if (selectedConnectors.length > 0) {
      fetchPools();
    }
  }, [selectedConnectors, selectedTypes, selectedNetwork]);

  // Fetch pool info and positions when pool is selected
  useEffect(() => {
    if (selectedPool && selectedWallet) {
      fetchPoolInfo();
      fetchPositions();
      fetchBalances();
    }
  }, [selectedPool, selectedWallet]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const dropdowns = document.querySelectorAll('.relative');
      let clickedInside = false;

      dropdowns.forEach((dropdown) => {
        if (dropdown.contains(target)) {
          clickedInside = true;
        }
      });

      if (!clickedInside) {
        setShowConnectorDropdown(false);
        setShowTypeDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function fetchAvailableConnectors() {
    try {
      const data = await gatewayAPI.config.getConnectors();

      // Filter connectors that support selected types for current chain and network
      const filteredConnectors = data.connectors
        .filter((c) =>
          c.chain === selectedChain &&
          c.networks.includes(selectedNetwork) &&
          selectedTypes.some((type) => c.trading_types.includes(type))
        )
        .map((c) => c.name);

      setAvailableConnectors(filteredConnectors);

      // Initialize selected connectors if empty
      if (filteredConnectors.length > 0 && selectedConnectors.length === 0) {
        setSelectedConnectors([filteredConnectors[0]]);
      } else {
        // Remove any selected connectors that are no longer available
        const validSelected = selectedConnectors.filter((c) => filteredConnectors.includes(c));
        if (validSelected.length !== selectedConnectors.length) {
          setSelectedConnectors(validSelected.length > 0 ? validSelected : [filteredConnectors[0]]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch connectors:', err);
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to fetch connectors');
    }
  }

  async function fetchPools() {
    try {
      setLoading(true);

      // Fetch pools from all selected connectors
      const poolPromises = selectedConnectors.map(async (connector) => {
        try {
          const data = await gatewayAPI.pools.list(connector, selectedNetwork);
          // Add connector property and filter by selected types
          return data
            .filter((pool) => selectedTypes.includes(pool.type))
            .map((pool) => ({
              ...pool,
              connector,
            }));
        } catch (err) {
          console.error(`Failed to fetch pools for ${connector}:`, err);
          return [];
        }
      });

      const poolResults = await Promise.all(poolPromises);
      const allPools = poolResults.flat();

      setPools(allPools);

      // Select first pool by default or clear if none available
      if (allPools.length > 0 && !selectedPool) {
        setSelectedPool(allPools[0]);
      } else if (allPools.length === 0) {
        setSelectedPool(null);
      }
    } catch (err) {
      console.error('Failed to fetch pools:', err);
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to fetch pools');
      setPools([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPoolInfo() {
    if (!selectedPool) return;

    try {
      // Use connector-specific endpoint for pool info to get full data including bins
      const url = `/connectors/${selectedPool.connector}/clmm/pool-info?network=${selectedNetwork}&poolAddress=${selectedPool.address}`;
      const response = await fetch(`http://localhost:15888${url}`);
      const data = await response.json();
      setPoolInfo(data as PoolInfo);

      // Set fee from pool info (convert to basis points)
      if (data.feePct !== undefined) {
        setFee(String(Math.round(data.feePct * 100)));
      }
    } catch (err) {
      console.error('Failed to fetch pool info:', err);
    }
  }

  async function fetchPositions() {
    if (!selectedPool || !selectedWallet) return;

    try {
      setLoadingPositions(true);
      const chainNetwork = getChainNetwork(selectedChain, selectedNetwork);
      const data = await gatewayAPI.clmm.getPositionsOwned(
        selectedPool.connector,
        chainNetwork,
        selectedWallet
      );
      // Add connector property to each position
      const positionsWithConnector = data.map((position) => ({
        ...position,
        connector: selectedPool.connector,
      }));
      setPositions(positionsWithConnector);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      setPositions([]);
    } finally {
      setLoadingPositions(false);
    }
  }

  async function fetchBalances() {
    if (!selectedWallet) return;

    try {
      const balanceData = await gatewayAPI.chains.getBalances(selectedChain, {
        network: selectedNetwork,
        address: selectedWallet,
      });

      if (balanceData.balances) {
        const balancesMap: Record<string, string> = {};
        Object.entries(balanceData.balances).forEach(([symbol, balance]) => {
          balancesMap[symbol] = String(balance);
        });
        setBalances(balancesMap);
      }
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  }

  function toggleConnector(connector: string) {
    if (selectedConnectors.includes(connector)) {
      // Don't allow deselecting all connectors
      if (selectedConnectors.length > 1) {
        setSelectedConnectors(selectedConnectors.filter((c) => c !== connector));
      }
    } else {
      setSelectedConnectors([...selectedConnectors, connector]);
    }
  }

  function toggleType(type: string) {
    if (selectedTypes.includes(type)) {
      // Don't allow deselecting all types
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter((t) => t !== type));
      }
    } else {
      setSelectedTypes([...selectedTypes, type]);
    }
  }

  async function handleAddLiquidity() {
    if (!selectedPool || !selectedWallet) return;

    try {
      setSubmitting(true);

      await gatewayAPI.clmm.openPosition({
        network: selectedNetwork,
        walletAddress: selectedWallet,
        poolAddress: selectedPool.address,
        baseTokenAmount: parseFloat(amount0),
        quoteTokenAmount: parseFloat(amount1),
        lowerPrice: parseFloat(lowerPrice),
        upperPrice: parseFloat(upperPrice),
      });

      await showSuccessNotification('Liquidity added successfully!');

      // Reset form
      setAmount0('');
      setAmount1('');
      setLowerPrice('');
      setUpperPrice('');

      // Refresh positions
      await fetchPositions();
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to add liquidity');
    } finally {
      setSubmitting(false);
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
        message="Please select a wallet to manage liquidity pools."
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading pools..." />;
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Mobile Dropdown Selectors */}
      <div className="md:hidden border-b p-2 space-y-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Filters: {selectedTypes.map((t) => t.toUpperCase()).join(', ')} • {selectedConnectors.map((c) => capitalize(c)).join(', ')}
          </label>
        </div>

        <Select
          value={selectedPool?.address || ''}
          onValueChange={(value) => {
            const pool = pools.find((p) => p.address === value);
            if (pool) setSelectedPool(pool);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pools.map((pool) => (
              <SelectItem key={pool.address} value={pool.address}>
                {pool.baseSymbol}-{pool.quoteSymbol} • {capitalize(pool.connector || '')} • {pool.type.toUpperCase()} ({pool.feePct}%)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 border-r bg-muted/10 p-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Type Filter */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Type
            </label>
            <Button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              variant="outline"
              className="w-full justify-start"
            >
              {selectedTypes.length === 0
                ? 'Select types...'
                : selectedTypes.map((t) => t.toUpperCase()).join(', ')}
            </Button>
            {showTypeDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded shadow-lg">
                {['clmm', 'amm'].map((type) => (
                  <Button
                    key={type}
                    onClick={() => toggleType(type)}
                    variant="ghost"
                    className="w-full justify-start px-3 py-2 h-auto"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type)}
                      readOnly
                      className="pointer-events-none mr-2"
                    />
                    <span>{type.toUpperCase()}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Connector Filter */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Connector
            </label>
            <Button
              onClick={() => setShowConnectorDropdown(!showConnectorDropdown)}
              variant="outline"
              className="w-full justify-start"
            >
              {selectedConnectors.length === 0
                ? 'Select connectors...'
                : selectedConnectors.map((c) => capitalize(c)).join(', ')}
            </Button>
            {showConnectorDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded shadow-lg max-h-48 overflow-y-auto">
                {availableConnectors.map((conn) => (
                  <Button
                    key={conn}
                    onClick={() => toggleConnector(conn)}
                    variant="ghost"
                    className="w-full justify-start px-3 py-2 h-auto"
                  >
                    <input
                      type="checkbox"
                      checked={selectedConnectors.includes(conn)}
                      readOnly
                      className="pointer-events-none mr-2"
                    />
                    <span>{capitalize(conn)}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Pool List */}
          <div>
            <h3 className="font-semibold text-sm mb-2">
              Pools ({pools.length})
            </h3>
            <div className="max-h-96 overflow-y-auto">
              {pools.map((pool) => (
                <Button
                  key={pool.address}
                  onClick={() => setSelectedPool(pool)}
                  variant={selectedPool?.address === pool.address ? "default" : "ghost"}
                  className="w-full justify-start px-3 py-2 h-auto mb-1"
                >
                  <div className="flex flex-col items-start w-full gap-1">
                    <div className="font-medium">{pool.baseSymbol}-{pool.quoteSymbol}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs">{capitalize(pool.connector || '')}</span>
                      <span className="text-xs">{pool.type.toUpperCase()}</span>
                      <Badge variant="outline" className="text-xs">{pool.feePct}%</Badge>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 md:p-6 space-y-3 md:space-y-6">
          {selectedPool ? (
            <>
              {/* Pool Info */}
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <div className="flex items-start justify-between">
                    <CardTitle>
                      {selectedPool.baseSymbol}-{selectedPool.quoteSymbol} Pool
                    </CardTitle>
                    {(() => {
                      const poolUrl = getPoolUrl({
                        connector: selectedPool.connector,
                        type: selectedPool.type,
                        network: selectedPool.network,
                        poolAddress: selectedPool.address,
                      });
                      return poolUrl ? (
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={poolUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2"
                          >
                            <span>View on {getDexName(selectedPool.connector)}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      ) : null;
                    })()}
                  </div>
                </CardHeader>
                <CardContent className="p-3 md:p-6">
                  <div className="grid grid-cols-2 gap-4 text-xs md:text-sm">
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <p className="font-medium">{selectedPool.type.toUpperCase()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fee:</span>
                      <p className="font-medium">{selectedPool.feePct}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Network:</span>
                      <p className="font-medium">{selectedPool.network}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Connector:</span>
                      <p className="font-medium capitalize">{selectedPool.connector}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fee Tier:</span>
                      <p className="font-medium">{fee || Math.round(selectedPool.feePct * 100)} basis points</p>
                    </div>
                    {poolInfo && poolInfo.binStep !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Bin Step:</span>
                        <p className="font-medium">{poolInfo.binStep}</p>
                      </div>
                    )}
                  </div>

                  {/* Bin Liquidity Chart - for Meteora pools with bins */}
                  {poolInfo && poolInfo.bins && poolInfo.bins.length > 0 && (
                    <div className="mt-6">
                      <PoolBinChart
                        bins={poolInfo.bins}
                        activeBinId={poolInfo.activeBinId}
                        lowerPrice={lowerPrice ? parseFloat(lowerPrice) : undefined}
                        upperPrice={upperPrice ? parseFloat(upperPrice) : undefined}
                      />
                    </div>
                  )}

                  {/* Add Position Collapsible */}
                  <div className="mt-6">
                    <Separator className="mb-4" />
                    <Collapsible open={isAddPositionOpen} onOpenChange={setIsAddPositionOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="flex items-center gap-2">
                          <span>Add Position</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isAddPositionOpen ? 'rotate-180' : ''}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-4">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TokenAmountInput
                              label={selectedPool.baseSymbol}
                              symbol={selectedPool.baseSymbol}
                              amount={amount0}
                              balance={balances[selectedPool.baseSymbol] || '0'}
                              onAmountChange={setAmount0}
                              showMaxButton={true}
                            />
                            <TokenAmountInput
                              label={selectedPool.quoteSymbol}
                              symbol={selectedPool.quoteSymbol}
                              amount={amount1}
                              balance={balances[selectedPool.quoteSymbol] || '0'}
                              onAmountChange={setAmount1}
                              showMaxButton={true}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium">Lower Price</label>
                              <Input
                                type="number"
                                placeholder="0.0"
                                value={lowerPrice}
                                onChange={(e) => setLowerPrice(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Upper Price</label>
                              <Input
                                type="number"
                                placeholder="0.0"
                                value={upperPrice}
                                onChange={(e) => setUpperPrice(e.target.value)}
                              />
                            </div>
                          </div>

                          {/* User Liquidity Distribution Chart */}
                          {poolInfo && poolInfo.bins && poolInfo.bins.length > 0 &&
                           lowerPrice && upperPrice && amount0 && amount1 && (
                            <div className="border rounded-lg p-4">
                              <h4 className="text-sm font-medium mb-2">Your Liquidity Distribution</h4>
                              <UserLiquidityChart
                                poolBins={poolInfo.bins}
                                lowerPrice={parseFloat(lowerPrice)}
                                upperPrice={parseFloat(upperPrice)}
                                userBaseAmount={parseFloat(amount0)}
                                userQuoteAmount={parseFloat(amount1)}
                                baseSymbol={selectedPool.baseSymbol}
                                quoteSymbol={selectedPool.quoteSymbol}
                              />
                            </div>
                          )}

                          <Button
                            onClick={handleAddLiquidity}
                            disabled={
                              submitting ||
                              !amount0 ||
                              !amount1 ||
                              !lowerPrice ||
                              !upperPrice
                            }
                            className="w-full"
                          >
                            {submitting ? 'Adding Position...' : 'Add Position'}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </CardContent>
              </Card>

              {/* Existing Positions */}
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <CardTitle>Your Positions</CardTitle>
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
            </>
          ) : (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground">
                  No CLMM pools available for this network
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
