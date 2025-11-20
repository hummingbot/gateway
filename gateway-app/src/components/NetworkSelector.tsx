import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Button } from './ui/button';
import { Check, Network } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NetworkSelectorProps {
  selectedChain: string;
  selectedNetwork: string;
  networks: string[];
  onNetworkChange: (network: string) => void;
  /**
   * When true, renders as icon button for mobile navigation bar.
   * When false, renders as full Select component for desktop.
   */
  iconOnly?: boolean;
}

export function NetworkSelector({
  selectedChain,
  selectedNetwork,
  networks,
  onNetworkChange,
  iconOnly = false,
}: NetworkSelectorProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleSelect = (network: string) => {
    onNetworkChange(network);
    setOpen(false);
  };

  // Desktop: Use Select component (no modal)
  if (isDesktop && !iconOnly) {
    return (
      <Select value={selectedNetwork} onValueChange={onNetworkChange}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {networks.length > 0 ? (
            networks.map((network) => (
              <SelectItem key={network} value={network}>
                {selectedChain}-{network}
              </SelectItem>
            ))
          ) : (
            <SelectItem value={selectedNetwork}>
              {selectedChain}-{selectedNetwork}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  }

  const NetworkList = ({ className }: { className?: string }) => (
    <div className={cn("space-y-2", className)}>
      {networks.map((network) => {
        const isSelected = selectedNetwork === network;
        return (
          <Button
            key={network}
            onClick={() => handleSelect(network)}
            variant={isSelected ? "secondary" : "ghost"}
            className="w-full justify-start"
          >
            <span className="flex items-center gap-2 flex-1">
              {selectedChain}-{network}
            </span>
            {isSelected && <Check className="h-4 w-4" />}
          </Button>
        );
      })}
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-48">
            {selectedChain}-{selectedNetwork}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Network</DialogTitle>
            <DialogDescription>Choose a network for {selectedChain}</DialogDescription>
          </DialogHeader>
          <NetworkList className="max-h-[60vh] overflow-y-auto px-1" />
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
          title={`${selectedChain}-${selectedNetwork}`}
        >
          <Network className="h-5 w-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Select Network</DrawerTitle>
          <DrawerDescription>Choose a network for {selectedChain}</DrawerDescription>
        </DrawerHeader>
        <NetworkList className="px-4 pb-4 max-h-[60vh] overflow-y-auto" />
        <DrawerFooter className="pt-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
