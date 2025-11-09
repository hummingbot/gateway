import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { gatewayGet, gatewayPost } from '@/lib/api';

interface ChainData {
  chain: string;
  networks: string[];
  defaultNetwork: string;
}

interface ConnectorData {
  name: string;
  trading_types: string[];
  chain: string;
  networks: string[];
}

export function ConfigView() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [config, setConfig] = useState<Record<string, any>>({});
  const [originalConfig, setOriginalConfig] = useState<Record<string, any>>({});
  const [allConfigs, setAllConfigs] = useState<Record<string, any>>({});
  const [chains, setChains] = useState<ChainData[]>([]);
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadNamespacesAndConfig();
  }, []);

  useEffect(() => {
    if (selectedNamespace && allConfigs[selectedNamespace]) {
      loadNamespaceConfig(selectedNamespace);
    }
  }, [selectedNamespace]);

  async function loadNamespacesAndConfig() {
    try {
      setLoading(true);

      // Load chains, connectors, and namespaces in parallel
      const [chainsData, connectorsData, namespacesData, configData] = await Promise.all([
        gatewayGet<{ chains: ChainData[] }>('/config/chains'),
        gatewayGet<{ connectors: ConnectorData[] }>('/config/connectors'),
        gatewayGet<{ namespaces: string[] }>('/config/namespaces'),
        gatewayGet<any>('/config'),
      ]);

      setChains(chainsData.chains);
      setConnectors(connectorsData.connectors);

      // Sort namespaces
      const sortedNamespaces = namespacesData.namespaces.sort();
      setNamespaces(sortedNamespaces);
      setAllConfigs(configData);

      // Set initial namespace - default to 'server'
      if (sortedNamespaces.length > 0) {
        const initialNamespace = sortedNamespaces.find(ns => ns === 'server') || sortedNamespaces[0];
        setSelectedNamespace(initialNamespace);
      }
    } catch (err) {
      setError('Failed to load configuration: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  function loadNamespaceConfig(namespace: string) {
    const namespaceConfig = allConfigs[namespace] || {};

    // Flatten cache object for helius and infura
    let flattenedConfig = { ...namespaceConfig };
    if ((namespace === 'helius' || namespace === 'infura') && namespaceConfig.cache) {
      const { cache, ...rest } = namespaceConfig;
      flattenedConfig = {
        ...rest,
        'cache.enabled': cache.enabled,
        'cache.trackBalances': cache.trackBalances,
        'cache.trackPositions': cache.trackPositions,
        'cache.trackPools': cache.trackPools,
        'cache.refreshInterval': cache.refreshInterval,
        'cache.maxAge': cache.maxAge,
        'cache.ttl': cache.ttl,
      };
    }

    setConfig(flattenedConfig);
    setOriginalConfig(JSON.parse(JSON.stringify(flattenedConfig)));
    setError(null);
    setSuccessMessage(null);
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Reconstruct nested cache object for helius and infura
      let saveConfig = { ...config };
      if (selectedNamespace === 'helius' || selectedNamespace === 'infura') {
        const cacheKeys = Object.keys(config).filter(k => k.startsWith('cache.'));
        if (cacheKeys.length > 0) {
          const cache: any = {};
          const nonCacheConfig: any = {};

          Object.entries(config).forEach(([key, value]) => {
            if (key.startsWith('cache.')) {
              const cacheKey = key.replace('cache.', '');
              cache[cacheKey] = value;
            } else {
              nonCacheConfig[key] = value;
            }
          });

          saveConfig = {
            ...nonCacheConfig,
            cache,
          };
        }
      }

      await gatewayPost('/config/update', {
        [selectedNamespace]: saveConfig,
      });

      // Update originalConfig to new saved state
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      setSuccessMessage('Configuration saved successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Failed to save config: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setConfig(JSON.parse(JSON.stringify(originalConfig)));
    setSuccessMessage(null);
    setError(null);
  }

  function handleFieldChange(key: string, value: any) {
    setConfig(prev => ({
      ...prev,
      [key]: value,
    }));
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  // Group namespaces by category using API data
  const chainNames = chains.map(c => c.chain);
  const connectorNames = connectors.map(c => c.name);

  const solanaNetworks = namespaces.filter(ns => ns.startsWith('solana-'));
  const ethereumNetworks = namespaces.filter(ns => ns.startsWith('ethereum-'));
  const connectorNamespaces = namespaces.filter(ns => connectorNames.includes(ns));
  const providerNamespaces = namespaces.filter(ns => ['helius', 'infura'].includes(ns));
  const chainNamespaces = namespaces.filter(ns => chainNames.includes(ns));
  const otherNamespaces = namespaces.filter(ns =>
    !ns.startsWith('solana-') &&
    !ns.startsWith('ethereum-') &&
    !connectorNames.includes(ns) &&
    !['helius', 'infura'].includes(ns) &&
    !chainNames.includes(ns)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Namespace List */}
      <div className="w-64 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Namespaces</h2>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Server (Other) */}
          {otherNamespaces.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                Server
              </div>
              {otherNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors ${
                    selectedNamespace === ns ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}

          {/* RPC Providers */}
          {providerNamespaces.length > 0 && (
            <div className="mt-4">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                RPC Providers
              </div>
              {providerNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors ${
                    selectedNamespace === ns ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}

          {/* Chains */}
          {chainNamespaces.length > 0 && (
            <div className="mt-4">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                Chains
              </div>
              {chainNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors ${
                    selectedNamespace === ns ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}

          {/* Solana Networks */}
          {solanaNetworks.length > 0 && (
            <div className="mt-4">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                Solana Networks
              </div>
              {solanaNetworks.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors ${
                    selectedNamespace === ns ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {ns.replace('solana-', '')}
                </button>
              ))}
            </div>
          )}

          {/* Ethereum Networks */}
          {ethereumNetworks.length > 0 && (
            <div className="mt-4">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                Ethereum Networks
              </div>
              {ethereumNetworks.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors ${
                    selectedNamespace === ns ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {ns.replace('ethereum-', '')}
                </button>
              ))}
            </div>
          )}

          {/* Connectors */}
          {connectorNamespaces.length > 0 && (
            <div className="mt-4">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">
                Connectors
              </div>
              {connectorNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-accent transition-colors ${
                    selectedNamespace === ns ? 'bg-accent font-medium' : ''
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6 space-y-6">{selectedNamespace && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-mono">{selectedNamespace}</CardTitle>
            </CardHeader>
          </Card>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg">
              <p className="text-green-500 text-sm">{successMessage}</p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Configuration Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.keys(config).length === 0 ? (
                <p className="text-muted-foreground">No configuration found for this namespace.</p>
              ) : (
                <>
                  {Object.entries(config).map(([key, value]) => (
                    <div key={key}>
                      <label className="text-sm font-medium">{key}</label>
                      <Input
                        type={typeof value === 'number' ? 'number' : 'text'}
                        value={value?.toString() || ''}
                        onChange={(e) => {
                          const newValue = typeof value === 'number'
                            ? parseFloat(e.target.value) || 0
                            : e.target.value;
                          handleFieldChange(key, newValue);
                        }}
                        className="mt-1"
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className="flex-1"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      disabled={!hasChanges || saving}
                      className="flex-1"
                    >
                      Reset
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </div>
  );
}
