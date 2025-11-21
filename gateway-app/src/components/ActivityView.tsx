import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LRUCache } from 'lru-cache';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { useApp } from '../lib/AppContext';
import { ChainAPI, GatewayAPI } from '../lib/GatewayAPI';
import type { TransactionsResponseType, ParseResponseType } from '../lib/gateway-types';
import { formatDistanceToNow } from 'date-fns';
import { getExplorerTxUrl } from '../lib/utils/explorer';
import { openExternalUrl } from '@/lib/utils/external-link';
import { ExternalLink, ChevronDown } from 'lucide-react';

const chainAPI = new ChainAPI();
const gatewayAPI = new GatewayAPI();

// LRU cache for parsed transactions (max 100, TTL 5 minutes)
const parsedTxCache = new LRUCache<string, ParseResponseType>({
  max: 100,
  ttl: 1000 * 60 * 5,
});

interface Transaction {
  signature: string;
  blockTime: number | null;
}

interface ParsedTransaction extends ParseResponseType {
  signature: string;
}

export function ActivityView() {
  const { selectedChain, selectedNetwork, selectedWallet, gatewayAvailable } = useApp();
  const { signature } = useParams<{ signature: string }>();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [parsedTx, setParsedTx] = useState<ParsedTransaction | null>(null);
  const [allParsedTxs, setAllParsedTxs] = useState<Map<string, ParseResponseType>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);
  const [hideUnmatched, setHideUnmatched] = useState(true);
  const [txLimit, setTxLimit] = useState(20);
  const [showConnectorDropdown, setShowConnectorDropdown] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Extract unique connectors from parsed transactions
  useEffect(() => {
    const uniqueConnectors = new Set<string>();
    allParsedTxs.forEach((parsed) => {
      if (parsed.connector) {
        const connectorInfo = parseConnectorInfo(parsed.connector);
        if (connectorInfo) {
          uniqueConnectors.add(connectorInfo.name.toLowerCase());
        }
      }
    });
    setConnectors(Array.from(uniqueConnectors));
  }, [allParsedTxs]);

  useEffect(() => {
    loadTransactions();
    // Clear selected transaction and parsed data when chain/network/wallet changes
    setSelectedTx(null);
    setParsedTx(null);
    setAllParsedTxs(new Map());
  }, [selectedChain, selectedNetwork, selectedWallet]);

  useEffect(() => {
    if (selectedTx && selectedWallet) {
      parseTransaction();
    } else {
      setParsedTx(null);
    }
  }, [selectedTx, selectedWallet, selectedChain, selectedNetwork]);

  // Handle signature from URL parameter
  useEffect(() => {
    if (signature && transactions.length > 0) {
      const tx = transactions.find((t) => t.signature === signature);
      if (tx && tx.signature !== selectedTx?.signature) {
        setSelectedTx(tx);
      }
    }
  }, [signature, transactions]);

  async function loadTransactions() {
    if (!selectedWallet) {
      setTransactions([]);
      setSelectedTx(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const txHistory: TransactionsResponseType = await chainAPI.getTransactions(selectedChain, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        limit: txLimit,
      });

      const txList = txHistory.transactions.map(tx => ({
        signature: tx.signature,
        blockTime: tx.blockTime,
      }));

      setTransactions(txList);

      // Parse all transactions in parallel
      const parsePromises = txList.map(async (tx) => {
        // Check cache first
        const cached = parsedTxCache.get(tx.signature);
        if (cached) {
          return { signature: tx.signature, parsed: cached };
        }

        try {
          const parsed = await chainAPI.parseTransaction(selectedChain, {
            network: selectedNetwork,
            signature: tx.signature,
            walletAddress: selectedWallet,
          });

          // Store in cache
          parsedTxCache.set(tx.signature, parsed);

          return { signature: tx.signature, parsed };
        } catch (err) {
          return { signature: tx.signature, parsed: null };
        }
      });

      const results = await Promise.all(parsePromises);

      // Merge new parsed transactions with existing ones
      setAllParsedTxs((prevParsedTxs) => {
        const updatedMap = new Map(prevParsedTxs);
        results.forEach(({ signature, parsed }) => {
          if (parsed) {
            updatedMap.set(signature, parsed);
          }
        });
        return updatedMap;
      });

      // Auto-select first matched transaction (one with a connector)
      if (txList.length > 0) {
        // Find first transaction with a connector
        const firstMatched = results.find(({ parsed }) => parsed?.connector);

        if (firstMatched) {
          // Select the first matched transaction
          const matchedTx = txList.find(tx => tx.signature === firstMatched.signature);
          if (matchedTx) {
            setSelectedTx({
              signature: matchedTx.signature,
              blockTime: matchedTx.blockTime,
            });
          }
        } else {
          // Fallback to first transaction if no matched ones
          setSelectedTx({
            signature: txList[0].signature,
            blockTime: txList[0].blockTime,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  async function parseTransaction() {
    if (!selectedTx || !selectedWallet) return;

    setLoadingParse(true);

    try {
      const parsed = await chainAPI.parseTransaction(selectedChain, {
        network: selectedNetwork,
        signature: selectedTx.signature,
        walletAddress: selectedWallet,
      });

      setParsedTx({
        ...parsed,
        signature: selectedTx.signature,
      });
    } catch (err) {
      setParsedTx(null);
    } finally {
      setLoadingParse(false);
    }
  }


  function formatTimeAgo(blockTime: number | null): string {
    if (!blockTime) return 'Pending';
    try {
      return formatDistanceToNow(new Date(blockTime * 1000), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  }

  function formatSignature(signature: string): string {
    // Ethereum hashes start with 0x and are 66 characters
    if (signature.startsWith('0x') && signature.length === 66) {
      return `${signature.slice(0, 6)}...${signature.slice(-4)}`;
    }
    // Solana signatures are base58 encoded, typically 87-88 characters
    return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
  }

  function getStatusBadge(status: number) {
    if (status === 1) return <Badge variant="outline" className="bg-green-500/20 text-green-500 border-green-500/30">Confirmed</Badge>;
    if (status === -1) return <Badge variant="destructive">Failed</Badge>;
    return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Pending</Badge>;
  }

  function parseConnectorInfo(connector: string | undefined): { name: string; type: string } | null {
    if (!connector) return null;
    const parts = connector.split('/');
    if (parts.length !== 2) return null;
    return {
      name: parts[0].charAt(0).toUpperCase() + parts[0].slice(1), // Capitalize first letter
      type: parts[1].toUpperCase(), // e.g., "clmm" -> "CLMM"
    };
  }

  function toggleConnector(connector: string) {
    if (selectedConnectors.includes(connector)) {
      setSelectedConnectors(selectedConnectors.filter((c) => c !== connector));
    } else {
      setSelectedConnectors([...selectedConnectors, connector]);
    }
  }

  function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Filter transactions based on connector and hideUnmatched
  const filteredTransactions = transactions.filter((tx) => {
    const parsed = allParsedTxs.get(tx.signature);

    // If hideUnmatched is enabled, only show transactions with a connector
    if (hideUnmatched && !parsed?.connector) {
      return false;
    }

    // If connectors are selected, filter by them
    if (selectedConnectors.length > 0 && parsed?.connector) {
      const connectorInfo = parseConnectorInfo(parsed.connector);
      if (!connectorInfo || !selectedConnectors.includes(connectorInfo.name.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  // Check Gateway availability
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
        message="Please select a wallet to view transaction activity."
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading transactions..." />;
  }

  if (error) {
    return (
      <EmptyState
        title="Error Loading Transactions"
        message={error}
        icon="⚠️"
      />
    );
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No Transactions"
        message="No transaction history found for this wallet."
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Mobile Filters and Transaction Selector */}
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
              {(selectedConnectors.length > 0 || hideUnmatched) && (
                <span className="ml-2 text-muted-foreground font-normal">
                  ({selectedConnectors.length > 0 ? `${selectedConnectors.map(c => capitalize(c)).join(', ')}` : ''}
                  {selectedConnectors.length > 0 && hideUnmatched ? ', ' : ''}
                  {hideUnmatched ? 'Hide Unknown' : ''})
                </span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Collapsible Filter Section */}
        {showMobileFilters && (
          <div className="p-3 space-y-3 border-b bg-muted/10">
            {/* Number to Fetch */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Number to Fetch
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={txLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= 1000) {
                      setTxLimit(val);
                    }
                  }}
                  className="h-9 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button
                  onClick={loadTransactions}
                  disabled={loading}
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
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
                    className={loading ? 'animate-spin' : ''}
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </Button>
              </div>
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
                  ? 'All connectors'
                  : selectedConnectors.map((c) => capitalize(c)).join(', ')}
              </Button>
              {showConnectorDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded shadow-lg max-h-48 overflow-y-auto">
                  {connectors.map((conn) => (
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

            {/* Hide Unknown Toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hide-unmatched-mobile"
                checked={hideUnmatched}
                onCheckedChange={(checked) => setHideUnmatched(checked as boolean)}
              />
              <Label
                htmlFor="hide-unmatched-mobile"
                className="text-xs font-normal cursor-pointer"
              >
                Hide Unknown
              </Label>
            </div>
          </div>
        )}

        {/* Transaction Selector */}
        <div className="p-2">
          <Select
            value={selectedTx?.signature || ''}
            onValueChange={(value) => {
              const tx = filteredTransactions.find((t) => t.signature === value);
              if (tx) {
                setSelectedTx(tx);
                navigate(`/transactions/${tx.signature}`);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filteredTransactions.map((tx) => {
                const parsed = allParsedTxs.get(tx.signature);
                const connectorInfo = parsed?.connector ? parseConnectorInfo(parsed.connector) : null;

                return (
                  <SelectItem key={tx.signature} value={tx.signature}>
                    {formatSignature(tx.signature)} • {formatTimeAgo(tx.blockTime)}
                    {connectorInfo && ` • ${connectorInfo.name}`}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Desktop Sidebar - Transaction List */}
      <div className="hidden md:block w-64 border-r bg-muted/10 p-4 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="space-y-4">
            {/* Fetch Section */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Number to Fetch
              </label>
              <div className="flex gap-2">
                <Input
                  id="tx-limit"
                  type="number"
                  min="1"
                  max="1000"
                  value={txLimit}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= 1000) {
                      setTxLimit(val);
                    }
                  }}
                  className="h-9 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button
                  onClick={loadTransactions}
                  disabled={loading}
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Fetch transactions"
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
                    className={loading ? 'animate-spin' : ''}
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </Button>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Filter Section */}
            <div className="space-y-4">
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
                    ? 'All connectors'
                    : selectedConnectors.map((c) => capitalize(c)).join(', ')}
                </Button>
                {showConnectorDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-background border rounded shadow-lg max-h-48 overflow-y-auto">
                    {connectors.map((conn) => (
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

              {/* Hide Unknown Toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hide-unmatched"
                  checked={hideUnmatched}
                  onCheckedChange={(checked) => setHideUnmatched(checked as boolean)}
                />
                <Label
                  htmlFor="hide-unmatched"
                  className="text-xs font-normal cursor-pointer"
                >
                  Hide Unknown
                </Label>
              </div>
            </div>

            <Separator className="my-4" />
          </div>

          {/* Transaction List */}
          <div className="flex-1 flex flex-col min-h-0 mt-4">
            <h3 className="font-semibold text-sm mb-2">
              Transactions ({filteredTransactions.length})
            </h3>
            <div className="flex-1 overflow-y-auto">
              {filteredTransactions.map((tx) => {
                const parsed = allParsedTxs.get(tx.signature);
                const connectorInfo = parsed?.connector ? parseConnectorInfo(parsed.connector) : null;
                const isUnmatched = !connectorInfo;

                return (
                  <Button
                    key={tx.signature}
                    onClick={() => {
                      setSelectedTx(tx);
                      navigate(`/transactions/${tx.signature}`);
                    }}
                    variant={selectedTx?.signature === tx.signature ? "default" : "ghost"}
                    className={`w-full justify-start px-3 py-2 h-auto mb-1 text-left ${isUnmatched ? 'text-muted-foreground' : ''}`}
                  >
                    <div className="flex flex-col items-start w-full gap-1">
                      <div className="font-mono text-xs truncate w-full text-left">
                        {formatSignature(tx.signature)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-left">
                        <span>{formatTimeAgo(tx.blockTime)}</span>
                        {connectorInfo && (
                          <>
                            <span>•</span>
                            <span className="font-medium">{connectorInfo.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Transaction Details */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 md:p-6 space-y-3 md:space-y-6">
          {loading ? (
            <LoadingState message="Loading transactions..." />
          ) : !selectedTx ? (
            <EmptyState
              title="No Transaction Selected"
              message="Select a transaction from the sidebar to view details."
            />
          ) : loadingParse ? (
            <LoadingState message="Parsing transaction..." />
          ) : !parsedTx ? (
            <EmptyState
              title="Failed to Parse Transaction"
              message="Unable to parse transaction details."
              icon="⚠️"
            />
          ) : (
            <>
            {/* Transaction Details Card */}
            <Card>
              <CardHeader className="p-3 md:p-6">
                <CardTitle className="flex items-center justify-between">
                  <span>{formatSignature(selectedTx.signature)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openExternalUrl(getExplorerTxUrl(selectedChain, selectedNetwork, selectedTx.signature))}
                    className="flex items-center gap-2"
                  >
                    <span>View in Explorer</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-6 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status:</span>
                  <span>{getStatusBadge(parsedTx.status)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Signature:</span>
                  <span className="font-mono text-xs truncate max-w-xs">
                    {selectedTx.signature}
                  </span>
                </div>

                {parsedTx.slot !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Slot:</span>
                    <span>{parsedTx.slot.toLocaleString()}</span>
                  </div>
                )}

                {parsedTx.blockTime !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Time:</span>
                    <span>{new Date(parsedTx.blockTime * 1000).toLocaleString()}</span>
                  </div>
                )}

                {parsedTx.fee !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Fee:</span>
                    <span>{parsedTx.fee} {selectedChain === 'solana' ? 'SOL' : 'ETH'}</span>
                  </div>
                )}

                {parsedTx.error && (
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Error:</span>
                    <span className="text-destructive text-xs max-w-xs text-right">
                      {parsedTx.error}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Connector Card */}
            {parseConnectorInfo(parsedTx.connector) && (
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <CardTitle>Connector</CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{parseConnectorInfo(parsedTx.connector)!.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge variant="secondary">{parseConnectorInfo(parsedTx.connector)!.type}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Balance Changes Card */}
            {parsedTx.tokenBalanceChanges && Object.keys(parsedTx.tokenBalanceChanges).length > 0 && (
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <CardTitle>Balance Changes</CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Tokens Sent (negative changes) */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
                        Sent
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(parsedTx.tokenBalanceChanges)
                          .filter(([_, change]) => change < 0)
                          .map(([token, change]) => (
                            <div key={token} className="flex justify-between items-center text-sm">
                              <span className="font-medium">{token}</span>
                              <span className="text-red-500">
                                {Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                              </span>
                            </div>
                          ))}
                        {Object.entries(parsedTx.tokenBalanceChanges).filter(([_, change]) => change < 0).length === 0 && (
                          <p className="text-xs text-muted-foreground">No tokens sent</p>
                        )}
                      </div>
                    </div>

                    {/* Tokens Received (positive changes) */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
                        Received
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(parsedTx.tokenBalanceChanges)
                          .filter(([_, change]) => change > 0)
                          .map(([token, change]) => (
                            <div key={token} className="flex justify-between items-center text-sm">
                              <span className="font-medium">{token}</span>
                              <span className="text-green-500">
                                +{change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                              </span>
                            </div>
                          ))}
                        {Object.entries(parsedTx.tokenBalanceChanges).filter(([_, change]) => change > 0).length === 0 && (
                          <p className="text-xs text-muted-foreground">No tokens received</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
