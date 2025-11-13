import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { gatewayGet, gatewayPost } from '@/lib/api';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';

interface ConfigItem {
  namespace: string;
  path: string;
  value: any;
  type: 'string' | 'number' | 'boolean';
}

interface ChainData {
  chain: string;
  networks: string[];
  defaultNetwork: string;
}

export function ConfigView() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [configItems, setConfigItems] = useState<ConfigItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [chains, setChains] = useState<ChainData[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedNamespace) {
      loadConfig();
    }
  }, [selectedNamespace]);

  async function loadData() {
    try {
      setLoading(true);

      const [namespacesData, chainsData] = await Promise.all([
        gatewayGet<{ namespaces: string[] }>('/config/namespaces'),
        gatewayGet<{ chains: ChainData[] }>('/config/chains'),
      ]);

      const sorted = namespacesData.namespaces.sort();
      setNamespaces(sorted);
      setChains(chainsData.chains);

      // Default to 'server' or first namespace
      const initial = sorted.find(ns => ns === 'server') || sorted[0];
      if (initial) setSelectedNamespace(initial);
    } catch (err) {
      await showErrorNotification('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }

  async function loadConfig() {
    try {
      setLoading(true);
      const allConfigs = await gatewayGet<Record<string, any>>('/config');
      const namespaceConfig = allConfigs[selectedNamespace] || {};

      // Convert config object to flat list of items
      const items: ConfigItem[] = [];

      function flattenConfig(obj: any, parentPath = '') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = parentPath ? `${parentPath}.${key}` : key;

          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            // Recursively flatten nested objects
            flattenConfig(value, currentPath);
          } else {
            // Add leaf value
            items.push({
              namespace: selectedNamespace,
              path: currentPath,
              value,
              type: typeof value as 'string' | 'number' | 'boolean',
            });
          }
        }
      }

      flattenConfig(namespaceConfig);
      setConfigItems(items);
    } catch (err) {
      await showErrorNotification('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: ConfigItem) {
    setEditingKey(`${item.namespace}.${item.path}`);
    setEditValue(item.value);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue('');
  }

  async function saveEdit(item: ConfigItem) {
    try {
      setSaving(true);

      await gatewayPost('/config/update', {
        namespace: item.namespace,
        path: item.path,
        value: editValue,
      });

      await showSuccessNotification(`Updated ${item.path}`);

      // Reload config to get updated value
      await loadConfig();
      setEditingKey(null);
      setEditValue('');
    } catch (err) {
      await showErrorNotification(
        err instanceof Error ? err.message : 'Failed to update configuration'
      );
    } finally {
      setSaving(false);
    }
  }

  // Group namespaces dynamically using chains data
  const serverNamespaces = namespaces.filter(ns => ns === 'server');
  const rpcNamespaces = namespaces.filter(ns => ['helius', 'infura'].includes(ns));

  // Build chain network groups from chains data
  const chainNetworks = chains.map(chainData => {
    const baseConfig = namespaces.find(ns => ns === chainData.chain);
    const networkNamespaces = chainData.networks
      .map(network => `${chainData.chain}-${network}`)
      .filter(ns => namespaces.includes(ns));

    return {
      chain: chainData.chain,
      baseConfig,
      networks: networkNamespaces
    };
  });

  // Get all chain namespaces for filtering
  const allChainNamespaces = new Set([
    ...chains.map(c => c.chain),
    ...chains.flatMap(c => c.networks.map(n => `${c.chain}-${n}`))
  ]);

  const connectorNamespaces = namespaces.filter(
    ns => {
      // Not server or RPC
      if (ns === 'server' || ['helius', 'infura'].includes(ns)) return false;

      // Not a chain or chain-network
      if (allChainNamespaces.has(ns)) return false;

      return true;
    }
  );

  if (loading && !selectedNamespace) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r bg-muted/10 p-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Server */}
          {serverNamespaces.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Server</h3>
              {serverNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedNamespace === ns
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}

          {/* RPC Providers */}
          {rpcNamespaces.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">RPC Providers</h3>
              {rpcNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedNamespace === ns
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}

          {/* Chain Networks - dynamically generated */}
          {chainNetworks.map(({ chain, baseConfig, networks }) => (
            (baseConfig || networks.length > 0) && (
              <div key={chain}>
                <h3 className="font-semibold text-sm mb-2 capitalize">
                  {chain}
                </h3>
                {baseConfig && (
                  <button
                    onClick={() => setSelectedNamespace(baseConfig)}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      selectedNamespace === baseConfig
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    {chain}
                  </button>
                )}
                {networks.map((ns) => (
                  <button
                    key={ns}
                    onClick={() => setSelectedNamespace(ns)}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      selectedNamespace === ns
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    {ns}
                  </button>
                ))}
              </div>
            )
          ))}

          {/* Connectors */}
          {connectorNamespaces.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Connectors</h3>
              {connectorNamespaces.map((ns) => (
                <button
                  key={ns}
                  onClick={() => setSelectedNamespace(ns)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedNamespace === ns
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>{selectedNamespace}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : configItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No configuration items found
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Setting</th>
                      <th className="text-right py-2">Value</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {configItems.map((item, i) => {
                      const key = `${item.namespace}.${item.path}`;
                      const isEditing = editingKey === key;

                      return (
                        <tr
                          key={key}
                          className="border-b"
                          onMouseEnter={() => setHoveredRow(i)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          <td className="py-2">
                            {item.path}
                          </td>
                          <td className="py-2 text-right">
                            {isEditing ? (
                              <div className="flex gap-2 justify-end">
                                {item.type === 'boolean' ? (
                                  <Select
                                    value={String(editValue)}
                                    onChange={(e) => setEditValue(e.target.value === 'true')}
                                    className="w-32"
                                  >
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                  </Select>
                                ) : (
                                  <Input
                                    type={item.type === 'number' ? 'number' : 'text'}
                                    value={editValue}
                                    onChange={(e) => {
                                      const val = item.type === 'number'
                                        ? Number(e.target.value)
                                        : e.target.value;
                                      setEditValue(val);
                                    }}
                                    className="w-64 text-right"
                                    disabled={saving}
                                  />
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                {typeof item.value === 'boolean'
                                  ? (item.value ? 'true' : 'false')
                                  : String(item.value)}
                              </span>
                            )}
                          </td>
                          <td className="text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => saveEdit(item)}
                                  disabled={saving}
                                  className="text-green-600 hover:text-green-800 p-1"
                                  title="Save"
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
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  className="text-red-600 hover:text-red-800 p-1"
                                  title="Cancel"
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
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              hoveredRow === i && (
                                <button
                                  onClick={() => startEdit(item)}
                                  className="text-blue-600 hover:text-blue-800 p-1"
                                  title="Edit"
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
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                  </svg>
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
