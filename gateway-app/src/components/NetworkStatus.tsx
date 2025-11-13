import { useState, useEffect } from 'react';
import { gatewayGet } from '@/lib/api';
import type { StatusResponseType as ChainStatus } from '@/lib/gateway-types';

interface NetworkStatusProps {
  chain: string;
  network: string;
}

export function NetworkStatus({ chain, network }: NetworkStatusProps) {
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [chain, network]);

  async function fetchStatus() {
    try {
      setLoading(true);
      const data = await gatewayGet<ChainStatus>(
        `/chains/${chain}/status?network=${network}`
      );
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch chain status:', err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  const isOnline = status && status.currentBlockNumber > 0;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent transition-colors"
        title="View network status"
      >
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              loading
                ? 'bg-yellow-500 animate-pulse'
                : isOnline
                ? 'bg-green-500'
                : 'bg-red-500'
            }`}
          />
          {status && (
            <span className="text-xs font-mono text-muted-foreground">
              {status.currentBlockNumber.toLocaleString()}
            </span>
          )}
        </div>
      </button>

      {/* Status Modal */}
      {showModal && status && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-background rounded-lg max-w-lg w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">Network Status</h3>
                <p className="text-sm text-muted-foreground">
                  {status.chain} - {status.network}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-accent rounded"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
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

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isOnline ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="font-medium">
                  {isOnline ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Chain</span>
                  <span className="font-medium capitalize">{status.chain}</span>
                </div>

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-medium">{status.network}</span>
                </div>

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Block Number</span>
                  <span className="font-mono font-medium">
                    {status.currentBlockNumber.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Native Currency</span>
                  <span className="font-medium">{status.nativeCurrency}</span>
                </div>

                {status.rpcProvider && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">RPC Provider</span>
                    <span className="font-medium capitalize">
                      {status.rpcProvider}
                    </span>
                  </div>
                )}

                {status.swapProvider && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Swap Provider</span>
                    <span className="font-medium">{status.swapProvider}</span>
                  </div>
                )}

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">RPC URL</span>
                  <span className="text-xs break-all max-w-xs text-right">
                    {status.rpcUrl}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={fetchStatus}
                className="px-4 py-2 rounded-lg hover:bg-accent transition-colors text-sm"
              >
                Refresh
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
