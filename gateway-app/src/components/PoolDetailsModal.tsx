import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { shortenAddress } from '@/lib/utils/string';
import { capitalize } from '@/lib/utils/string';
import { getPoolUrl } from '@/lib/pool-urls';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PoolTemplate } from '@/lib/gateway-types';

interface PoolDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pool: PoolTemplate | null;
  onDeletePool?: (pool: PoolTemplate) => void;
}

export function PoolDetailsModal({
  open,
  onOpenChange,
  pool,
  onDeletePool,
}: PoolDetailsModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (!pool) return null;

  const poolUrl = getPoolUrl({
    connector: pool.connector || '',
    type: pool.type,
    network: pool.network,
    poolAddress: pool.address,
  });

  const PoolDetails = ({ className }: { className?: string }) => (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Pool</span>
          <span className="font-medium">{pool.baseSymbol}-{pool.quoteSymbol}</span>
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Connector</span>
          <Badge variant="outline">
            {capitalize(pool.connector || '')} {pool.type.toUpperCase()}
          </Badge>
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Fee</span>
          <Badge>{pool.feePct}%</Badge>
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Address</span>
          {poolUrl ? (
            <a
              href={poolUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs hover:text-primary transition-colors inline-flex items-center gap-1"
            >
              {shortenAddress(pool.address, 8, 8)}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono text-xs">{shortenAddress(pool.address, 8, 8)}</span>
          )}
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Base Token</span>
          <span className="font-mono text-xs">{shortenAddress(pool.baseTokenAddress, 8, 8)}</span>
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Quote Token</span>
          <span className="font-mono text-xs">{shortenAddress(pool.quoteTokenAddress, 8, 8)}</span>
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Network</span>
          <span className="font-medium">{pool.network}</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {onDeletePool && (
          <Button
            onClick={() => {
              onDeletePool(pool);
              onOpenChange(false);
            }}
            variant="destructive"
            size="sm"
          >
            Delete Pool
          </Button>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Pool Details</DialogTitle>
            <DialogDescription>
              {pool && `${pool.baseSymbol}-${pool.quoteSymbol} on ${capitalize(pool.connector || '')}`}
            </DialogDescription>
          </DialogHeader>
          <PoolDetails />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Pool Details</DrawerTitle>
          <DrawerDescription>
            {pool && `${pool.baseSymbol}-${pool.quoteSymbol} on ${capitalize(pool.connector || '')}`}
          </DrawerDescription>
        </DrawerHeader>
        <PoolDetails className="px-4 pb-4" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
