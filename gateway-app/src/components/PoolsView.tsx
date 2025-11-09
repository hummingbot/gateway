import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { gatewayGet, gatewayPost } from '@/lib/api';
import { useApp } from '@/lib/AppContext';

interface Pool {
  address: string;
  baseToken: string;
  quoteToken: string;
  connector: string;
  type: 'amm' | 'clmm';
  feePct: number;
  tvl?: number;
  price?: number;
}

export function PoolsView() {
  const { selectedNetwork } = useApp();
  const [connector, setConnector] = useState('raydium');
  const [poolType, setPoolType] = useState<'amm' | 'clmm'>('clmm');
  const [tokenA, setTokenA] = useState('SOL');
  const [tokenB, setTokenB] = useState('USDC');
  const [searchResults, setSearchResults] = useState<Pool[]>([]);
  const [savedPools, setSavedPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    try {
      setLoading(true);
      setError(null);

      // Search for pools using the pools API
      const results = await gatewayGet<any>(
        `/pools/find?connector=${connector}&network=${selectedNetwork}&baseToken=${tokenA}&quoteToken=${tokenB}&type=${poolType}`
      );

      setSearchResults(results.pools || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search pools');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPool(pool: Pool) {
    try {
      await gatewayPost('/pools', {
        connector: pool.connector,
        type: pool.type,
        network: selectedNetwork,
        address: pool.address,
      });

      setSavedPools([...savedPools, pool]);
      alert('Pool added successfully!');
    } catch (err) {
      alert('Failed to add pool: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  async function loadSavedPools() {
    try {
      setLoading(true);
      const data = await gatewayGet<any>(
        `/pools/list?connector=${connector}&network=${selectedNetwork}`
      );
      setSavedPools(data.pools || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved pools');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Tabs value="find" onValueChange={() => {}}>
        <TabsList>
          <TabsTrigger value="find">Find Pools</TabsTrigger>
          <TabsTrigger value="saved" onClick={loadSavedPools}>
            Saved Pools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="find">
          {/* Search Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Find Pools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Connector</label>
                  <Select
                    value={connector}
                    onChange={(e) => setConnector(e.target.value)}
                  >
                    <option value="raydium">Raydium</option>
                    <option value="meteora">Meteora</option>
                    <option value="pancakeswap-sol">PancakeSwap</option>
                    <option value="uniswap">Uniswap</option>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={poolType}
                    onChange={(e) => setPoolType(e.target.value as 'amm' | 'clmm')}
                  >
                    <option value="clmm">CLMM</option>
                    <option value="amm">AMM</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Token A</label>
                  <Input
                    value={tokenA}
                    onChange={(e) => setTokenA(e.target.value)}
                    placeholder="SOL"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Token B</label>
                  <Input
                    value={tokenB}
                    onChange={(e) => setTokenB(e.target.value)}
                    placeholder="USDC"
                  />
                </div>
              </div>

              <Button onClick={handleSearch} disabled={loading} className="w-full">
                {loading ? 'Searching...' : 'Search Pools'}
              </Button>

              {error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Search Results ({searchResults.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {searchResults.map((pool, i) => (
                  <Card key={i}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">
                            {pool.baseToken} / {pool.quoteToken}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {pool.connector} {pool.type.toUpperCase()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Fee: {pool.feePct}%
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {pool.address.slice(0, 8)}...{pool.address.slice(-6)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddPool(pool)}
                        >
                          + Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="saved">
          <Card>
            <CardHeader>
              <CardTitle>Saved Pools ({savedPools.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {savedPools.length === 0 ? (
                <p className="text-muted-foreground">
                  No saved pools. Search and add pools from the Find Pools tab.
                </p>
              ) : (
                savedPools.map((pool, i) => (
                  <Card key={i}>
                    <CardContent className="pt-6">
                      <div>
                        <h4 className="font-semibold">
                          {pool.baseToken} / {pool.quoteToken}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {pool.connector} {pool.type.toUpperCase()} • Fee: {pool.feePct}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {pool.address}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
