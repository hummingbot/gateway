import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { ConfirmModal } from './ConfirmModal';
import { AddPoolModal } from './AddPoolModal';
import { LiquidityPositionCard } from './LiquidityPositionCard';
import { PoolBinChart } from './PoolBinChart';
import { UserLiquidityChart } from './UserLiquidityChart';
import { TokenAmountInput } from './TokenAmountInput';
import { PoolDetailsModal } from './PoolDetailsModal';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { useApp } from '@/lib/AppContext';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import type {
  PoolTemplate,
  ExtendedPoolInfo as PoolInfo,
  ConnectorConfig,
  PositionWithConnector as Position,
} from '@/lib/gateway-types';
import { capitalize, getChainNetwork, shortenAddress } from '@/lib/utils/string';
import { formatTokenAmount, formatNumber } from '@/lib/utils/format';
import { getPoolUrl, getDexName } from '@/lib/pool-urls';
import { openExternalUrl } from '@/lib/utils/external-link';
import { getCachedPoolInfo, setCachedPoolInfo } from '@/lib/pool-cache';
import { ExternalLink, ChevronDown, Plus } from 'lucide-react';

// UI-specific Pool type with connector property added
interface Pool extends PoolTemplate {
  connector: string;
}

export function PoolsView() {
  const { selectedChain, selectedNetwork, selectedWallet, gatewayAvailable } = useApp();
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isAddPositionOpen, setIsAddPositionOpen] = useState(false);
  const [showAddPool, setShowAddPool] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);

  // Add liquidity form state
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [lowerPrice, setLowerPrice] = useState('');
  const [upperPrice, setUpperPrice] = useState('');
  const [fee, setFee] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [balances, setBalances] = useState<Record<string, string>>({});

  // Confirmation modal state
  const [showAddPositionConfirm, setShowAddPositionConfirm] = useState(false);
  const [positionToCollectFees, setPositionToCollectFees] = useState<Position | null>(null);
  const [positionToClose, setPositionToClose] = useState<Position | null>(null);
  const [showPoolDetails, setShowPoolDetails] = useState(false);

  // Helper to get current price from poolInfo
  const getCurrentPrice = (): number | null => {
    if (!poolInfo || !poolInfo.bins || !poolInfo.activeBinId) return null;
    const activeBin = poolInfo.bins.find(b => b.binId === poolInfo.activeBinId);
    return activeBin ? activeBin.price : null;
  };

  // Handle lower/min price change
  const handleMinPriceChange = (value: string) => {
    setLowerPrice(value);
  };

  // Handle upper/max price change
  const handleMaxPriceChange = (value: string) => {
    setUpperPrice(value);
  };

  // Adjust both prices by percentage (negative for min, positive for max)
  const adjustBothPrices = (percentage: number) => {
    const currentPrice = getCurrentPrice();
    if (currentPrice) {
      // Divide by 2 since position width is on both sides of current price
      const halfPercentage = percentage / 2;
      const minPrice = currentPrice * (1 - halfPercentage / 100);
      const maxPrice = currentPrice * (1 + halfPercentage / 100);
      setLowerPrice(minPrice.toFixed(6));
      setUpperPrice(maxPrice.toFixed(6));
    }
  };

  // Reset prices
  const resetPrices = () => {
    setLowerPrice('');
    setUpperPrice('');
  };

  // Fetch available connectors when chain/network/types change
  useEffect(() => {
    fetchAvailableConnectors();
    loadNetworks();
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

  // Handle address from URL parameter
  useEffect(() => {
    if (address && pools.length > 0) {
      const pool = pools.find((p) => p.address === address);
      if (pool && pool.address !== selectedPool?.address) {
        setSelectedPool(pool);
      }
    }
  }, [address, pools]);

  // Clear Add Position form when pool changes
  useEffect(() => {
    if (selectedPool) {
      setAmount0('');
      setAmount1('');
      setLowerPrice('');
      setUpperPrice('');
    }
  }, [selectedPool?.address]);

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
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to fetch pools');
      setPools([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPoolInfo() {
    if (!selectedPool) return;

    try {
      // Check cache first
      const cached = getCachedPoolInfo(
        selectedChain,
        selectedNetwork,
        selectedPool.connector,
        selectedPool.address
      );

      if (cached) {
        setPoolInfo(cached);
        // Set fee from cached pool info (convert to basis points)
        if (cached.feePct !== undefined) {
          setFee(String(Math.round(cached.feePct * 100)));
        }
        return;
      }

      // Use connector-specific endpoint for pool info to get full data including bins
      const url = `/connectors/${selectedPool.connector}/clmm/pool-info?network=${selectedNetwork}&poolAddress=${selectedPool.address}`;
      const response = await fetch(`http://localhost:15888${url}`);
      const data = await response.json();
      setPoolInfo(data as PoolInfo);

      // Cache the fetched pool info
      setCachedPoolInfo(
        selectedChain,
        selectedNetwork,
        selectedPool.connector,
        selectedPool.address,
        data as PoolInfo
      );

      // Set fee from pool info (convert to basis points)
      if (data.feePct !== undefined) {
        setFee(String(Math.round(data.feePct * 100)));
      }
    } catch (err) {
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
    }
  }

  async function loadNetworks() {
    const configData = await gatewayAPI.config.getChains();
    const chainData = configData.chains?.find((c) => c.chain === selectedChain);
    if (chainData?.networks) {
      setAvailableNetworks(chainData.networks);
    }
  }

  async function handleAddPool(chain: string, network: string, address: string) {
    const chainNetwork = `${chain}-${network}`;
    const response = await gatewayAPI.pools.save(address, chainNetwork);
    await fetchPools();
    await showSuccessNotification(`Pool added successfully!`);
  }

  async function handleDeletePool(pool: PoolTemplate) {
    try {
      await gatewayAPI.pools.delete(pool.address);
      await showSuccessNotification(`Pool ${pool.baseSymbol}-${pool.quoteSymbol} deleted successfully!`);

      // Refresh pools list
      await fetchPools();

      // If we deleted the selected pool, clear selection
      if (selectedPool?.address === pool.address) {
        setSelectedPool(null);
      }
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to delete pool');
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

      await showSuccessNotification('Position opened successfully!');

      // Reset form
      setAmount0('');
      setAmount1('');
      setLowerPrice('');
      setUpperPrice('');
      setShowAddPositionConfirm(false);

      // Refresh positions
      await fetchPositions();
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to open position');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCollectFees() {
    if (!positionToCollectFees || !selectedWallet) return;

    try {
      setSubmitting(true);

      const chainNetwork = getChainNetwork(selectedChain, selectedNetwork);
      await gatewayAPI.trading.collectFees({
        connector: positionToCollectFees.connector,
        chainNetwork,
        walletAddress: selectedWallet,
        positionAddress: positionToCollectFees.address,
      });

      await showSuccessNotification('Fees collected successfully!');
      setPositionToCollectFees(null);

      // Refresh positions
      await fetchPositions();
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to collect fees');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClosePosition() {
    if (!positionToClose || !selectedWallet) return;

    try {
      setSubmitting(true);

      const chainNetwork = getChainNetwork(selectedChain, selectedNetwork);
      await gatewayAPI.trading.closePosition({
        connector: positionToClose.connector,
        chainNetwork,
        walletAddress: selectedWallet,
        positionAddress: positionToClose.address,
      });

      await showSuccessNotification('Position closed successfully!');
      setPositionToClose(null);

      // Refresh positions
      await fetchPositions();
    } catch (err) {
      await showErrorNotification(err instanceof Error ? err.message : 'Failed to close position');
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
      {/* Mobile Filters and Pool Selector */}
      <div className="md:hidden border-b">
        {/* Filter Toggle */}
        <div className="p-2 border-b">
          <Button
            variant="ghost"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full justify-between h-auto py-2"
          >
            <span className="text-sm font-medium">
              Filters
              {(selectedTypes.length > 0 || selectedConnectors.length > 0) && (
                <span className="ml-2 text-muted-foreground font-normal">
                  ({selectedTypes.map((t) => t.toUpperCase()).join(', ')}
                  {selectedTypes.length > 0 && selectedConnectors.length > 0 ? ', ' : ''}
                  {selectedConnectors.map((c) => capitalize(c)).join(', ')})
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Collapsible Filter Section */}
        {showMobileFilters && (
          <div className="p-3 space-y-3 border-b bg-muted/10">
            {/* Type Filter */}
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Type
              </label>
              <Button
                onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                variant="outline"
                className="w-full justify-start h-9 text-xs"
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
                      className="w-full justify-start px-3 py-2 h-auto text-xs"
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
                className="w-full justify-start h-9 text-xs"
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
                      className="w-full justify-start px-3 py-2 h-auto text-xs"
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
          </div>
        )}

        {/* Pool Selector */}
        <div className="p-2">
          <Select
            value={selectedPool?.address || ''}
            onValueChange={(value) => {
              const pool = pools.find((p) => p.address === value);
              if (pool) {
                setSelectedPool(pool);
                navigate(`/pools/${pool.address}`);
              }
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
                  onClick={() => {
                    setSelectedPool(pool);
                    navigate(`/pools/${pool.address}`);
                  }}
                  variant={selectedPool?.address === pool.address ? "default" : "ghost"}
                  className="w-full justify-start px-3 py-2 h-auto mb-1"
                >
                  <div className="flex flex-col items-start w-full gap-1">
                    <div className="font-medium">{pool.baseSymbol}-{pool.quoteSymbol}</div>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span>
                        {capitalize(pool.connector || '')} {pool.type.toUpperCase()}
                      </span>
                      <Badge variant="outline" className="text-xs">{pool.feePct}%</Badge>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
            <Button
              onClick={() => setShowAddPool(true)}
              variant="outline"
              size="sm"
              className="w-full mt-2"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Pool
            </Button>
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
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <CardTitle>
                        {selectedPool.baseSymbol}-{selectedPool.quoteSymbol}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <span>
                          {capitalize(selectedPool.connector)} {selectedPool.type.toUpperCase()}
                        </span>
                        <Badge>
                          {selectedPool.feePct}%
                        </Badge>
                        {poolInfo && poolInfo.binStep !== undefined && (
                          <Badge variant="secondary">
                            Bin Step: {poolInfo.binStep}
                          </Badge>
                        )}
                      </div>
                      {poolInfo && (
                        <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Total {selectedPool.baseSymbol}:</span>{' '}
                            {poolInfo.baseTokenAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                            })}
                          </div>
                          <Separator orientation="vertical" className="hidden md:block h-4 self-center" />
                          <div>
                            <span className="font-medium">Total {selectedPool.quoteSymbol}:</span>{' '}
                            {poolInfo.quoteTokenAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4,
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPoolDetails(true)}
                      >
                        Pool Details
                      </Button>
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
                            onClick={() => openExternalUrl(poolUrl)}
                            className="flex items-center gap-2"
                          >
                            <span>View on {getDexName(selectedPool.connector)}</span>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 md:p-6">
                  {/* Bin Liquidity Chart - for Meteora pools with bins */}
                  {poolInfo && poolInfo.bins && poolInfo.bins.length > 0 && (
                    <div>
                      <PoolBinChart
                        bins={poolInfo.bins}
                        activeBinId={poolInfo.activeBinId}
                        lowerPrice={lowerPrice ? parseFloat(lowerPrice) : undefined}
                        upperPrice={upperPrice ? parseFloat(upperPrice) : undefined}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Add Position Card */}
              <Card>
                <Collapsible open={isAddPositionOpen} onOpenChange={setIsAddPositionOpen}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="p-3 md:p-6 cursor-pointer hover:bg-accent/50 rounded-t-lg">
                      <div className="flex items-center justify-between">
                        <CardTitle>Add Position</CardTitle>
                        <ChevronDown className={`h-5 w-5 transition-transform ${isAddPositionOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="p-3 md:p-6 pt-0">
                      <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TokenAmountInput
                              label={selectedPool.baseSymbol}
                              symbol={selectedPool.baseSymbol}
                              amount={amount0}
                              balance={balances[selectedPool.baseSymbol] || '0'}
                              onAmountChange={setAmount0}
                            />
                            <TokenAmountInput
                              label={selectedPool.quoteSymbol}
                              symbol={selectedPool.quoteSymbol}
                              amount={amount1}
                              balance={balances[selectedPool.quoteSymbol] || '0'}
                              onAmountChange={setAmount1}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Min Price</label>
                              <Input
                                type="number"
                                placeholder="0.0"
                                value={lowerPrice}
                                onChange={(e) => handleMinPriceChange(e.target.value)}
                                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Max Price</label>
                              <Input
                                type="number"
                                placeholder="0.0"
                                value={upperPrice}
                                onChange={(e) => handleMaxPriceChange(e.target.value)}
                                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </div>

                          <div className="flex justify-center items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Position Width</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => adjustBothPrices(1)}
                              className="text-xs h-7 px-2"
                            >
                              1%
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => adjustBothPrices(10)}
                              className="text-xs h-7 px-2"
                            >
                              10%
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => adjustBothPrices(20)}
                              className="text-xs h-7 px-2"
                            >
                              20%
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => adjustBothPrices(50)}
                              className="text-xs h-7 px-2"
                            >
                              50%
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={resetPrices}
                              className="text-xs h-7 px-2"
                            >
                              Reset
                            </Button>
                          </div>

                          {/* User Liquidity Distribution Chart */}
                          {poolInfo && poolInfo.bins && poolInfo.bins.length > 0 &&
                           lowerPrice && upperPrice && amount0 && amount1 && (
                            <div className="border rounded-lg p-4">
                              <h4 className="text-sm font-medium mb-2">Your Liquidity Distribution</h4>
                              <UserLiquidityChart
                                poolBins={poolInfo.bins}
                                activeBinId={poolInfo.activeBinId}
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
                            onClick={() => setShowAddPositionConfirm(true)}
                            disabled={
                              submitting ||
                              !amount0 ||
                              !amount1 ||
                              !lowerPrice ||
                              !upperPrice
                            }
                            className="w-full"
                          >
                            Add Position
                          </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              {/* Existing Positions - Only show if there are positions for this pool */}
              {(() => {
                const poolPositions = positions.filter(p => p.poolAddress === selectedPool.address);
                return !loadingPositions && poolPositions.length > 0 && (
                  <Card>
                    <CardHeader className="p-3 md:p-6">
                      <CardTitle>Your Positions</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 md:p-6">
                      <div className="space-y-3">
                        {poolPositions.map((position, i) => (
                          <LiquidityPositionCard
                            key={i}
                            position={position}
                            baseSymbol={selectedPool?.baseSymbol}
                            quoteSymbol={selectedPool?.quoteSymbol}
                            onCollectFees={setPositionToCollectFees}
                            onClosePosition={setPositionToClose}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
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

      {/* Add Position Confirmation Modal */}
      <ConfirmModal
        open={showAddPositionConfirm && !!selectedPool}
        onOpenChange={(open) => {
          if (!open) setShowAddPositionConfirm(false);
        }}
        title="Add Position"
        description={selectedPool ? `Are you sure you want to open a new position in ${selectedPool.baseSymbol}/${selectedPool.quoteSymbol} pool with ${amount0} ${selectedPool.baseSymbol} and ${amount1} ${selectedPool.quoteSymbol}?` : ''}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleAddLiquidity}
        loading={submitting}
      />

      {/* Collect Fees Confirmation Modal */}
      <ConfirmModal
        open={!!positionToCollectFees}
        onOpenChange={(open) => {
          if (!open) setPositionToCollectFees(null);
        }}
        title="Collect Fees"
        description="Are you sure you want to collect fees from this position? This will claim all uncollected fees."
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleCollectFees}
        loading={submitting}
      />

      {/* Close Position Confirmation Modal */}
      <ConfirmModal
        open={!!positionToClose}
        onOpenChange={(open) => {
          if (!open) setPositionToClose(null);
        }}
        title="Close Position"
        description="Are you sure you want to close this position? This will remove all liquidity and collect any unclaimed fees. This action cannot be undone."
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleClosePosition}
        destructive={true}
        loading={submitting}
      />

      {/* Add Pool Modal */}
      <AddPoolModal
        open={showAddPool}
        onOpenChange={setShowAddPool}
        onAddPool={handleAddPool}
        defaultChain={selectedChain}
        defaultNetwork={selectedNetwork}
        availableNetworks={availableNetworks}
      />

      {/* Pool Details Modal */}
      <PoolDetailsModal
        open={showPoolDetails}
        onOpenChange={setShowPoolDetails}
        pool={selectedPool}
        onDeletePool={handleDeletePool}
      />
    </div>
  );
}
