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
import { shortenAddress } from '@/lib/utils/string';
import { getExplorerTokenUrl } from '@/lib/utils/explorer';
import { cn } from '@/lib/utils';
import type { TokenInfo } from '@/lib/utils';

export interface Balance {
  symbol: string;
  name: string;
  address: string;
  balance: string;
  value?: number;
}

interface TokenDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: TokenInfo | null;
  balance?: Balance | null;
  chain: string;
  network: string;
  nativeSymbol: string;
  onDeleteToken?: (balance: Balance) => void;
}

export function TokenDetailsModal({
  open,
  onOpenChange,
  token,
  balance,
  chain,
  network,
  nativeSymbol,
  onDeleteToken,
}: TokenDetailsModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (!token) return null;

  const canDelete = balance && balance.symbol !== nativeSymbol && balance.address;

  const TokenDetails = ({ className }: { className?: string }) => (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Symbol</span>
          <span className="font-medium">{token.symbol}</span>
        </div>

        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium">{token.name}</span>
        </div>

        {token.address && (
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Address</span>
            <a
              href={getExplorerTokenUrl(chain, network, token.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              {shortenAddress(token.address, 6, 4)}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        )}

        {token.decimals !== undefined && (
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Decimals</span>
            <span className="font-medium">{token.decimals}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        {canDelete && onDeleteToken && (
          <Button
            onClick={() => {
              onDeleteToken(balance);
              onOpenChange(false);
            }}
            variant="destructive"
            size="sm"
          >
            Delete Token
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
            <DialogTitle>Token Details</DialogTitle>
            <DialogDescription>
              {token && `${token.symbol} - ${token.name}`}
            </DialogDescription>
          </DialogHeader>
          <TokenDetails />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Token Details</DrawerTitle>
          <DrawerDescription>
            {token && `${token.symbol} - ${token.name}`}
          </DrawerDescription>
        </DrawerHeader>
        <TokenDetails className="px-4 pb-4" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
