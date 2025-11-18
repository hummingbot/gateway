import { useState, useEffect } from 'react';
import { useApp } from '../lib/AppContext';
import { ChainAPI } from '../lib/GatewayAPI';
import type { TransactionsResponseType, ParseResponseType } from '../lib/gateway-types';
import { format } from 'date-fns';

const chainAPI = new ChainAPI();

interface ParsedTransaction {
  signature: string;
  blockTime: number | null;
  status: number;
  fee: number | null;
  tokenBalanceChanges?: Record<string, number>;
  connector?: string;
  error?: string;
}

export function ActivityView() {
  const { selectedChain, selectedNetwork, selectedWallet } = useApp();
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [selectedChain, selectedNetwork, selectedWallet]);

  async function loadTransactions() {
    if (!selectedWallet) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch transaction history
      const txHistory: TransactionsResponseType = await chainAPI.getTransactions(selectedChain, {
        network: selectedNetwork,
        walletAddress: selectedWallet,
        limit: 20,
      });

      // Parse each transaction
      const parsedPromises = txHistory.transactions.map(async (tx) => {
        try {
          const parsed = await chainAPI.parseTransaction(selectedChain, {
            network: selectedNetwork,
            signature: tx.signature,
            walletAddress: selectedWallet,
          });

          const result: ParsedTransaction = {
            signature: parsed.signature,
            blockTime: parsed.blockTime,
            status: parsed.status,
            fee: parsed.fee,
          };
          if (parsed.tokenBalanceChanges) result.tokenBalanceChanges = parsed.tokenBalanceChanges;
          if (parsed.connector) result.connector = parsed.connector;
          if (parsed.error) result.error = parsed.error;
          return result;
        } catch (err) {
          console.error(`Failed to parse transaction ${tx.signature}:`, err);
          return null;
        }
      });

      const parsed = await Promise.all(parsedPromises);
      setTransactions(parsed.filter((tx): tx is ParsedTransaction => tx !== null));
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  function getExplorerUrl(signature: string): string {
    if (selectedChain === 'solana') {
      return `https://solscan.io/tx/${signature}${selectedNetwork === 'devnet' ? '?cluster=devnet' : ''}`;
    } else {
      // Ethereum networks
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

  function formatTimestamp(blockTime: number | null): string {
    if (!blockTime) return 'Pending';
    return format(new Date(blockTime * 1000), 'MMM d, yyyy HH:mm:ss');
  }

  function getActionLabel(tx: ParsedTransaction): string {
    if (tx.error) return 'Failed';
    if (tx.status === 0) return 'Pending';
    if (tx.status === -1) return 'Failed';
    if (tx.connector) return `${tx.connector} Interaction`;
    if (tx.tokenBalanceChanges) {
      const changes = Object.keys(tx.tokenBalanceChanges);
      if (changes.length > 1) return 'Token Transfer';
      if (changes.length === 1) return 'Transfer';
    }
    return 'Transaction';
  }

  function getActionColor(tx: ParsedTransaction): string {
    if (tx.error || tx.status === -1) return 'text-destructive';
    if (tx.status === 0) return 'text-yellow-500';
    if (tx.connector) return 'text-blue-500';
    return 'text-green-500';
  }

  if (!selectedWallet) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>Please select a wallet to view transaction activity</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={loadTransactions}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No transactions found</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Transaction Activity</h2>
        <button
          onClick={loadTransactions}
          className="px-3 py-1 text-sm bg-secondary hover:bg-secondary/80 rounded-md"
        >
          Refresh
        </button>
      </div>

      {transactions.map((tx) => (
        <div
          key={tx.signature}
          className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
        >
          <div
            className="flex items-start justify-between cursor-pointer"
            onClick={() => setExpandedTx(expandedTx === tx.signature ? null : tx.signature)}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-medium ${getActionColor(tx)}`}>
                  {getActionLabel(tx)}
                </span>
                {tx.connector && (
                  <span className="text-xs px-2 py-0.5 bg-secondary rounded">
                    {tx.connector}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatTimestamp(tx.blockTime)}
              </p>
            </div>
            <a
              href={getExplorerUrl(tx.signature)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline"
            >
              View ↗
            </a>
          </div>

          {expandedTx === tx.signature && (
            <div className="mt-4 pt-4 border-t space-y-3 text-sm">
              {/* Signature */}
              <div>
                <span className="text-muted-foreground">Signature:</span>
                <p className="font-mono text-xs break-all">{tx.signature}</p>
              </div>

              {/* Token Balance Changes */}
              {tx.tokenBalanceChanges && Object.keys(tx.tokenBalanceChanges).length > 0 && (
                <div>
                  <span className="text-muted-foreground">Balance Changes:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(tx.tokenBalanceChanges).map(([token, change]) => (
                      <div key={token} className="flex justify-between text-xs">
                        <span>{token}:</span>
                        <span className={change > 0 ? 'text-green-500' : 'text-red-500'}>
                          {change > 0 ? '+' : ''}{change}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fee */}
              {tx.fee !== null && (
                <div>
                  <span className="text-muted-foreground">Fee:</span>
                  <span className="ml-2 text-xs">{tx.fee} {selectedChain === 'solana' ? 'SOL' : 'ETH'}</span>
                </div>
              )}

              {/* Error */}
              {tx.error && (
                <div>
                  <span className="text-muted-foreground">Error:</span>
                  <p className="text-xs text-destructive mt-1">{tx.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
