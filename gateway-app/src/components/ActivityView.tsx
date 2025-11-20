import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
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
import { ChainAPI } from '../lib/GatewayAPI';
import type { TransactionsResponseType, ParseResponseType } from '../lib/gateway-types';
import { formatDistanceToNow } from 'date-fns';
import { getExplorerTxUrl } from '../lib/utils/explorer';
import { openExternalUrl } from '@/lib/utils/external-link';
import { ExternalLink } from 'lucide-react';

const chainAPI = new ChainAPI();

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
  const [loading, setLoading] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
    // Clear selected transaction and parsed data when chain/network/wallet changes
    setSelectedTx(null);
    setParsedTx(null);
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
        limit: 20,
      });

      const txList = txHistory.transactions.map(tx => ({
        signature: tx.signature,
        blockTime: tx.blockTime,
      }));

      setTransactions(txList);

      // Auto-select first transaction
      if (txList.length > 0) {
        setSelectedTx({
          signature: txList[0].signature,
          blockTime: txList[0].blockTime,
        });
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
      {/* Mobile Transaction Selector */}
      <div className="md:hidden border-b p-2">
        <Select
          value={selectedTx?.signature || ''}
          onValueChange={(value) => {
            const tx = transactions.find((t) => t.signature === value);
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
            {transactions.map((tx) => (
              <SelectItem key={tx.signature} value={tx.signature}>
                {formatSignature(tx.signature)} • {formatTimeAgo(tx.blockTime)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop Sidebar - Transaction List */}
      <div className="hidden md:block w-64 border-r bg-muted/10 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Recent Transactions</h3>
              <Button
                onClick={loadTransactions}
                disabled={loading}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Refresh transactions"
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
            <div>
              {transactions.map((tx) => (
                <Button
                  key={tx.signature}
                  onClick={() => {
                    setSelectedTx(tx);
                    navigate(`/transactions/${tx.signature}`);
                  }}
                  variant={selectedTx?.signature === tx.signature ? "default" : "ghost"}
                  className="w-full justify-start px-3 py-2 h-auto mb-1 text-left"
                >
                  <div className="flex flex-col items-start w-full gap-0.5">
                    <div className="font-mono text-xs truncate w-full text-left">
                      {formatSignature(tx.signature)}
                    </div>
                    <div className="text-xs opacity-75 text-left">
                      {formatTimeAgo(tx.blockTime)}
                    </div>
                  </div>
                </Button>
              ))}
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
