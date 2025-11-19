import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { gatewayAPI } from '@/lib/GatewayAPI';
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
      const data = await gatewayAPI.chains.getStatus(chain, network);
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
      <Button
        onClick={() => setShowModal(true)}
        variant="ghost"
        className="flex items-center gap-2 px-2 py-1 h-auto"
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
      </Button>

      {/* Status Modal */}
      {showModal && status && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-background border rounded-lg max-w-lg w-full p-6 space-y-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">Network Status</h3>
                <p className="text-sm text-muted-foreground">
                  {status.chain} - {status.network}
                </p>
              </div>
              <Button
                onClick={() => setShowModal(false)}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
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
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant={isOnline ? "outline" : "destructive"}
                  className={isOnline ? "bg-green-500/20 text-green-500 border-green-500/30" : ""}
                >
                  {isOnline ? 'Connected' : 'Disconnected'}
                </Badge>
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
              <Button
                onClick={fetchStatus}
                variant="outline"
                size="sm"
              >
                Refresh
              </Button>
              <Button
                onClick={() => setShowModal(false)}
                size="sm"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
