import { useState, useEffect } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './ui/drawer';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RestartButton } from './RestartButton';
import { gatewayAPI } from '@/lib/GatewayAPI';
import type { StatusResponseType as ChainStatus } from '@/lib/gateway-types';
import { cn } from '@/lib/utils';

interface NetworkStatusProps {
  chain: string;
  network: string;
}

export function NetworkStatus({ chain, network }: NetworkStatusProps) {
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    fetchStatus();
  }, [chain, network]);

  async function fetchStatus() {
    try {
      setLoading(true);
      const data = await gatewayAPI.chains.getStatus(chain, network);
      setStatus(data);
    } catch (err) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  const isOnline = status && status.currentBlockNumber > 0;

  const StatusDetails = ({ className }: { className?: string }) => {
    if (!status) return null;

    return (
      <div className={cn("space-y-4", className)}>
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

        <div className="flex justify-end gap-2 pt-2">
          <RestartButton iconSize={16} showLabel={true} />
        </div>
      </div>
    );
  };

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 px-3 h-10"
            title="View network status"
          >
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
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
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Network Status</DialogTitle>
            <DialogDescription>
              {status && `${status.chain} - ${status.network}`}
            </DialogDescription>
          </DialogHeader>
          <StatusDetails />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          title="View network status"
        >
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              loading
                ? 'bg-yellow-500 animate-pulse'
                : isOnline
                ? 'bg-green-500'
                : 'bg-red-500'
            }`}
          />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Network Status</DrawerTitle>
          <DrawerDescription>
            {status && `${status.chain} - ${status.network}`}
          </DrawerDescription>
        </DrawerHeader>
        <StatusDetails className="px-4 pb-4" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
