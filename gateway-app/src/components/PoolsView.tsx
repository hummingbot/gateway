import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { gatewayGet, gatewayPost } from '@/lib/api';
import { useApp } from '@/lib/AppContext';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';

interface Pool {
  type: string;
  network: string;
  baseSymbol: string;
  quoteSymbol: string;
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  connector?: string;
}

interface PoolInfo {
  address: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  feePct: number;
  price: number;
  baseTokenAmount: number;
  quoteTokenAmount: number;
  activeBinId?: number;
  binStep?: number;
  sqrtPriceX64?: string;
  tick?: number;
  liquidity?: string;
}

interface Position {
  tokenId: string;
  liquidity: string;
  lowerPrice: number;
  upperPrice: number;
  amount0: string;
  amount1: string;
  unclaimedToken0?: string;
  unclaimedToken1?: string;
}

interface ConnectorConfig {
  name: string;
  trading_types: string[];
  chain: string;
  networks: string[];
}

export function PoolsView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
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

  // Add liquidity form state
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [lowerPrice, setLowerPrice] = useState('');
  const [upperPrice, setUpperPrice] = useState('');
  const [fee, setFee] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Helper function to capitalize first letter
  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

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
      const data = await gatewayGet<{ connectors: ConnectorConfig[] }>('/config/connectors');

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
          const data = await gatewayGet<Pool[]>(
            `/pools?connector=${connector}&network=${selectedNetwork}`
          );
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
      const chainNetwork = `${selectedChain}-${selectedNetwork}`;
      const data = await gatewayGet<PoolInfo>(
        `/trading/clmm/pool-info?connector=${selectedPool.connector}&chainNetwork=${chainNetwork}&poolAddress=${selectedPool.address}`
      );
      setPoolInfo(data);

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
      const data = await gatewayGet<{ positions: Position[] }>(
        `/trading/clmm/positions-owned?chain=${selectedChain}&network=${selectedNetwork}&connector=${selectedPool.connector}&address=${selectedWallet}`
      );
      setPositions(data.positions || []);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
      setPositions([]);
    } finally {
      setLoadingPositions(false);
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

      await gatewayPost('/trading/clmm/open', {
        chain: selectedChain,
        network: selectedNetwork,
        connector: selectedPool.connector,
        address: selectedWallet,
        poolAddress: selectedPool.address,
        token0: selectedPool.baseTokenAddress,
        token1: selectedPool.quoteTokenAddress,
        amount0: parseFloat(amount0),
        amount1: parseFloat(amount1),
        lowerPrice: parseFloat(lowerPrice),
        upperPrice: parseFloat(upperPrice),
        fee: parseInt(fee),
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

  if (!selectedWallet) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Wallet Selected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please select a wallet to manage liquidity pools.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading pools...</p>
      </div>
    );
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
          onChange={(e) => {
            const pool = pools.find((p) => p.address === e.target.value);
            if (pool) setSelectedPool(pool);
          }}
          className="w-full"
        >
          {pools.map((pool) => (
            <option key={pool.address} value={pool.address}>
              {pool.baseSymbol}-{pool.quoteSymbol} • {capitalize(pool.connector || '')} • {pool.type.toUpperCase()} ({pool.feePct}%)
            </option>
          ))}
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
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="w-full px-3 py-2 text-left text-sm border rounded bg-background hover:bg-accent"
            >
              {selectedTypes.length === 0
                ? 'Select types...'
                : selectedTypes.map((t) => t.toUpperCase()).join(', ')}
            </button>
            {showTypeDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded shadow-lg">
                {['clmm', 'amm'].map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type)}
                      readOnly
                      className="pointer-events-none"
                    />
                    <span>{type.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Connector Filter */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Connector
            </label>
            <button
              onClick={() => setShowConnectorDropdown(!showConnectorDropdown)}
              className="w-full px-3 py-2 text-left text-sm border rounded bg-background hover:bg-accent"
            >
              {selectedConnectors.length === 0
                ? 'Select connectors...'
                : selectedConnectors.map((c) => capitalize(c)).join(', ')}
            </button>
            {showConnectorDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded shadow-lg max-h-48 overflow-y-auto">
                {availableConnectors.map((conn) => (
                  <button
                    key={conn}
                    onClick={() => toggleConnector(conn)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedConnectors.includes(conn)}
                      readOnly
                      className="pointer-events-none"
                    />
                    <span>{capitalize(conn)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pool List */}
          <div>
            <h3 className="font-semibold text-sm mb-2">
              Pools ({pools.length})
            </h3>
            <div className="max-h-96 overflow-y-auto">
              {pools.map((pool) => (
                <button
                  key={pool.address}
                  onClick={() => setSelectedPool(pool)}
                  className={`w-full text-left px-3 py-2 rounded text-sm mb-1 ${
                    selectedPool?.address === pool.address
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  <div>{pool.baseSymbol}-{pool.quoteSymbol}</div>
                  <div className="text-xs opacity-75">
                    {capitalize(pool.connector || '')} • {pool.type.toUpperCase()} • {pool.feePct}%
                  </div>
                </button>
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
                  <CardTitle>
                    {selectedPool.baseSymbol}-{selectedPool.quoteSymbol} Pool
                  </CardTitle>
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
                    {poolInfo && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Price:</span>
                          <p className="font-medium">{poolInfo.price.toFixed(6)}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground mb-2 block">Token Amounts:</span>
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span>{selectedPool.baseSymbol}</span>
                                <span className="font-medium">{poolInfo.baseTokenAmount.toFixed(6)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (poolInfo.baseTokenAmount * poolInfo.price /
                                        (poolInfo.baseTokenAmount * poolInfo.price + poolInfo.quoteTokenAmount)) * 100
                                    ).toFixed(1)}%`
                                  }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Value: ${(poolInfo.baseTokenAmount * poolInfo.price).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span>{selectedPool.quoteSymbol}</span>
                                <span className="font-medium">{poolInfo.quoteTokenAmount.toFixed(6)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      (poolInfo.quoteTokenAmount /
                                        (poolInfo.baseTokenAmount * poolInfo.price + poolInfo.quoteTokenAmount)) * 100
                                    ).toFixed(1)}%`
                                  }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Value: ${poolInfo.quoteTokenAmount.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                        {poolInfo.activeBinId !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Active Bin ID:</span>
                            <p className="font-medium">{poolInfo.activeBinId}</p>
                          </div>
                        )}
                        {poolInfo.binStep !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Bin Step:</span>
                            <p className="font-medium">{poolInfo.binStep}</p>
                          </div>
                        )}
                        {poolInfo.tick !== undefined && (
                          <div>
                            <span className="text-muted-foreground">Tick:</span>
                            <p className="font-medium">{poolInfo.tick}</p>
                          </div>
                        )}
                        {poolInfo.liquidity && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Liquidity:</span>
                            <p className="font-medium font-mono text-xs">{poolInfo.liquidity}</p>
                          </div>
                        )}
                      </>
                    )}
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
                      {positions.map((position) => (
                        <div key={position.tokenId} className="border rounded p-3 text-xs md:text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-muted-foreground">Token ID:</span>
                              <p className="font-mono text-xs">{position.tokenId}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Liquidity:</span>
                              <p className="font-medium">{position.liquidity}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Price Range:</span>
                              <p className="font-medium">
                                {position.lowerPrice} - {position.upperPrice}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Amounts:</span>
                              <p className="font-medium">
                                {position.amount0} / {position.amount1}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Add Liquidity */}
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <CardTitle>Add Liquidity</CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs md:text-sm font-medium">
                          {selectedPool.baseSymbol} Amount
                        </label>
                        <Input
                          type="number"
                          placeholder="0.0"
                          value={amount0}
                          onChange={(e) => setAmount0(e.target.value)}
                          className="text-xs md:text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs md:text-sm font-medium">
                          {selectedPool.quoteSymbol} Amount
                        </label>
                        <Input
                          type="number"
                          placeholder="0.0"
                          value={amount1}
                          onChange={(e) => setAmount1(e.target.value)}
                          className="text-xs md:text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs md:text-sm font-medium">Lower Price</label>
                        <Input
                          type="number"
                          placeholder="0.0"
                          value={lowerPrice}
                          onChange={(e) => setLowerPrice(e.target.value)}
                          className="text-xs md:text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs md:text-sm font-medium">Upper Price</label>
                        <Input
                          type="number"
                          placeholder="0.0"
                          value={upperPrice}
                          onChange={(e) => setUpperPrice(e.target.value)}
                          className="text-xs md:text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs md:text-sm font-medium">Fee Tier (basis points)</label>
                      <Input
                        type="number"
                        placeholder="e.g. 3000 for 0.3%"
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                        className="text-xs md:text-sm"
                      />
                    </div>

                    <Button
                      onClick={handleAddLiquidity}
                      disabled={
                        submitting ||
                        !amount0 ||
                        !amount1 ||
                        !lowerPrice ||
                        !upperPrice ||
                        !fee
                      }
                      className="w-full"
                    >
                      {submitting ? 'Adding Liquidity...' : 'Add Liquidity'}
                    </Button>
                  </div>
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
