import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Switch } from './ui/switch';
import { gatewayAPI } from '@/lib/GatewayAPI';
import { readAppConfig, updateAppConfigValue } from '@/lib/app-config';
import { showSuccessNotification, showErrorNotification } from '@/lib/notifications';
import { useApp } from '@/lib/AppContext';

interface ConfigItem {
  namespace: string;
  path: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'array';
}

interface ChainData {
  chain: string;
  networks: string[];
}

export function ConfigView() {
  const { setDarkMode } = useApp();
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

      // Always have app namespace available
      let allNamespaces = ['app'];
      let chainData: ChainData[] = [];

      try {
        // Try to fetch Gateway API data
        const [namespacesData, chainsData] = await Promise.all([
          gatewayAPI.config.getNamespaces(),
          gatewayAPI.config.getChains(),
        ]);

        // Add Gateway namespaces after app
        allNamespaces = ['app', ...namespacesData.namespaces.sort()];
        chainData = chainsData.chains;
      } catch (err) {
        console.error('Failed to load Gateway config data:', err);
        // Continue with just app namespace if Gateway API fails
      }

      setNamespaces(allNamespaces);
      setChains(chainData);

      // Default to 'app' first
      setSelectedNamespace('app');
    } catch (err) {
      console.error('Failed to initialize config:', err);
      // Still set app namespace even if everything fails
      setNamespaces(['app']);
      setChains([]);
      setSelectedNamespace('app');
    } finally {
      setLoading(false);
    }
  }

  async function loadConfig() {
    try {
      setLoading(true);

      let namespaceConfig: any = {};

      // Handle app config differently (local file)
      if (selectedNamespace === 'app') {
        try {
          namespaceConfig = await readAppConfig();
        } catch (err) {
          console.error('Failed to load app config:', err);
          // Use empty config if app config fails
          namespaceConfig = {};
        }
      } else {
        // Gateway API config
        try {
          const allConfigs = await gatewayAPI.config.getAll();
          namespaceConfig = allConfigs[selectedNamespace] || {};
        } catch (err) {
          console.error('Failed to load Gateway config:', err);
          await showErrorNotification('Failed to load Gateway configuration');
          namespaceConfig = {};
        }
      }

      // Convert config object to flat list of items
      const items: ConfigItem[] = [];

      function flattenConfig(obj: any, parentPath = '') {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = parentPath ? `${parentPath}.${key}` : key;

          if (Array.isArray(value)) {
            // Add array as a config item
            items.push({
              namespace: selectedNamespace,
              path: currentPath,
              value,
              type: 'array',
            });
          } else if (value !== null && typeof value === 'object') {
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
      console.error('Unexpected error loading config:', err);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: ConfigItem) {
    setEditingKey(`${item.namespace}.${item.path}`);
    // Convert arrays to comma-separated string for editing
    if (item.type === 'array') {
      setEditValue(Array.isArray(item.value) ? item.value.join(', ') : '');
    } else {
      setEditValue(item.value);
    }
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue('');
  }

  async function saveEdit(item: ConfigItem) {
    try {
      setSaving(true);

      // Parse the value based on type
      let parsedValue = editValue;
      if (item.type === 'array') {
        // Convert comma-separated string to array, trimming whitespace
        parsedValue = editValue
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
      }

      // Handle app config differently (local file)
      if (item.namespace === 'app') {
        await updateAppConfigValue(item.path, parsedValue);
      } else {
        // Gateway API config
        await gatewayAPI.config.update(item.namespace, item.path, parsedValue);
      }

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

  async function handleBooleanToggle(item: ConfigItem, newValue: boolean) {
    try {
      setSaving(true);

      // Handle app config differently (local file)
      if (item.namespace === 'app') {
        await updateAppConfigValue(item.path, newValue);

        // If it's darkMode, also update AppContext to trigger immediate UI change
        if (item.path === 'darkMode') {
          setDarkMode(newValue);
        }
      } else {
        // Gateway API config
        await gatewayAPI.config.update(item.namespace, item.path, newValue);
      }

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
  const gatewayNamespaces = namespaces.filter(ns => ['app', 'server'].includes(ns));
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
      // Not app, server or RPC
      if (['app', 'server'].includes(ns) || ['helius', 'infura'].includes(ns)) return false;

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
    <div className="flex flex-col md:flex-row h-full">
      {/* Mobile Dropdown Selector */}
      <div className="md:hidden border-b p-2">
        <Select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="w-full"
        >
          {/* Gateway */}
          {gatewayNamespaces.length > 0 && (
            <optgroup label="Gateway">
              {gatewayNamespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </optgroup>
          )}

          {/* RPC Providers */}
          {rpcNamespaces.length > 0 && (
            <optgroup label="RPC Providers">
              {rpcNamespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </optgroup>
          )}

          {/* Chains */}
          {chainNetworks.map(({ chain, baseConfig, networks }) => (
            (baseConfig || networks.length > 0) && (
              <optgroup key={chain} label={chain.charAt(0).toUpperCase() + chain.slice(1)}>
                {baseConfig && (
                  <option value={baseConfig}>{chain}</option>
                )}
                {networks.map((ns) => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
              </optgroup>
            )
          ))}

          {/* Connectors */}
          {connectorNamespaces.length > 0 && (
            <optgroup label="Connectors">
              {connectorNamespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </optgroup>
          )}
        </Select>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 border-r bg-muted/10 p-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Gateway */}
          {gatewayNamespaces.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2">Gateway</h3>
              {gatewayNamespaces.map((ns) => (
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
        <div className="p-2 md:p-6">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="text-lg md:text-xl">{selectedNamespace}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : configItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No configuration items found
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-xs md:text-sm">Setting</th>
                        <th className="text-right py-2 text-xs md:text-sm pr-2">Value</th>
                        <th className="w-8 md:w-10"></th>
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
                            <td className="py-2 text-xs md:text-sm break-words max-w-[120px] md:max-w-none pr-2">
                              {item.path}
                            </td>
                            <td className="py-2 text-right pr-2">
                              {item.type === 'boolean' ? (
                                // Boolean values always show as toggle, no edit mode needed
                                <div className="flex items-center gap-2 justify-end min-w-[140px]">
                                  <span className="text-xs text-muted-foreground">false</span>
                                  <Switch
                                    checked={item.value}
                                    onCheckedChange={(checked) => handleBooleanToggle(item, checked)}
                                    disabled={saving}
                                  />
                                  <span className="text-xs text-muted-foreground">true</span>
                                </div>
                              ) : isEditing ? (
                                // Non-boolean values: show input in edit mode
                                <div className="flex gap-2 justify-end">
                                  <Input
                                    type={item.type === 'number' ? 'number' : 'text'}
                                    value={editValue}
                                    onChange={(e) => {
                                      const val = item.type === 'number'
                                        ? Number(e.target.value)
                                        : e.target.value;
                                      setEditValue(val);
                                    }}
                                    className="w-40 md:w-64 text-right text-sm"
                                    disabled={saving}
                                  />
                                </div>
                              ) : (
                                // Non-boolean values: show text when not editing
                                <span className="text-sm text-muted-foreground break-all">
                                  {item.type === 'array' && Array.isArray(item.value)
                                    ? item.value.join(', ')
                                    : String(item.value)}
                                </span>
                              )}
                            </td>
                            <td className="text-right">
                              {item.type === 'boolean' ? (
                                // Boolean values don't need edit button (they're always toggles)
                                null
                              ) : isEditing ? (
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
