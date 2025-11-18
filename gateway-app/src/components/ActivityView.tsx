import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { EmptyState } from './ui/EmptyState';
import { LoadingState } from './ui/LoadingState';
import { useApp } from '../lib/AppContext';
import { ChainAPI } from '../lib/GatewayAPI';
import type { TransactionsResponseType, ParseResponseType } from '../lib/gateway-types';
import { formatDistanceToNow } from 'date-fns';

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [parsedTx, setParsedTx] = useState<ParsedTransaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingParse, setLoadingParse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [selectedChain, selectedNetwork, selectedWallet]);

  useEffect(() => {
    if (selectedTx && selectedWallet) {
      parseTransaction();
    }
  }, [selectedTx, selectedWallet]);

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

      setTransactions(txHistory.transactions.map(tx => ({
        signature: tx.signature,
        blockTime: tx.blockTime,
      })));

      // Auto-select first transaction
      if (txHistory.transactions.length > 0 && !selectedTx) {
        setSelectedTx({
          signature: txHistory.transactions[0].signature,
          blockTime: txHistory.transactions[0].blockTime,
        });
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
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
      console.error('Failed to parse transaction:', err);
      setParsedTx(null);
    } finally {
      setLoadingParse(false);
    }
  }

  function getExplorerUrl(signature: string): string {
    if (selectedChain === 'solana') {
      return `https://solscan.io/tx/${signature}${selectedNetwork === 'devnet' ? '?cluster=devnet' : ''}`;
    } else {
      const networkMap: Record<string, string> = {
        mainnet: 'etherscan.io',
        sepolia: 'sepolia.etherscan.io',
        polygon: 'polygonscan.com',
        arbitrum: 'arbiscan.io',
        optimism: 'optimistic.etherscan.io',
        base: 'basescan.org',
        avalanche: 'snowtrace.io',
        bsc: 'bscscan.com',
      };
      const explorer = networkMap[selectedNetwork] || 'etherscan.io';
      return `https://${explorer}/tx/${signature}`;
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

  function getStatusBadge(status: number) {
    if (status === 1) return <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded">Confirmed</span>;
    if (status === -1) return <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-500 rounded">Failed</span>;
    return <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded">Pending</span>;
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
        <select
          value={selectedTx?.signature || ''}
          onChange={(e) => {
            const tx = transactions.find((t) => t.signature === e.target.value);
            if (tx) setSelectedTx(tx);
          }}
          className="w-full p-2 border rounded bg-background"
        >
          {transactions.map((tx) => (
            <option key={tx.signature} value={tx.signature}>
              {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)} • {formatTimeAgo(tx.blockTime)}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Sidebar - Transaction List */}
      <div className="hidden md:block w-80 border-r overflow-y-auto">
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm">Recent Transactions</h3>
          <p className="text-xs text-muted-foreground">{transactions.length} transactions</p>
        </div>
        <div className="divide-y">
          {transactions.map((tx) => (
            <button
              key={tx.signature}
              onClick={() => setSelectedTx(tx)}
              className={`w-full p-3 text-left hover:bg-accent transition-colors ${
                selectedTx?.signature === tx.signature ? 'bg-accent' : ''
              }`}
            >
              <div className="space-y-1">
                <p className="font-mono text-xs truncate">
                  {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTimeAgo(tx.blockTime)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content - Transaction Details */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedTx ? (
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
          <div className="space-y-4 max-w-3xl">
            {/* Transaction Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Transaction Details</span>
                  <a
                    href={getExplorerUrl(selectedTx.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    View in Explorer ↗
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
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
                <CardHeader>
                  <CardTitle className="text-base">Connector</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{parseConnectorInfo(parsedTx.connector)!.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-medium">{parseConnectorInfo(parsedTx.connector)!.type}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Balance Changes Card */}
            {parsedTx.tokenBalanceChanges && Object.keys(parsedTx.tokenBalanceChanges).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Balance Changes</CardTitle>
                </CardHeader>
                <CardContent>
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
          </div>
        )}
      </div>
    </div>
  );
}
